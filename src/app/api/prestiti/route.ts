import { NextRequest, NextResponse } from "next/server";

import { AuthError, isStaff, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { readApiRateLimiter, loanRequestRateLimiter } from "@/lib/rate-limit";

// Mappa gli errori applicativi sullo status corretto, replicando la logica gia'
// usata in src/app/api/prenotazioni/route.ts (dove errorResponse e' privato).
// PERCHE': un AuthError deve tornare 401/403/404 e non essere mascherato da un
// generico 500.
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

// Campi utente esposti allo studente: NON includono dati personali sensibili
// (email, matricola). Lo staff (BIBLIOTECARIO/ADMIN) puo' invece vederli perche'
// gestisce i prestiti al banco.
const USER_SELECT_STUDENTE = {
  id: true,
  nome: true,
  cognome: true,
} as const;

const USER_SELECT_STAFF = {
  id: true,
  nome: true,
  cognome: true,
  email: true,
  matricola: true,
} as const;

// GET /api/prestiti - Lista prestiti
export async function GET(request: NextRequest) {
  try {
    // C-3: l'endpoint era completamente pubblico. Ora richiede una sessione.
    const user = await requireUser();

    // Rate limiting: 300 req/min per letture
    const rateLimitResult = await readApiRateLimiter(request);
    if (rateLimitResult) return rateLimitResult;

    const { searchParams } = new URL(request.url);

    // Parametri di filtro
    const userId = searchParams.get("userId");
    const libroId = searchParams.get("libroId");
    const stato = searchParams.get("stato");
    const scaduti = searchParams.get("scaduti"); // true per mostrare solo scaduti

    const where: Record<string, unknown> = {};

    const staff = isStaff(user.ruolo);

    // C-3: lo studente vede ESCLUSIVAMENTE i propri prestiti; il parametro
    // ?userId= viene ignorato per evitare IDOR. Solo lo staff puo' filtrare per
    // un utente arbitrario.
    if (staff) {
      if (userId) {
        where.userId = userId;
      }
    } else {
      where.userId = user.id;
    }

    if (libroId) {
      where.libroId = libroId;
    }

    if (stato) {
      where.stato = stato;
    }

    if (scaduti === "true") {
      where.dataScadenza = { lt: new Date() };
      where.stato = "ATTIVO";
    }

    const prestiti = await prisma.prestito.findMany({
      where,
      include: {
        // Verso lo studente non trapelano email/matricola dell'intestatario.
        user: {
          select: staff ? USER_SELECT_STAFF : USER_SELECT_STUDENTE,
        },
        libro: {
          select: {
            id: true,
            isbn: true,
            titolo: true,
            autore: true,
            categoria: true,
            scaffale: true,
            piano: true,
          },
        },
      },
      orderBy: [
        { dataScadenza: "asc" },
        { dataPrestito: "desc" },
      ],
    });

    // Aggiungi informazioni sui giorni rimanenti
    const prestitiConInfo = prestiti.map((p) => {
      const oggi = new Date();
      const scadenza = new Date(p.dataScadenza);
      const diffTime = scadenza.getTime() - oggi.getTime();
      const giorniRimanenti = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      return {
        ...p,
        giorniRimanenti,
        isScaduto: giorniRimanenti < 0 && p.stato === "ATTIVO",
        inScadenza: giorniRimanenti >= 0 && giorniRimanenti <= 3 && p.stato === "ATTIVO",
      };
    });

    return NextResponse.json({
      success: true,
      data: prestitiConInfo,
      count: prestitiConInfo.length,
    });
  } catch (error) {
    return errorResponse(error, "Errore nel recupero dei prestiti");
  }
}

// POST /api/prestiti - Crea nuovo prestito
export async function POST(request: NextRequest) {
  try {
    // C-3: l'endpoint era pubblico e si fidava di body.userId. Ora richiede una
    // sessione e ricava l'intestatario dall'identita' autenticata.
    const user = await requireUser();

    // Rate limiting: max 5 richieste prestito al giorno
    const rateLimitResult = await loanRequestRateLimiter(request);
    if (rateLimitResult) return rateLimitResult;

    const body = await request.json();

    const { libroId, durataDays = 30 } = body;

    // L'identita' del richiedente e' SEMPRE quella di sessione. Solo lo staff
    // puo' registrare un prestito per conto di un altro utente passando
    // body.userId (prestito al banco); per tutti gli altri body.userId e' ignorato.
    const userId =
      isStaff(user.ruolo) && typeof body.userId === "string" && body.userId
        ? body.userId
        : user.id;

    // Validazione campi obbligatori (userId ora deriva sempre dalla sessione)
    if (!libroId) {
      return NextResponse.json(
        { success: false, error: "Campi obbligatori mancanti: libroId" },
        { status: 400 }
      );
    }

    // Verifica che l'utente esista
    const utente = await prisma.user.findUnique({ where: { id: userId } });
    if (!utente) {
      return NextResponse.json(
        { success: false, error: "Utente non trovato" },
        { status: 404 }
      );
    }

    // Verifica che il libro esista e sia disponibile
    const libro = await prisma.libro.findUnique({ where: { id: libroId } });
    if (!libro) {
      return NextResponse.json(
        { success: false, error: "Libro non trovato" },
        { status: 404 }
      );
    }

    if (libro.copieDisponibili <= 0) {
      return NextResponse.json(
        { success: false, error: "Nessuna copia disponibile per questo libro" },
        { status: 409 }
      );
    }

    // Verifica che l'utente non abbia già questo libro in prestito
    const prestitoEsistente = await prisma.prestito.findFirst({
      where: {
        userId,
        libroId,
        stato: "ATTIVO",
      },
    });

    if (prestitoEsistente) {
      return NextResponse.json(
        { success: false, error: "Hai già questo libro in prestito" },
        { status: 409 }
      );
    }

    // Verifica limite prestiti (max 5 contemporanei)
    const prestitiAttivi = await prisma.prestito.count({
      where: {
        userId,
        stato: "ATTIVO",
      },
    });

    if (prestitiAttivi >= 5) {
      return NextResponse.json(
        { success: false, error: "Hai raggiunto il limite massimo di 5 prestiti contemporanei" },
        { status: 409 }
      );
    }

    // Calcola data scadenza
    const dataScadenza = new Date();
    dataScadenza.setDate(dataScadenza.getDate() + durataDays);

    // Crea il prestito in una transazione
    const prestito = await prisma.$transaction(async (tx) => {
      // Decrementa copie disponibili
      await tx.libro.update({
        where: { id: libroId },
        data: { copieDisponibili: { decrement: 1 } },
      });

      // Crea prestito
      const newPrestito = await tx.prestito.create({
        data: {
          userId,
          libroId,
          dataScadenza,
          stato: "ATTIVO",
        },
        include: {
          user: {
            select: {
              id: true,
              nome: true,
              cognome: true,
              email: true,
            },
          },
          libro: {
            select: {
              id: true,
              titolo: true,
              autore: true,
            },
          },
        },
      });

      return newPrestito;
    });

    // Crea log evento
    await prisma.logEvento.create({
      data: {
        tipo: "PRESTITO_CREATO",
        userId,
        descrizione: `Prestito libro "${libro.titolo}"`,
      },
    });

    // Crea notifica
    await prisma.notifica.create({
      data: {
        userId,
        tipo: "SCADENZA_PRESTITO",
        titolo: "Nuovo prestito registrato",
        messaggio: `Hai preso in prestito "${libro.titolo}". Scadenza: ${dataScadenza.toLocaleDateString("it-IT")}`,
        actionUrl: "/prestiti",
        actionLabel: "Vedi prestiti",
      },
    });

    return NextResponse.json({
      success: true,
      data: prestito,
    }, { status: 201 });

  } catch (error) {
    return errorResponse(error, "Errore nella creazione del prestito");
  }
}
