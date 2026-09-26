import { NextRequest, NextResponse } from "next/server";
import { StatoPrenotazione } from "@prisma/client";

import { AuthError, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  creaPrenotazioneAtomica,
  PrenotazioneError,
} from "@/lib/prenotazioni-service";
import { bookingRateLimiter, readApiRateLimiter } from "@/lib/rate-limit";

function errorResponse(error: unknown, fallback: string) {
  if (error instanceof AuthError) {
    return NextResponse.json(
      { success: false, code: error.code, error: error.message },
      { status: error.status },
    );
  }

  if (error instanceof PrenotazioneError) {
    return NextResponse.json(
      { success: false, ...error.toResponseBody() },
      { status: error.status },
    );
  }

  console.error(fallback, error);
  return NextResponse.json(
    { success: false, error: fallback },
    { status: 500 },
  );
}

// GET /api/prenotazioni - restituisce esclusivamente le prenotazioni della sessione.
export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    const rateLimitResult = await readApiRateLimiter(request);
    if (rateLimitResult) return rateLimitResult;

    const { searchParams } = new URL(request.url);
    const postoId = searchParams.get("postoId");
    const stato = searchParams.get("stato");
    const data = searchParams.get("data");
    const dataInizio = searchParams.get("dataInizio");
    const dataFine = searchParams.get("dataFine");
    // Il filtro `stato` finisce in una `where` su una colonna enum: se il
    // valore non appartiene a `StatoPrenotazione`, Prisma lancia un errore di
    // validazione che il catch qui sotto trasformerebbe in un 500 "guasto del
    // server". Ma la richiesta non e' un guasto: e' un input sbagliato, e il
    // client deve poterlo capire e correggere. 422 = sintassi valida, valore
    // non ammesso (stesso criterio della PATCH di /api/admin/richieste).
    if (stato && !Object.values(StatoPrenotazione).includes(stato as StatoPrenotazione)) {
      return NextResponse.json(
        {
          success: false,
          error: `Stato non valido. Valori ammessi: ${Object.values(StatoPrenotazione).join(", ")}`,
        },
        { status: 422 },
      );
    }

    const where: Record<string, unknown> = { userId: user.id };

    if (postoId) where.postoId = postoId;
    if (stato) where.stato = stato;

    if (data) {
      const dataDate = new Date(`${data}T00:00:00.000Z`);
      const nextDay = new Date(dataDate);
      nextDay.setUTCDate(nextDay.getUTCDate() + 1);
      where.data = { gte: dataDate, lt: nextDay };
    } else if (dataInizio || dataFine) {
      const intervallo: Record<string, Date> = {};
      if (dataInizio) intervallo.gte = new Date(dataInizio);
      if (dataFine) intervallo.lte = new Date(dataFine);
      where.data = intervallo;
    }

    const prenotazioni = await prisma.prenotazione.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            nome: true,
            cognome: true,
            email: true,
            matricola: true,
          },
        },
        posto: {
          select: {
            id: true,
            numero: true,
            haPresaElettrica: true,
            haFinestra: true,
            isAccessibile: true,
            sala: { select: { id: true, nome: true, piano: true } },
          },
        },
      },
      orderBy: [{ data: "desc" }, { oraInizio: "asc" }],
    });

    return NextResponse.json({
      success: true,
      data: prenotazioni,
      count: prenotazioni.length,
    });
  } catch (error) {
    return errorResponse(error, "Errore nel recupero delle prenotazioni");
  }
}

// POST /api/prenotazioni - crea usando sempre l'identita' della sessione.
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();

    // Rate limiting DOPO l'autenticazione, stesso schema delle altre route
    // critiche (vedi PATCH/DELETE /api/prenotazioni/[id], POST
    // /api/prenotazioni/coda): autorizzare prima evita che un anonimo consumi
    // la quota di qualcun altro (la chiave del limite e' l'IP, non l'utente);
    // il limite stesso protegge l'account autenticato da chi tenta di creare
    // prenotazioni a raffica (es. per intasare i posti disponibili). Dieci
    // ogni 30 minuti (vedi bookingRateLimiter, src/lib/rate-limit.ts) resta
    // ampio per l'uso legittimo, compreso chi sbaglia e ricrea subito una
    // prenotazione: un utente reale ne crea al piu' un paio a sessione.
    const rateLimitResult = await bookingRateLimiter(request);
    if (rateLimitResult) return rateLimitResult;

    const body = await request.json();
    const {
      postoId,
      data,
      oraInizio,
      oraFine,
      // NOTA (Margine Pendolare): `marginePendolare` qui e' solo la
      // PREFERENZA del client ("vorrei il margine"). Il server la concede
      // solo se `User.isPendolare` e' vero sul DATABASE — vedi
      // `creaPrenotazioneNellaTransazione` in prenotazioni-service.ts. Niente
      // `minutiMarginePendolare` dal body: i minuti sono SEMPRE la costante
      // server `MARGINE_PENDOLARE_MINUTI` (src/lib/prenotazioni-regole.ts),
      // altrimenti chiunque chiami questa API direttamente potrebbe darsi una
      // finestra di check-in lunga a piacere.
      marginePendolare,
      note,
    } = body;

    if (!postoId || !data || !oraInizio || !oraFine) {
      return NextResponse.json(
        {
          success: false,
          code: "CAMPI_OBBLIGATORI_MANCANTI",
          error: "Campi obbligatori mancanti: postoId, data, oraInizio, oraFine",
          suggerisciCoda: false,
        },
        { status: 422 },
      );
    }

    // Qualunque userId inviato dal client viene deliberatamente ignorato (CA-01).
    const creata = await creaPrenotazioneAtomica(
      {
        userId: user.id,
        postoId,
        data,
        oraInizio,
        oraFine,
        marginePendolare,
        note,
      },
      prisma,
    );

    const posto = await prisma.posto.findUnique({
      where: { id: creata.postoId },
      select: { numero: true },
    });

    await Promise.all([
      prisma.logEvento.create({
        data: {
          tipo: "PRENOTAZIONE_CREATA",
          userId: user.id,
          prenotazioneId: creata.id,
          descrizione: `Prenotazione creata per posto ${posto?.numero ?? creata.postoId}`,
        },
      }),
      prisma.notifica.create({
        data: {
          userId: user.id,
          tipo: "PRENOTAZIONE",
          titolo: "Prenotazione confermata",
          messaggio: `La prenotazione per il posto ${posto?.numero ?? creata.postoId} è stata confermata.`,
          actionUrl: "/prenotazioni",
          actionLabel: "Vedi prenotazione",
        },
      }),
    ]);

    return NextResponse.json({ success: true, data: creata }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "Errore nella creazione della prenotazione");
  }
}
