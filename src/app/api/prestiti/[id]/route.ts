import type { StatoPrestito } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

import { assertOwnership, AuthError, isStaff, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// Mappa gli errori applicativi sullo status corretto (stessa logica di
// src/app/api/prenotazioni/[id]/route.ts). Un AuthError deve propagare il suo
// status 401/403/404 invece di finire in un generico 500.
function errorResponse(error: unknown, fallback: string) {
  if (error instanceof AuthError) {
    return NextResponse.json(
      { success: false, code: error.code, error: error.message },
      { status: error.status },
    );
  }

  console.error(fallback, error);
  return NextResponse.json(
    { success: false, error: fallback },
    { status: 500 },
  );
}

// INTEGRITA' DATI: un prestito RINNOVATO e' ancora un prestito in corso, esatta-
// mente come un ATTIVO. Filtrare solo su "ATTIVO" faceva sparire i prestiti
// rinnovati da ogni controllo a valle (secondo rinnovo, anti-duplicato, tetto
// dei 5 prestiti, calcolo dello scaduto). Si mantiene lo stato RINNOVATO perche'
// e' un'informazione gia' usata dalla UI (src/app/prestiti/page.tsx filtra su
// ["ATTIVO", "RINNOVATO"] e l'area admin offre il filtro "Rinnovato"): la
// correzione allinea i filtri lato server invece di buttare via il dato.
const STATI_PRESTITO_IN_CORSO: readonly StatoPrestito[] = ["ATTIVO", "RINNOVATO"];

// C-3: verifica che il chiamante possa operare sul prestito indicato.
// - lo staff (BIBLIOTECARIO/ADMIN) puo' agire su qualunque prestito (banco);
// - allo studente non proprietario assertOwnership nasconde la risorsa con 404.
function assertPrestitoAccessibile(
  prestito: { userId: string },
  user: Awaited<ReturnType<typeof requireUser>>,
) {
  if (isStaff(user.ruolo)) {
    return;
  }
  assertOwnership(prestito, user);
}

// Campi utente verso lo studente: senza email/matricola (dato personale).
const USER_SELECT_STUDENTE = { id: true, nome: true, cognome: true } as const;
const USER_SELECT_STAFF = {
  id: true,
  nome: true,
  cognome: true,
  email: true,
  matricola: true,
} as const;

// GET /api/prestiti/[id] - Dettaglio prestito
export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    // C-3: era pubblico. Ora serve una sessione e la proprieta' del prestito.
    const user = await requireUser();
    const { id } = await params;
    const staff = isStaff(user.ruolo);

    const prestito = await prisma.prestito.findUnique({
      where: { id },
      include: {
        user: {
          select: staff ? USER_SELECT_STAFF : USER_SELECT_STUDENTE,
        },
        libro: true,
      },
    });

    if (!prestito) {
      return NextResponse.json(
        { success: false, error: "Prestito non trovato" },
        { status: 404 }
      );
    }

    // Studente non proprietario -> 404 (la risorsa "non esiste" per lui).
    assertPrestitoAccessibile(prestito, user);

    // Calcola giorni rimanenti
    const oggi = new Date();
    const scadenza = new Date(prestito.dataScadenza);
    const diffTime = scadenza.getTime() - oggi.getTime();
    const giorniRimanenti = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    return NextResponse.json({
      success: true,
      data: {
        ...prestito,
        giorniRimanenti,
        // Anche un prestito RINNOVATO puo' andare in ritardo: escluderlo lo
        // faceva sparire dai solleciti.
        isScaduto: giorniRimanenti < 0 && STATI_PRESTITO_IN_CORSO.includes(prestito.stato),
        inScadenza:
          giorniRimanenti >= 0 &&
          giorniRimanenti <= 3 &&
          STATI_PRESTITO_IN_CORSO.includes(prestito.stato),
      },
    });
  } catch (error) {
    return errorResponse(error, "Errore nel recupero del prestito");
  }
}

// PATCH /api/prestiti/[id] - Aggiorna prestito (restituzione, rinnovo)
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    // C-3: era pubblico. Ora serve una sessione e la proprieta' del prestito.
    const user = await requireUser();
    const { id } = await params;
    const body = await request.json();

    const { azione } = body;

    // Verifica che il prestito esista
    const prestito = await prisma.prestito.findUnique({
      where: { id },
      include: { libro: true },
    });

    if (!prestito) {
      return NextResponse.json(
        { success: false, error: "Prestito non trovato" },
        { status: 404 }
      );
    }

    // Solo il proprietario (o lo staff) puo' restituire/rinnovare il prestito.
    assertPrestitoAccessibile(prestito, user);

    let updateData: Record<string, unknown> = {};
    let logDescrizione: string;

    switch (azione) {
      case "restituisci":
        // INTEGRITA' DATI: la restituzione e' un fatto FISICO che avviene al
        // banco, quindi la registra solo lo staff. Prima poteva farlo anche lo
        // studente proprietario: bastava dichiarare restituito un libro tenuto
        // in mano perche' `copieDisponibili` venisse incrementato e il catalogo
        // mostrasse una copia disponibile inesistente, che un altro utente
        // poteva poi prendere in prestito. Esiste gia' l'endpoint staff-only
        // equivalente /api/admin/prestiti (azione RESTITUISCI): la stessa
        // operazione non puo' avere due percorsi con autorizzazioni diverse.
        // Allo studente resta il rinnovo, unica azione self-service legittima.
        if (!isStaff(user.ruolo)) {
          return NextResponse.json(
            {
              success: false,
              code: "RESTITUZIONE_RISERVATA_STAFF",
              error:
                "La restituzione va registrata dal personale della biblioteca al momento della riconsegna",
            },
            { status: 403 }
          );
        }

        if (!STATI_PRESTITO_IN_CORSO.includes(prestito.stato)) {
          return NextResponse.json(
            { success: false, error: "Questo prestito non è attivo" },
            { status: 400 }
          );
        }

        // Restituisci in transazione
        await prisma.$transaction(async (tx) => {
          // Aggiorna stato prestito
          await tx.prestito.update({
            where: { id },
            data: {
              stato: "RESTITUITO",
              dataRestituzione: new Date(),
            },
          });

          // Incrementa copie disponibili
          await tx.libro.update({
            where: { id: prestito.libroId },
            data: { copieDisponibili: { increment: 1 } },
          });
        });

        logDescrizione = `Libro "${prestito.libro.titolo}" restituito`;

        // Crea log evento
        await prisma.logEvento.create({
          data: {
            tipo: "PRESTITO_RESTITUITO",
            userId: prestito.userId,
            descrizione: logDescrizione,
          },
        });

        const prestitoRestituito = await prisma.prestito.findUnique({
          where: { id },
          include: {
            user: { select: { id: true, nome: true, cognome: true } },
            libro: { select: { id: true, titolo: true, autore: true } },
          },
        });

        return NextResponse.json({
          success: true,
          data: prestitoRestituito,
          message: logDescrizione,
        });

      case "rinnova":
        // Un prestito gia' rinnovato resta rinnovabile finche' non esaurisce
        // maxRinnovi: senza questo, il secondo rinnovo era irraggiungibile.
        if (!STATI_PRESTITO_IN_CORSO.includes(prestito.stato)) {
          return NextResponse.json(
            { success: false, error: "Questo prestito non è attivo" },
            { status: 400 }
          );
        }

        if (prestito.rinnovi >= prestito.maxRinnovi) {
          return NextResponse.json(
            { success: false, error: `Hai raggiunto il limite massimo di ${prestito.maxRinnovi} rinnovi` },
            { status: 400 }
          );
        }

        // DUE VERITA' SULLA DURATA DEL RINNOVO (integrita' dati): questa azione
        // PATCH estendeva di 30 giorni, mentre POST /api/prestiti/[id]/rinnova
        // — l'endpoint che la UI chiama DAVVERO (src/app/prestiti/page.tsx,
        // handleRinnova) — estende di 14, coerente col testo mostrato
        // all'utente ("Il prestito sarà esteso di 14 giorni dalla data
        // attuale"). Nessun client dell'app usa questa variante PATCH (nessun
        // `fetch` verso `/api/prestiti/[id]` con `azione: "rinnova"`), ma non
        // e' codice morto: resta parte della superficie API pubblica ed e'
        // esercitata da test che verificano comportamento e autorizzazioni
        // (tests/unit/prestiti-stato-rinnovato.test.ts TC-INT-RINN-004,
        // tests/integration/auth-baseline-acl.test.ts TC-SEC-ACL-011). Si
        // allinea quindi la durata a 14 giorni invece di rimuovere l'azione:
        // chi chiamasse questa PATCH otterrebbe la stessa estensione promessa
        // dalla UI, invece di un'estensione doppia e non documentata.
        const nuovaScadenza = new Date();
        nuovaScadenza.setDate(nuovaScadenza.getDate() + 14);

        updateData = {
          dataScadenza: nuovaScadenza,
          rinnovi: { increment: 1 },
          stato: "RINNOVATO",
        };

        logDescrizione = `Prestito rinnovato per "${prestito.libro.titolo}". Rinnovo ${prestito.rinnovi + 1}/${prestito.maxRinnovi}`;
        break;

      default:
        return NextResponse.json(
          { success: false, error: "Azione non valida. Usa: restituisci, rinnova" },
          { status: 400 }
        );
    }

    // Aggiorna prestito
    const prestitoAggiornato = await prisma.prestito.update({
      where: { id },
      data: updateData,
      include: {
        user: { select: { id: true, nome: true, cognome: true } },
        libro: { select: { id: true, titolo: true, autore: true } },
      },
    });

    // Crea notifica per rinnovo
    if (azione === "rinnova") {
      await prisma.notifica.create({
        data: {
          userId: prestito.userId,
          tipo: "SCADENZA_PRESTITO",
          titolo: "Prestito rinnovato",
          messaggio: `Il prestito di "${prestito.libro.titolo}" è stato rinnovato. Nuova scadenza: ${(updateData.dataScadenza as Date).toLocaleDateString("it-IT")}`,
          actionUrl: "/prestiti",
          actionLabel: "Vedi prestiti",
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: prestitoAggiornato,
      message: logDescrizione,
    });

  } catch (error) {
    return errorResponse(error, "Errore nell'aggiornamento del prestito");
  }
}
