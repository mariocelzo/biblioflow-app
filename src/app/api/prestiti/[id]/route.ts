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
        isScaduto: giorniRimanenti < 0 && prestito.stato === "ATTIVO",
        inScadenza: giorniRimanenti >= 0 && giorniRimanenti <= 3 && prestito.stato === "ATTIVO",
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
        if (prestito.stato !== "ATTIVO") {
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
        if (prestito.stato !== "ATTIVO") {
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

        // Calcola nuova scadenza (30 giorni da oggi)
        const nuovaScadenza = new Date();
        nuovaScadenza.setDate(nuovaScadenza.getDate() + 30);

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
