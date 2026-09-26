import { NextRequest, NextResponse } from "next/server";

import {
  assertOwnership,
  AuthError,
  requireUser,
} from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { tolleranzaCheckIn, valutaFinestraCheckIn } from "@/lib/prenotazioni-regole";
import { criticalApiRateLimiter } from "@/lib/rate-limit";

function errorResponse(error: unknown) {
  if (error instanceof AuthError) {
    return NextResponse.json(
      { success: false, code: error.code, error: error.message },
      { status: error.status },
    );
  }

  console.error("Errore durante il check-in:", error);
  return NextResponse.json(
    { success: false, error: "Errore interno del server" },
    { status: 500 },
  );
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();

    // Rate limiting DOPO l'autenticazione, stesso limitatore e stesso schema
    // gia' usato dal case "check-in" della PATCH /api/prenotazioni/[id] (vedi
    // quel file): sono due percorsi verso la STESSA azione critica, quindi
    // devono condividere il limitatore invece di lasciare questo secondo
    // percorso scoperto (prima lo era: nessun limite qui, mentre la PATCH ne
    // aveva gia' uno).
    const rateLimitResult = await criticalApiRateLimiter(request);
    if (rateLimitResult) return rateLimitResult;

    const { id: prenotazioneId } = await context.params;

    // Hardening M-2 (audit sicurezza 2026-09-04): il body PUO' contenere un
    // `timestamp` inviato dal client, ma NON deve MAI influenzare le decisioni
    // del server. Prima veniva usato sia per la finestra "troppo presto/scaduto"
    // sia scritto in `checkInAt`: un client poteva così forzare un check-in
    // fuori orario o falsare l'istante registrato. Ora `timestamp` viene solo
    // letto e, se presente, loggato a fini diagnostici — mai usato per la logica
    // né persistito.
    const body = await request.json().catch(() => ({}));
    const timestampClient: unknown = body?.timestamp;
    if (timestampClient !== undefined) {
      console.info(
        `[check-in] timestamp client ignorato per prenotazione ${prenotazioneId}:`,
        timestampClient,
      );
    }

    const prenotazione = await prisma.prenotazione.findUnique({
      where: { id: prenotazioneId },
      include: { user: true, posto: { include: { sala: true } } },
    });

    if (!prenotazione) {
      return NextResponse.json(
        { success: false, error: "Prenotazione non trovata" },
        { status: 404 },
      );
    }

    assertOwnership(prenotazione, user);

    // Una voce ListaAttesa non e' una Prenotazione; inoltre solo CONFERMATA e' ammessa.
    if (prenotazione.stato !== "CONFERMATA") {
      return NextResponse.json(
        {
          success: false,
          code: "STATO_CHECK_IN_NON_VALIDO",
          error: `Impossibile effettuare il check-in. Stato attuale: ${prenotazione.stato}`,
        },
        { status: 422 },
      );
    }

    // L'istante di riferimento e' SEMPRE l'orologio del server: nessun input
    // del client puo' spostarlo. Usato sia per i controlli sulla finestra di
    // check-in sia per il valore persistito in `checkInAt`.
    const now = new Date();

    // BUG STORICO CORRETTO QUI (verificato dal vivo, sempre 400 "troppo
    // presto"): la vecchia `istanteInizio()` ricomponeva l'istante con
    // `Date.UTC(..., oraInizio.getUTCHours(), ...)`, trattando le cifre di
    // Roma salvate in `oraInizio` come se fossero gia' UTC, senza applicare
    // l'offset Europe/Rome. `valutaFinestraCheckIn` confronta invece sempre
    // nel fuso della biblioteca (vedi src/lib/prenotazioni-regole.ts).
    //
    // Finestra UNICA (collaudo dal vivo, settembre 2026): la tolleranza DOPO
    // l'inizio e' la STESSA dello scanner del bibliotecario, passata qui in
    // modo esplicito invece di affidarsi al default della funzione — vedi il
    // commento su `TOLLERANZA_CHECK_IN_MINUTI`. `tolleranzaCheckIn` la estende
    // a `MARGINE_PENDOLARE_MINUTI` quando questa prenotazione ha il margine
    // pendolare attivo (`prenotazione.marginePendolare`, letto dal DB qui
    // sopra — mai da un booleano del client): vedi il commento su
    // `MARGINE_PENDOLARE_MINUTI` in prenotazioni-regole.ts.
    const esito = valutaFinestraCheckIn(
      prenotazione.data,
      prenotazione.oraInizio,
      now,
      tolleranzaCheckIn(prenotazione),
    );
    if (!esito.consentito && esito.motivo === "scaduto") {
      return NextResponse.json(
        { success: false, error: "Il periodo di check-in è scaduto" },
        { status: 400 },
      );
    }
    if (!esito.consentito && esito.motivo === "troppo_presto") {
      return NextResponse.json(
        { success: false, error: "È troppo presto per effettuare il check-in" },
        { status: 400 },
      );
    }

    const prenotazioneAggiornata = await prisma.prenotazione.update({
      where: { id: prenotazioneId },
      data: { stato: "CHECK_IN", checkInAt: now },
      include: { posto: { include: { sala: true } } },
    });
    await prisma.posto.update({
      where: { id: prenotazione.postoId },
      data: { stato: "OCCUPATO" },
    });

    return NextResponse.json({
      success: true,
      message: "Check-in effettuato con successo",
      prenotazione: {
        id: prenotazioneAggiornata.id,
        stato: prenotazioneAggiornata.stato,
        posto: {
          numero: prenotazioneAggiornata.posto.numero,
          sala: prenotazioneAggiornata.posto.sala.nome,
          piano: prenotazioneAggiornata.posto.sala.piano,
        },
        oraInizio: prenotazioneAggiornata.oraInizio,
        oraFine: prenotazioneAggiornata.oraFine,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
