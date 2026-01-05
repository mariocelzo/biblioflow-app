import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/prisma";
import { validateScannedQR } from "@/lib/qr-signature";

export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    // Verifica autenticazione e ruolo
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: "Non autenticato" },
        { status: 401 }
      );
    }

    if (session.user.ruolo !== "BIBLIOTECARIO" && session.user.ruolo !== "ADMIN") {
      return NextResponse.json(
        { success: false, error: "Accesso negato: solo bibliotecari" },
        { status: 403 }
      );
    }

    const { qrCode } = await request.json();

    if (!qrCode) {
      return NextResponse.json(
        { success: false, error: "QR Code mancante" },
        { status: 400 }
      );
    }

    // Valida QR Code (firma e scadenza)
    const validation = validateScannedQR(qrCode);
    
    if (!validation.valid) {
      return NextResponse.json(
        { 
          success: false, 
          error: validation.error,
          type: validation.errorType,
        },
        { status: 400 }
      );
    }

    const { payload } = validation;

    // Verifica che la prenotazione esista e sia valida
    const prenotazione = await db.prenotazione.findUnique({
      where: { id: payload!.prenotazioneId },
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
            sala: {
              select: {
                nome: true,
                piano: true,
              },
            },
          },
        },
      },
    });

    if (!prenotazione) {
      return NextResponse.json(
        { success: false, error: "Prenotazione non trovata", type: "not_found" },
        { status: 404 }
      );
    }

    // Verifica che l'utente corrisponda
    if (prenotazione.userId !== payload!.userId) {
      return NextResponse.json(
        { success: false, error: "QR Code non valido per questa prenotazione", type: "user_mismatch" },
        { status: 400 }
      );
    }

    // Verifica stato prenotazione
    if (prenotazione.stato === "CANCELLATA") {
      return NextResponse.json(
        { success: false, error: "Prenotazione annullata", type: "cancelled" },
        { status: 400 }
      );
    }

    if (prenotazione.stato === "SCADUTA") {
      return NextResponse.json(
        { success: false, error: "Prenotazione scaduta", type: "expired_booking" },
        { status: 400 }
      );
    }

    if (prenotazione.stato === "CHECK_IN" || prenotazione.stato === "COMPLETATA") {
      return NextResponse.json(
        { 
          success: false, 
          error: "Check-in già effettuato", 
          type: "already_checked_in",
          data: {
            checkInAt: prenotazione.checkInAt,
            user: prenotazione.user,
            posto: prenotazione.posto,
          }
        },
        { status: 400 }
      );
    }

    // Verifica che sia oggi
    const oggi = new Date();
    oggi.setHours(0, 0, 0, 0);
    const dataPrenotazione = new Date(prenotazione.data);
    dataPrenotazione.setHours(0, 0, 0, 0);

    if (dataPrenotazione.getTime() !== oggi.getTime()) {
      return NextResponse.json(
        { 
          success: false, 
          error: `La prenotazione è per il ${dataPrenotazione.toLocaleDateString("it-IT")}`, 
          type: "wrong_date" 
        },
        { status: 400 }
      );
    }

    // Verifica orario (può fare check-in da 15 min prima fino a 15 min dopo l'inizio)
    const now = new Date();
    const oraInizio = new Date(`1970-01-01T${prenotazione.oraInizio}`);
    const oraInizioOggi = new Date(oggi);
    oraInizioOggi.setHours(oraInizio.getHours(), oraInizio.getMinutes());
    
    const diffMinuti = (now.getTime() - oraInizioOggi.getTime()) / 1000 / 60;
    
    if (diffMinuti < -15) {
      const minutiMancanti = Math.abs(Math.floor(diffMinuti + 15));
      return NextResponse.json(
        { 
          success: false, 
          error: `Troppo presto per il check-in. Riprova tra ${minutiMancanti} minuti`, 
          type: "too_early" 
        },
        { status: 400 }
      );
    }

    if (diffMinuti > 15) {
      return NextResponse.json(
        { 
          success: false, 
          error: "Check-in scaduto. La prenotazione è stata annullata", 
          type: "too_late" 
        },
        { status: 400 }
      );
    }

    // Effettua il check-in
    const prenotazioneAggiornata = await db.prenotazione.update({
      where: { id: prenotazione.id },
      data: {
        stato: "CHECK_IN",
        checkInAt: new Date(),
      },
    });

    // Aggiorna stato posto
    await db.posto.update({
      where: { id: prenotazione.postoId },
      data: { stato: "OCCUPATO" },
    });

    // Log evento
    await db.logEvento.create({
      data: {
        userId: prenotazione.userId,
        tipo: "CHECK_IN",
        prenotazioneId: prenotazione.id,
        dettagli: {
          posto: `${prenotazione.posto.sala.nome} - ${prenotazione.posto.numero}`,
          scannatoDa: session.user.id,
          scannatoDaNome: `${session.user.nome} ${session.user.cognome}`,
          metodo: "scanner_bibliotecario",
        },
      },
    });

    // Crea notifica per l'utente
    await db.notifica.create({
      data: {
        userId: prenotazione.userId,
        tipo: "PRENOTAZIONE",
        titolo: "Check-in effettuato",
        messaggio: `Check-in completato per ${prenotazione.posto.sala.nome} - Posto ${prenotazione.posto.numero}`,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Check-in effettuato con successo!",
      data: {
        prenotazione: prenotazioneAggiornata,
        user: prenotazione.user,
        posto: prenotazione.posto,
      },
    });

  } catch (error) {
    console.error("Errore validazione QR:", error);
    return NextResponse.json(
      { success: false, error: "Errore interno del server" },
      { status: 500 }
    );
  }
}
