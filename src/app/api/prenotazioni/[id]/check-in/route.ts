import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    // Verifica autenticazione
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Non autenticato" },
        { status: 401 }
      );
    }

    const { id: prenotazioneId } = await context.params;
    const body = await request.json();
    const { timestamp } = body;

    // Trova la prenotazione
    const prenotazione = await prisma.prenotazione.findUnique({
      where: { id: prenotazioneId },
      include: {
        user: true,
        posto: {
          include: {
            sala: true,
          },
        },
      },
    });

    if (!prenotazione) {
      return NextResponse.json(
        { error: "Prenotazione non trovata" },
        { status: 404 }
      );
    }

    // Verifica che la prenotazione appartenga all'utente
    if (prenotazione.userId !== session.user.id) {
      return NextResponse.json(
        { error: "Non autorizzato" },
        { status: 403 }
      );
    }

    // Verifica che la prenotazione sia in stato CONFERMATA
    if (prenotazione.stato !== "CONFERMATA") {
      return NextResponse.json(
        { error: `Impossibile effettuare il check-in. Stato attuale: ${prenotazione.stato}` },
        { status: 400 }
      );
    }

    // Verifica che il check-in sia nel periodo valido
    const now = new Date(timestamp || Date.now());
    const oraInizio = new Date(prenotazione.oraInizio);
    const checkInScadenza = new Date(oraInizio.getTime() - 15 * 60 * 1000); // 15 minuti prima
    
    if (now > oraInizio) {
      return NextResponse.json(
        { error: "Il periodo di check-in è scaduto" },
        { status: 400 }
      );
    }

    if (now < checkInScadenza) {
      return NextResponse.json(
        { error: "È troppo presto per effettuare il check-in" },
        { status: 400 }
      );
    }

    // Aggiorna lo stato della prenotazione a CHECK_IN
    const prenotazioneAggiornata = await prisma.prenotazione.update({
      where: { id: prenotazioneId },
      data: {
        stato: "CHECK_IN",
        checkInAt: now,
      },
      include: {
        posto: {
          include: {
            sala: true,
          },
        },
      },
    });

    // Aggiorna lo stato del posto a OCCUPATO
    await prisma.posto.update({
      where: { id: prenotazione.postoId },
      data: {
        stato: "OCCUPATO",
      },
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
    console.error("Errore durante il check-in:", error);
    return NextResponse.json(
      { error: "Errore interno del server" },
      { status: 500 }
    );
  }
}
