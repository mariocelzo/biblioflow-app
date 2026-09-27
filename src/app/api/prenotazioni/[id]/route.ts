import { NextRequest, NextResponse } from "next/server";

import {
  assertOwnership,
  AuthError,
  requireUser,
} from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { criticalApiRateLimiter } from "@/lib/rate-limit";
import { tolleranzaCheckIn, valutaFinestraCheckIn } from "@/lib/prenotazioni-regole";
// La promozione dalla lista d'attesa NON viene reimplementata qui: si
// riusano gli helper gia' pronti di automation-service.ts (che a loro volta
// invocano `promuoviPrimoInCoda`, la funzione di dominio transazionale e
// idempotente in src/lib/prenotazioni-service.ts — NON toccato da questa
// correzione, e' perimetro di un'altra PR).
import { notificaEventoCoda, processaCodaPerPosto } from "@/lib/automation-service";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * 🐞→✅ RILASCIO POSTO GUARDATO (verificato in produzione: un posto rimasto
 * OCCUPATO da gennaio 2026 perche' nessuno ha mai premuto "check-out" — vedi
 * `completaPrenotazioniCheckInScaduto` in src/lib/automation-service.ts per
 * il completamento automatico dello stesso difetto).
 *
 * PRIMA sia il check-out sia la cancellazione di una prenotazione in CHECK_IN
 * forzavano incondizionatamente `Posto.stato = DISPONIBILE`. Due problemi:
 *  1. sovrascriveva in silenzio una MANUTENZIONE impostata dallo staff nel
 *     frattempo (letta qui dalla `posto` gia' caricata insieme alla
 *     prenotazione, quindi PRIMA di questa stessa chiusura);
 *  2. non guardava se un'ALTRA prenotazione fosse ancora in CHECK_IN sullo
 *     stesso posto. Il vincolo EXCLUDE del DB dovrebbe impedire due CHECK_IN
 *     sovrapposti sullo stesso posto, ma e' una guardia difensiva a costo
 *     quasi nullo (una sola query indicizzata su `postoId`+`stato`): se mai
 *     capitasse (es. dati storici incoerenti), il posto resta occupato
 *     dall'altra sessione invece di essere liberato sotto i suoi piedi.
 *
 * Stessa guardia usata dal completamento automatico a fine fascia.
 */
async function rilasciaPostoSeLibero(
  postoId: string,
  statoPostoAttuale: string,
  prenotazioneIdChiusa: string,
): Promise<void> {
  if (statoPostoAttuale === "MANUTENZIONE") {
    return;
  }

  const altraCheckIn = await prisma.prenotazione.findFirst({
    where: {
      postoId,
      stato: "CHECK_IN",
      id: { not: prenotazioneIdChiusa },
    },
    select: { id: true },
  });

  if (altraCheckIn) {
    return;
  }

  await prisma.posto.update({
    where: { id: postoId },
    data: { stato: "DISPONIBILE" },
  });
}

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

/**
 * Se il titolare cancella (soft-delete) la propria prenotazione, promuove il
 * primo in lista d'attesa per lo stesso posto/fascia — esattamente come gia'
 * fa il rilascio automatico da no-show (`releaseNoShowReservations` in
 * src/lib/automation-service.ts). PRIMA questa promozione avveniva SOLO nel
 * rilascio automatico: la cancellazione volontaria (DELETE e PATCH
 * azione:"cancella") si limitava a liberare il posto senza mai interpellare
 * la coda, che restava IN_ATTESA anche con posto/fascia appena libero — il
 * posto diventava "primo arrivato primo servito" invece di rispettare
 * l'ordine di chi era gia' in coda. Va chiamata DOPO che la prenotazione
 * risulta gia' CANCELLATA nel DB (altrimenti `promuoviPrimoInCoda`
 * troverebbe ancora questa stessa riga come occupante attivo dello slot).
 */
async function promuoviCodaDopoCancellazione(prenotazione: {
  postoId: string;
  data: Date;
  oraInizio: Date;
  oraFine: Date;
  posto: { numero: string; sala: { nome: string } };
}): Promise<void> {
  const esitoCoda = await processaCodaPerPosto({
    postoId: prenotazione.postoId,
    data: prenotazione.data,
    oraInizio: prenotazione.oraInizio,
    oraFine: prenotazione.oraFine,
  });

  if (esitoCoda.promossa && esitoCoda.userId) {
    await notificaEventoCoda({
      userId: esitoCoda.userId,
      tipo: "CODA_PROMOZIONE",
      posto: {
        numero: prenotazione.posto.numero,
        salaNome: prenotazione.posto.sala.nome,
      },
      prenotazioneId: esitoCoda.prenotazioneId,
    });
  }
}

// Policy CA-01: agli studenti una risorsa altrui risulta inesistente (404).
export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const prenotazione = await prisma.prenotazione.findUnique({
      where: { id },
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
            coordinataX: true,
            coordinataY: true,
            sala: {
              select: {
                id: true,
                nome: true,
                piano: true,
                orarioApertura: true,
                orarioChiusura: true,
              },
            },
          },
        },
        eventi: { orderBy: { createdAt: "desc" }, take: 10 },
      },
    });

    if (!prenotazione) {
      return NextResponse.json(
        { success: false, error: "Prenotazione non trovata" },
        { status: 404 },
      );
    }

    assertOwnership(prenotazione, user);
    return NextResponse.json({ success: true, data: prenotazione });
  } catch (error) {
    return errorResponse(error, "Errore nel recupero della prenotazione");
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();

    // Rate limiting DOPO l'autenticazione: questa PATCH copre check-in,
    // check-out e cancellazione, tutte operazioni critiche su una risorsa
    // propria. Autorizzare prima evita che un anonimo consumi la quota di
    // qualcun altro (la chiave del limite è l'IP, non l'utente); il limite
    // stesso resta comunque a protezione dell'account autenticato da abusi
    // (es. uno script che tenta ripetutamente il check-in fuori orario).
    const rateLimitResult = await criticalApiRateLimiter(request);
    if (rateLimitResult) return rateLimitResult;

    const { id } = await params;
    const { azione } = await request.json();
    const prenotazione = await prisma.prenotazione.findUnique({
      where: { id },
      // `sala` serve al testo della notifica CODA_PROMOZIONE quando
      // "cancella" promuove il primo in lista d'attesa (vedi
      // `promuoviCodaDopoCancellazione` sopra).
      include: { posto: { include: { sala: true } } },
    });

    if (!prenotazione) {
      return NextResponse.json(
        { success: false, error: "Prenotazione non trovata" },
        { status: 404 },
      );
    }

    assertOwnership(prenotazione, user);

    let updateData: Record<string, unknown>;
    let logTipo: "CHECK_IN" | "CHECK_OUT" | "PRENOTAZIONE_CANCELLATA";
    let logDescrizione: string;
    // Azione sul Posto da eseguire SOLO dopo che la scrittura guardata sulla
    // Prenotazione (vedi piu' sotto, dopo lo switch) e' andata a buon fine:
    // se un'altra richiesta (o il cron) ha gia' chiuso questa riga, non si
    // deve toccare ne' il posto ne' l'audit di QUESTA richiesta.
    let aggiornaPosto: (() => Promise<void>) | null = null;

    switch (azione) {
      case "check-in": {
        if (prenotazione.stato !== "CONFERMATA") {
          return NextResponse.json(
            { success: false, error: "Impossibile fare check-in: stato non valido" },
            { status: 400 },
          );
        }

        // INTEGRITA' DATI: prima qui mancava ogni vincolo temporale, mentre
        // l'endpoint dedicato POST /api/prenotazioni/[id]/check-in lo applicava.
        // Si poteva quindi prenotare per venerdi' e fare check-in il lunedi':
        // il posto passava a OCCUPATO con giorni di anticipo, usciva dal bacino
        // del rilascio automatico per no-show e restava bloccato per tutti gli
        // altri. La stessa operazione fisica non puo' avere due percorsi con
        // regole diverse, quindi la finestra viene applicata anche qui.
        // L'istante di riferimento e' SEMPRE l'orologio del server: un eventuale
        // `timestamp` nel body del client viene ignorato (hardening M-2).
        //
        // BUG STORICO CORRETTO QUI: la vecchia `istanteInizio()` ricomponeva
        // l'istante con `Date.UTC(..., oraInizio.getUTCHours(), ...)`,
        // trattando le cifre di Roma salvate in `oraInizio` come se fossero
        // gia' UTC, senza applicare l'offset Europe/Rome — la finestra
        // risultava sempre "troppo presto". `valutaFinestraCheckIn` (condivisa
        // anche con l'endpoint dedicato e con lo scanner bibliotecario)
        // confronta invece sempre nel fuso della biblioteca.
        //
        // Finestra UNICA (collaudo dal vivo, settembre 2026): stessa
        // tolleranza DOPO l'inizio dell'endpoint dedicato e dello scanner,
        // passata qui in modo esplicito (vedi TOLLERANZA_CHECK_IN_MINUTI).
        // `tolleranzaCheckIn` la estende per il Margine Pendolare quando
        // `prenotazione.marginePendolare` e' vero (letto dal DB qui sopra,
        // mai da un booleano del client) — vedi MARGINE_PENDOLARE_MINUTI in
        // prenotazioni-regole.ts.
        const adesso = new Date();
        const esito = valutaFinestraCheckIn(
          prenotazione.data,
          prenotazione.oraInizio,
          adesso,
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

        updateData = { stato: "CHECK_IN", checkInAt: adesso };
        aggiornaPosto = async () => {
          await prisma.posto.update({
            where: { id: prenotazione.postoId },
            data: { stato: "OCCUPATO" },
          });
        };
        logTipo = "CHECK_IN";
        logDescrizione = `Check-in effettuato per posto ${prenotazione.posto.numero}`;
        break;
      }

      case "check-out":
        if (prenotazione.stato !== "CHECK_IN") {
          return NextResponse.json(
            { success: false, error: "Impossibile fare check-out: non hai fatto check-in" },
            { status: 400 },
          );
        }
        updateData = { stato: "COMPLETATA", checkOutAt: new Date() };
        aggiornaPosto = () =>
          rilasciaPostoSeLibero(
            prenotazione.postoId,
            prenotazione.posto.stato,
            prenotazione.id,
          );
        logTipo = "CHECK_OUT";
        logDescrizione = `Check-out effettuato per posto ${prenotazione.posto.numero}`;
        break;

      case "cancella":
        if (!["CONFERMATA", "CHECK_IN"].includes(prenotazione.stato)) {
          return NextResponse.json(
            { success: false, error: "Impossibile cancellare: prenotazione già conclusa" },
            { status: 400 },
          );
        }
        updateData = { stato: "CANCELLATA" };
        if (prenotazione.stato === "CHECK_IN") {
          aggiornaPosto = () =>
            rilasciaPostoSeLibero(
              prenotazione.postoId,
              prenotazione.posto.stato,
              prenotazione.id,
            );
        }
        logTipo = "PRENOTAZIONE_CANCELLATA";
        logDescrizione = `Prenotazione cancellata per posto ${prenotazione.posto.numero}`;
        break;

      default:
        return NextResponse.json(
          { success: false, error: "Azione non valida. Usa: check-in, check-out, cancella" },
          { status: 400 },
        );
    }

    // GUARDIA DI CONCORRENZA (bloccante di revisione PR #83): prima si
    // scriveva incondizionatamente `prisma.prenotazione.update(...)` dopo aver
    // letto la riga una volta sola in cima a questa PATCH. Da quando il cron
    // (`completaPrenotazioniCheckInScaduto`, ogni 5 minuti) puo' chiudere da
    // solo una CHECK_IN appena la sua fascia finisce, questa route puo'
    // competere ESATTAMENTE sulle righe la cui fascia sta per scadere — lo
    // stesso istante in cui un utente reale preme "check-out". Senza guardia,
    // una richiesta gia' oltre i controlli sopra poteva sovrascrivere una riga
    // gia' chiusa dal cron: secondo LogEvento per la stessa sessione e il
    // `checkOutAt` del cron (l'istante corretto di fine fascia) rimpiazzato in
    // silenzio da "adesso". La `updateMany` con lo stato atteso nel `where` e'
    // la STESSA guardia gia' usata da `completaPrenotazioniCheckInScaduto`
    // (src/lib/automation-service.ts): se un'altra scrittura e' arrivata
    // prima, `count` e' 0 e ci si ferma qui, PRIMA di toccare posto/log/coda.
    const risultatoUpdate = await prisma.prenotazione.updateMany({
      where: { id, stato: prenotazione.stato },
      data: updateData,
    });

    if (risultatoUpdate.count !== 1) {
      return NextResponse.json(
        {
          success: false,
          error:
            "La prenotazione è stata aggiornata da un'altra operazione nel frattempo. Ricarica la pagina e riprova.",
        },
        { status: 409 },
      );
    }

    // Il posto viene toccato SOLO ora, avendo appena verificato di essere
    // stati noi a effettuare la transizione (vedi guardia sopra).
    if (aggiornaPosto) {
      await aggiornaPosto();
    }

    const prenotazioneAggiornata = await prisma.prenotazione.findUniqueOrThrow({
      where: { id },
      include: {
        user: { select: { id: true, nome: true, cognome: true } },
        posto: {
          select: {
            id: true,
            numero: true,
            sala: { select: { nome: true } },
          },
        },
      },
    });

    await prisma.logEvento.create({
      data: {
        tipo: logTipo,
        userId: user.id,
        prenotazioneId: id,
        descrizione: logDescrizione,
      },
    });

    // La prenotazione e' ORA CANCELLATA a DB (l'update sopra e' gia' andato a
    // buon fine): se qualcuno e' primo in lista d'attesa per lo stesso
    // posto/fascia, va promosso subito (vedi `promuoviCodaDopoCancellazione`).
    if (azione === "cancella") {
      await promuoviCodaDopoCancellazione(prenotazione);
    }

    return NextResponse.json({
      success: true,
      data: prenotazioneAggiornata,
      message: logDescrizione,
    });
  } catch (error) {
    return errorResponse(error, "Errore nell'aggiornamento della prenotazione");
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();

    // Rate limiting DOPO l'autenticazione: stesso criterio della PATCH qui
    // sopra (autorizzare prima di limitare, su un endpoint che agisce solo su
    // risorse dell'utente autenticato).
    const rateLimitResult = await criticalApiRateLimiter(request);
    if (rateLimitResult) return rateLimitResult;

    const { id } = await params;
    const prenotazione = await prisma.prenotazione.findUnique({
      where: { id },
      // `sala` serve al testo della notifica CODA_PROMOZIONE quando la
      // cancellazione promuove il primo in lista d'attesa (vedi sotto).
      include: { posto: { include: { sala: true } } },
    });

    if (!prenotazione) {
      return NextResponse.json(
        { success: false, error: "Prenotazione non trovata" },
        { status: 404 },
      );
    }

    assertOwnership(prenotazione, user);

    // INTEGRITA' DATI: la cancellazione e' un SOFT-delete.
    // Prima questo endpoint eseguiva `logEvento.deleteMany({ prenotazioneId })`
    // seguito da una hard-delete. Ma i LogEvento sono la base su cui l'area
    // amministrativa conta i NO_SHOW (src/app/api/admin/utenti/[id]/route.ts e
    // src/app/api/admin/anomalie/route.ts): uno studente che accumulava assenze
    // poteva cancellare le proprie prenotazioni e azzerare le prove a proprio
    // carico. La hard-delete rendeva inoltre impossibile ogni statistica
    // storica. Un endpoint utente non deve MAI toccare l'audit trail.
    //
    // Il soft-delete e' anche cio' che la UI gia' si aspettava: dopo una DELETE
    // riuscita src/app/prenotazioni/page.tsx marca la prenotazione come
    // CANCELLATA e la mostra nello storico invece di rimuoverla dalla lista.
    // Il vincolo anti-sovrapposizione e' filtrato su ('CONFERMATA','CHECK_IN'),
    // quindi una prenotazione CANCELLATA non blocca la riprenotazione dello slot.
    if (!["CONFERMATA", "CHECK_IN"].includes(prenotazione.stato)) {
      return NextResponse.json(
        { success: false, error: "Impossibile cancellare: prenotazione già conclusa" },
        { status: 400 },
      );
    }

    // GUARDIA DI CONCORRENZA (bloccante di revisione PR #83): stessa guardia
    // della PATCH qui sopra — niente scrittura incondizionata sulla
    // Prenotazione. La `updateMany` con lo stato atteso nel `where` conta 1
    // solo se questa richiesta e' davvero la prima a chiudere la riga; se il
    // cron (`completaPrenotazioniCheckInScaduto`) o un'altra richiesta l'hanno
    // gia' chiusa nel frattempo, `count` e' 0 e ci si ferma PRIMA di toccare
    // posto/log/coda (niente doppio LogEvento, niente `checkOutAt`/dati
    // sovrascritti).
    const risultatoUpdate = await prisma.prenotazione.updateMany({
      where: { id, stato: prenotazione.stato },
      data: { stato: "CANCELLATA" },
    });

    if (risultatoUpdate.count !== 1) {
      return NextResponse.json(
        {
          success: false,
          error:
            "La prenotazione è stata aggiornata da un'altra operazione nel frattempo. Ricarica la pagina e riprova.",
        },
        { status: 409 },
      );
    }

    if (prenotazione.stato === "CHECK_IN") {
      await rilasciaPostoSeLibero(
        prenotazione.postoId,
        prenotazione.posto.stato,
        prenotazione.id,
      );
    }

    // La cancellazione viene tracciata come qualunque altra transizione di
    // stato, cosi' resta ricostruibile chi ha fatto cosa e quando.
    await prisma.logEvento.create({
      data: {
        tipo: "PRENOTAZIONE_CANCELLATA",
        userId: user.id,
        prenotazioneId: id,
        descrizione: `Prenotazione cancellata per posto ${prenotazione.posto.numero}`,
      },
    });

    // La prenotazione e' ORA CANCELLATA a DB (l'update sopra e' gia' andato a
    // buon fine): stessa promozione di coda del case "cancella" della PATCH
    // qui sopra (vedi `promuoviCodaDopoCancellazione`).
    await promuoviCodaDopoCancellazione(prenotazione);

    return NextResponse.json({ success: true, message: "Prenotazione cancellata" });
  } catch (error) {
    return errorResponse(error, "Errore nell'eliminazione della prenotazione");
  }
}
