import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/prisma";
import { validateScannedQR } from "@/lib/qr-signature";
import {
  dataCorrenteBiblioteca,
  tolleranzaCheckIn,
  valutaFinestraCheckIn,
} from "@/lib/prenotazioni-regole";

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
            // `stato` serve al controllo MANUTENZIONE piu' sotto: senza,
            // il check-in scriveva incondizionatamente OCCUPATO, cancellando
            // silenziosamente il flag di manutenzione impostato dallo staff.
            stato: true,
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

    // L'istante di riferimento e' SEMPRE l'orologio del server, condiviso da
    // entrambi i controlli qui sotto (giorno e finestra oraria).
    const now = new Date();

    // Verifica che sia oggi.
    //
    // BUG STORICO CORRETTO QUI (verificato dal vivo: fra mezzanotte e le 2 di
    // Roma lo scanner sbagliava giorno): `new Date(); setHours(0,0,0,0)`
    // azzera l'orario nel fuso LOCALE del PROCESSO (su Vercel/Node, UTC), non
    // in quello della biblioteca. Fra le 00:00 e le ~02:00 di Roma (l'offset
    // Europe/Rome e' ancora "domani" in UTC solo dopo mezzanotte UTC) il
    // giorno civile di Roma era gia' cambiato ma `oggi` restava ancorato al
    // giorno UTC precedente: una prenotazione di "oggi" (Roma) sembrava
    // "domani" e veniva rifiutata come `wrong_date`. `dataCorrenteBiblioteca`
    // (stessa funzione usata da `valutaFinestraCheckIn` per la finestra
    // oraria qui sotto) calcola il giorno civile nel fuso Europe/Rome, non in
    // quello del server.
    const oggiBiblioteca = dataCorrenteBiblioteca(now);

    if (prenotazione.data.getTime() !== oggiBiblioteca.getTime()) {
      return NextResponse.json(
        {
          success: false,
          error: `La prenotazione è per il ${prenotazione.data.toLocaleDateString("it-IT", { timeZone: "UTC" })}`,
          type: "wrong_date"
        },
        { status: 400 }
      );
    }

    // Verifica orario (può fare check-in da 15 min prima fino a 15 min dopo l'inizio)
    //
    // BUG STORICO CORRETTO QUI (verificato dal vivo: check-in SEMPRE riuscito,
    // a qualunque ora): `prenotazione.oraInizio` e' un oggetto Date (colonna
    // @db.Time letta cosi' da Prisma), non una stringa "HH:mm". Il vecchio
    // `` `1970-01-01T${prenotazione.oraInizio}` `` interpolava quindi
    // `Date.prototype.toString()` (es. "Thu Jan 01 1970 09:22:00 GMT+0000
    // (...)"), non parsabile da `new Date(...)` → Invalid Date → NaN ovunque
    // a valle → sia `diffMinuti < -15` sia `diffMinuti > 15` valutavano
    // sempre `false`: la finestra non veniva MAI applicata. `valutaFinestraCheckIn`
    // (condivisa anche con gli endpoint di check-in lato studente, vedi
    // src/lib/prenotazioni-regole.ts) legge direttamente le cifre UTC
    // dell'oggetto Date e confronta sempre nel fuso della biblioteca.
    //
    // Finestra UNICA (collaudo dal vivo, settembre 2026): la stessa
    // tolleranza DOPO l'inizio del check-in autonomo dello studente.
    // `tolleranzaCheckIn` la estende a MARGINE_PENDOLARE_MINUTI quando questa
    // prenotazione ha il margine pendolare attivo (`marginePendolare` letto
    // dal DB, mai da un valore del client) — vedi prenotazioni-regole.ts.
    const esito = valutaFinestraCheckIn(
      prenotazione.data,
      prenotazione.oraInizio,
      now,
      tolleranzaCheckIn(prenotazione),
    );

    if (!esito.consentito && esito.motivo === "troppo_presto") {
      const messaggioMinuti =
        esito.minutiMancanti !== undefined
          ? `. Riprova tra ${esito.minutiMancanti} minuti`
          : "";
      return NextResponse.json(
        {
          success: false,
          error: `Troppo presto per il check-in${messaggioMinuti}`,
          type: "too_early"
        },
        { status: 400 }
      );
    }

    if (!esito.consentito && esito.motivo === "scaduto") {
      // Il messaggio dichiara un annullamento: prima non veniva eseguito
      // nessun update e la prenotazione restava CONFERMATA con il posto mai
      // liberato (rilievo #4 dell'audit). Qui si annulla per davvero, con lo
      // stesso pattern gia' usato da ANNULLA_PRENOTAZIONI_SENZA_CHECKIN in
      // src/app/api/admin/anomalie/route.ts per lo stesso scenario (mancato
      // check-in oltre la finestra consentita): stato NO_SHOW, posto
      // liberato, log dell'evento e notifica all'utente.
      await db.prenotazione.update({
        where: { id: prenotazione.id },
        data: { stato: "NO_SHOW" },
      });

      await db.posto.update({
        where: { id: prenotazione.postoId },
        data: { stato: "DISPONIBILE" },
      });

      await db.logEvento.create({
        data: {
          tipo: "NO_SHOW",
          userId: prenotazione.userId,
          prenotazioneId: prenotazione.id,
          dettagli: {
            posto: `${prenotazione.posto.sala.nome} - ${prenotazione.posto.numero}`,
            automatico: true,
            motivo: "check_in_scaduto",
            rilevatoDa: session.user.id,
          },
        },
      });

      await db.notifica.create({
        data: {
          userId: prenotazione.userId,
          tipo: "SISTEMA",
          titolo: "Prenotazione annullata",
          messaggio: `La tua prenotazione per il posto ${prenotazione.posto.numero} è stata annullata per mancato check-in.`,
        },
      });

      return NextResponse.json(
        {
          success: false,
          error: "Check-in scaduto. La prenotazione è stata annullata",
          type: "too_late"
        },
        { status: 400 }
      );
    }

    // INTEGRITA' DATI: un posto in MANUTENZIONE non e' fisicamente
    // utilizzabile. PRIMA questo controllo non esisteva: l'update finale
    // sotto scriveva OCCUPATO incondizionatamente, cancellando in silenzio
    // il flag impostato dallo staff (verificato dal vivo: check-in riuscito
    // su un posto appena messo in MANUTENZIONE, stato tornato OCCUPATO).
    if (prenotazione.posto.stato === "MANUTENZIONE") {
      return NextResponse.json(
        {
          success: false,
          error: "Il posto è in manutenzione: check-in non possibile",
          type: "posto_non_disponibile",
        },
        { status: 409 }
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
