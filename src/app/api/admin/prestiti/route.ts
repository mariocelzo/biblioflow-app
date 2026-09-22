import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { staffCriticalApiRateLimiter } from "@/lib/rate-limit";
// STATI_PRESTITO_IN_CORSO/prestitoInCorso: unico punto di verita' su quali
// stati di un prestito sono ancora "in corso" (ATTIVO o RINNOVATO), gia'
// usato da src/app/api/prestiti/route.ts e dalla UI admin. Riusarlo qui
// invece di riscrivere un controllo locale evita che i due punti si
// disallineino di nuovo (vedi commento sul case "RINNOVA" piu' sotto).
import { prestitoInCorso } from "@/lib/prestiti-scaduti";

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    
    if (!session?.user) {
      return NextResponse.json(
        { error: "Non autenticato" },
        { status: 401 }
      );
    }

    if (session.user.ruolo !== "ADMIN" && session.user.ruolo !== "BIBLIOTECARIO") {
      return NextResponse.json(
        { error: "Accesso negato" },
        { status: 403 }
      );
    }

    // Rate limiting DOPO il controllo di ruolo (stesso criterio delle altre
    // route admin: non ha senso far consumare quota a chi viene comunque
    // respinto da 401/403). Limite STAFF perché questa route gestisce anche
    // SOLLECITA_MULTIPLI/RESTITUISCI/RINNOVA invocati ripetutamente durante
    // il lavoro al banco.
    const rateLimitResult = await staffCriticalApiRateLimiter(req);
    if (rateLimitResult) return rateLimitResult;

    // Corpo atteso: sempre JSON. In precedenza il bottone "Sollecita Tutti"
    // era un <form method="POST"> senza campi: senza `enctype` il browser
    // manda un body "application/x-www-form-urlencoded" vuoto, che qui
    // faceva esplodere `req.json()` con un SyntaxError catturato dal blocco
    // generico piu' sotto e restituito come 500 - la pagina admin veniva
    // sostituita dal JSON grezzo dell'errore (rilievo #2 dell'audit). Il
    // form e' stato sostituito da una fetch JSON vera (vedi
    // SollecitaTuttiButton), ma qui isoliamo comunque l'errore di parsing
    // per dare un 400 esplicito a qualunque chiamante non invii JSON.
    let corpoGrezzo: unknown;
    try {
      corpoGrezzo = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Corpo della richiesta non valido: invia JSON con Content-Type application/json" },
        { status: 400 }
      );
    }

    const { azione, prestitoIds, prestitoId } = (corpoGrezzo ?? {}) as {
      azione?: string;
      prestitoIds?: string[];
      prestitoId?: string;
    };

    switch (azione) {
      case "RESTITUISCI": {
        if (!prestitoId) {
          return NextResponse.json(
            { error: "ID prestito mancante" },
            { status: 400 }
          );
        }

        const prestito = await prisma.prestito.findUnique({
          where: { id: prestitoId },
          include: { user: true, libro: true }
        });

        if (!prestito) {
          return NextResponse.json(
            { error: "Prestito non trovato" },
            { status: 404 }
          );
        }

        if (prestito.stato === "RESTITUITO") {
          return NextResponse.json(
            { error: "Prestito già restituito" },
            { status: 400 }
          );
        }

        // INTEGRITA' DATI: la restituzione registrata dallo staff deve
        // produrre LO STESSO effetto sul database della restituzione fatta
        // dallo studente (src/app/api/prestiti/[id]/route.ts, azione
        // "restituisci"): stato -> RESTITUITO E incremento di
        // Libro.copieDisponibili, nella STESSA transazione. Prima questa
        // route aggiornava solo il prestito: ogni restituzione registrata al
        // banco "perdeva" una copia per sempre, finche' il libro risultava
        // non disponibile pur essendo fisicamente sullo scaffale.
        //
        // GUARDIA ANTI DOPPIO-CLICK: `updateMany` condizionato su
        // `stato: { not: "RESTITUITO" }` (stessa tecnica del decremento
        // condizionato di `copieDisponibili` in POST /api/prestiti, PR #67):
        // se due richieste quasi simultanee arrivano per lo stesso prestito
        // (doppio click, retry di rete), solo la PRIMA aggiorna davvero una
        // riga (`count === 1`) e solo quella incrementa le copie. Senza
        // questa guardia un `update` incondizionato eseguito due volte
        // incrementerebbe `copieDisponibili` due volte per un solo libro
        // fisicamente restituito.
        const oggi = new Date();
        let giaRestituitoConcorrente = false;

        await prisma.$transaction(async (tx) => {
          const aggiornato = await tx.prestito.updateMany({
            where: { id: prestitoId, stato: { not: "RESTITUITO" } },
            data: {
              stato: "RESTITUITO",
              dataRestituzione: oggi
            }
          });

          if (aggiornato.count === 0) {
            // Un'altra richiesta ha gia' restituito questo prestito tra il
            // controllo sopra e questa transazione: non si tocca il libro.
            giaRestituitoConcorrente = true;
            return;
          }

          await tx.libro.update({
            where: { id: prestito.libroId },
            data: { copieDisponibili: { increment: 1 } }
          });
        });

        if (giaRestituitoConcorrente) {
          return NextResponse.json(
            { error: "Prestito già restituito" },
            { status: 400 }
          );
        }

        // Calcola giorni di ritardo per log/notifica
        const scadenza = new Date(prestito.dataScadenza);
        const giorniRitardo = Math.max(0, Math.floor((oggi.getTime() - scadenza.getTime()) / (1000 * 60 * 60 * 24)));

        // Log evento
        await prisma.logEvento.create({
          data: {
            tipo: "PRESTITO_RESTITUITO",
            userId: prestito.user.id,
            dettagli: {
              prestitoId: prestito.id,
              libroId: prestito.libro.id,
              giorniRitardo,
              restituitoDa: session.user.email
            }
          }
        });

        // Notifica utente
        await prisma.notifica.create({
          data: {
            tipo: "SISTEMA",
            titolo: "Prestito restituito",
            messaggio: giorniRitardo > 0 
              ? `Prestito di "${prestito.libro.titolo}" restituito con ${giorniRitardo} giorni di ritardo.`
              : `Prestito di "${prestito.libro.titolo}" restituito correttamente.`,
            userId: prestito.user.id
          }
        });

        return NextResponse.json({
          success: true,
          message: "Prestito restituito",
          giorniRitardo
        });
      }

      case "RINNOVA": {
        if (!prestitoId) {
          return NextResponse.json(
            { error: "ID prestito mancante" },
            { status: 400 }
          );
        }

        const prestito = await prisma.prestito.findUnique({
          where: { id: prestitoId },
          include: { user: true, libro: true }
        });

        if (!prestito) {
          return NextResponse.json(
            { error: "Prestito non trovato" },
            { status: 404 }
          );
        }

        // INTEGRITA' DATI: allineato allo STESSO controllo del rinnovo
        // studente (STATI_PRESTITO_IN_CORSO / prestitoInCorso in
        // src/lib/prestiti-scaduti.ts, usato da POST
        // /api/prestiti/[id]/rinnova): un prestito RINNOVATO e' ancora "in
        // corso" e deve poter essere rinnovato una seconda volta finche' non
        // supera il tetto (controllo subito sotto) — prima veniva rifiutato
        // SOLO perche' il suo stato era gia' "RINNOVATO", rendendo
        // irraggiungibile il secondo rinnovo per maxRinnovi = 2 (stesso bug
        // gia' corretto lato studente: vedi il commento in
        // src/app/api/prestiti/[id]/rinnova/route.ts).
        //
        // SCADUTO resta escluso, esattamente come per lo studente (ne' PATCH
        // /api/prestiti/[id] ne' POST /api/prestiti/[id]/rinnova ammettono il
        // rinnovo di un prestito scaduto): un'azione dello staff non deve
        // poter fare cio' che l'azione equivalente dello studente non
        // potrebbe fare.
        if (!prestitoInCorso(prestito.stato)) {
          return NextResponse.json(
            { error: "Il prestito non può essere rinnovato" },
            { status: 400 }
          );
        }

        // INTEGRITA' DATI: stesso tetto imposto allo studente
        // (Prestito.maxRinnovi, default 2). Senza questo controllo l'admin
        // poteva rinnovare un prestito un numero illimitato di volte.
        if (prestito.rinnovi >= prestito.maxRinnovi) {
          return NextResponse.json(
            { error: `Il prestito ha già raggiunto il limite massimo di ${prestito.maxRinnovi} rinnovi` },
            { status: 400 }
          );
        }

        // Estendi di 14 giorni (stessa durata di POST /api/prestiti/[id]/rinnova, PR #67)
        const nuovaScadenza = new Date();
        nuovaScadenza.setDate(nuovaScadenza.getDate() + 14);

        // Update prestito: incrementa anche `rinnovi`, altrimenti il tetto
        // controllato sopra non viene mai raggiunto (equivaleva a un rinnovo
        // lato admin illimitato, esattamente il difetto gia' descritto sopra).
        await prisma.prestito.update({
          where: { id: prestitoId },
          data: {
            stato: "RINNOVATO",
            dataScadenza: nuovaScadenza,
            rinnovi: { increment: 1 }
          }
        });

        // Log evento
        await prisma.logEvento.create({
          data: {
            tipo: "PRESTITO_CREATO",
            userId: prestito.user.id,
            dettagli: {
              prestitoId: prestito.id,
              libroId: prestito.libro.id,
              azione: "rinnovo",
              vecchiaScadenza: prestito.dataScadenza,
              nuovaScadenza,
              rinnovatoDa: session.user.email
            }
          }
        });

        // Notifica utente
        await prisma.notifica.create({
          data: {
            tipo: "SISTEMA",
            titolo: "Prestito rinnovato",
            messaggio: `Il prestito di "${prestito.libro.titolo}" è stato rinnovato. Nuova scadenza: ${nuovaScadenza.toLocaleDateString('it-IT')}.`,
            userId: prestito.user.id
          }
        });

        return NextResponse.json({
          success: true,
          message: "Prestito rinnovato",
          nuovaScadenza
        });
      }

      case "SOLLECITA_SINGOLO": {
        if (!prestitoId) {
          return NextResponse.json(
            { error: "ID prestito mancante" },
            { status: 400 }
          );
        }

        const prestito = await prisma.prestito.findUnique({
          where: { id: prestitoId },
          include: { user: true, libro: true }
        });

        if (!prestito) {
          return NextResponse.json(
            { error: "Prestito non trovato" },
            { status: 404 }
          );
        }

        const oggi = new Date();
        const scadenza = new Date(prestito.dataScadenza);
        const giorniRitardo = Math.floor((oggi.getTime() - scadenza.getTime()) / (1000 * 60 * 60 * 24));

        // Crea notifica di sollecito
        await prisma.notifica.create({
          data: {
            tipo: "SCADENZA_PRESTITO",
            titolo: "Sollecito restituzione libro",
            messaggio: `Il prestito di "${prestito.libro.titolo}" è scaduto ${giorniRitardo} giorni fa. Si prega di restituirlo al più presto per evitare sanzioni.`,
            userId: prestito.user.id
          }
        });

        // Log evento
        await prisma.logEvento.create({
          data: {
            tipo: "PRESTITO_RESTITUITO",
            userId: prestito.user.id,
            dettagli: {
              prestitoId: prestito.id,
              libroId: prestito.libro.id,
              azione: "sollecito",
              giorniRitardo,
              sollecitoDa: session.user.email
            }
          }
        });

        return NextResponse.json({
          success: true,
          message: "Sollecito inviato"
        });
      }

      case "SOLLECITA_MULTIPLI": {
        if (!prestitoIds || !Array.isArray(prestitoIds)) {
          return NextResponse.json(
            { error: "IDs prestiti mancanti" },
            { status: 400 }
          );
        }

        const prestiti = await prisma.prestito.findMany({
          where: { id: { in: prestitoIds } },
          include: { user: true, libro: true }
        });

        const oggi = new Date();
        let count = 0;

        for (const prestito of prestiti) {
          const scadenza = new Date(prestito.dataScadenza);
          const giorniRitardo = Math.floor((oggi.getTime() - scadenza.getTime()) / (1000 * 60 * 60 * 24));

          if (giorniRitardo > 0) {
            // Crea notifica di sollecito
            await prisma.notifica.create({
              data: {
                tipo: "SCADENZA_PRESTITO",
                titolo: "Sollecito restituzione libro",
                messaggio: `Il prestito di "${prestito.libro.titolo}" è scaduto ${giorniRitardo} giorni fa. Si prega di restituirlo al più presto per evitare sanzioni.`,
                userId: prestito.user.id
              }
            });

            // Log evento
            await prisma.logEvento.create({
              data: {
                tipo: "PRESTITO_RESTITUITO",
                userId: prestito.user.id,
                dettagli: {
                  prestitoId: prestito.id,
                  libroId: prestito.libro.id,
                  azione: "sollecito_batch",
                  giorniRitardo,
                  sollecitoDa: session.user.email
                }
              }
            });

            count++;
          }
        }

        return NextResponse.json({
          success: true,
          message: `${count} solleciti inviati`
        });
      }

      default:
        return NextResponse.json(
          { error: "Azione non valida" },
          { status: 400 }
        );
    }

  } catch (error) {
    console.error("Errore API prestiti admin:", error);
    return NextResponse.json(
      { error: "Errore interno del server" },
      { status: 500 }
    );
  }
}
