import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// POST /api/prestiti/[id]/rinnova - Rinnova un prestito
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Trova il prestito
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

    // Verifica che il prestito sia attivo
    if (prestito.stato !== "ATTIVO") {
      return NextResponse.json(
        { success: false, error: "Solo i prestiti attivi possono essere rinnovati" },
        { status: 400 }
      );
    }

    // Verifica numero rinnovi (max 2)
    const MAX_RINNOVI = prestito.maxRinnovi;
    if (prestito.rinnovi >= MAX_RINNOVI) {
      return NextResponse.json(
        { success: false, error: `Hai già effettuato il numero massimo di rinnovi (${MAX_RINNOVI})` },
        { status: 400 }
      );
    }

    // Calcola nuova data scadenza (aggiunge 14 giorni dalla data attuale)
    const oggi = new Date();
    const nuovaScadenza = new Date(oggi);
    nuovaScadenza.setDate(nuovaScadenza.getDate() + 14);

    // Aggiorna il prestito
    const prestitoAggiornato = await prisma.prestito.update({
      where: { id },
      data: {
        dataScadenza: nuovaScadenza,
        rinnovi: prestito.rinnovi + 1,
        stato: "RINNOVATO",
      },
      include: {
        libro: {
          select: {
            id: true,
            titolo: true,
            autore: true,
          },
        },
      },
    });

    // Crea notifica per l'utente
    await prisma.notifica.create({
      data: {
        userId: prestito.userId,
        tipo: "PRENOTAZIONE",
        titolo: "Prestito rinnovato",
        messaggio: `Il prestito di "${prestito.libro.titolo}" è stato rinnovato. Nuova scadenza: ${nuovaScadenza.toLocaleDateString("it-IT")}`,
        actionUrl: "/prestiti",
        actionLabel: "Vedi prestiti",
      },
    });

    return NextResponse.json({
      success: true,
      data: prestitoAggiornato,
      message: `Prestito rinnovato con successo. Nuova scadenza: ${nuovaScadenza.toLocaleDateString("it-IT")}`,
      rinnoviRimanenti: prestitoAggiornato.maxRinnovi - prestitoAggiornato.rinnovi,
    });
  } catch (error) {
    console.error("Errore POST /api/prestiti/[id]/rinnova:", error);
    return NextResponse.json(
      { success: false, error: "Errore nel rinnovo del prestito" },
      { status: 500 }
    );
  }
}
