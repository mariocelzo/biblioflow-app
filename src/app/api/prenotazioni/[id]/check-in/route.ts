import { NextRequest, NextResponse } from "next/server";

import {
  assertOwnership,
  AuthError,
  requireUser,
} from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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

function istanteInizio(data: Date, oraInizio: Date): Date {
  return new Date(
    Date.UTC(
      data.getUTCFullYear(),
      data.getUTCMonth(),
      data.getUTCDate(),
      oraInizio.getUTCHours(),
      oraInizio.getUTCMinutes(),
    ),
  );
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    const { id: prenotazioneId } = await context.params;
    const { timestamp } = await request.json();
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

    const now = new Date(timestamp ?? Date.now());
    if (Number.isNaN(now.getTime())) {
      return NextResponse.json(
        { success: false, error: "Timestamp non valido" },
        { status: 422 },
      );
    }

    const inizio = istanteInizio(prenotazione.data, prenotazione.oraInizio);
    const aperturaCheckIn = new Date(inizio.getTime() - 15 * 60 * 1000);
    if (now > inizio) {
      return NextResponse.json(
        { success: false, error: "Il periodo di check-in e' scaduto" },
        { status: 400 },
      );
    }
    if (now < aperturaCheckIn) {
      return NextResponse.json(
        { success: false, error: "E' troppo presto per effettuare il check-in" },
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
