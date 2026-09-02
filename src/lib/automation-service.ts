/**
 * 🤖 Automation Service
 *
 * Gestisce tutte le automazioni periodiche del sistema:
 * - Reminder check-in (15 min prima)
 * - Alert scadenza prestiti (3 giorni prima + giorno scadenza)
 * - Rilascio automatico no-show (15 min dopo ora inizio)
 * - Notifica posto liberato
 * - Innesco della promozione dalla lista d'attesa quando un posto si libera
 *   automaticamente (BIB-40 / CA-04)
 * - Tracciabilità completa degli eventi di coda su LogEvento (BIB-46 / CA-05)
 * - Finestra di conferma della promozione: chi non conferma entro il tempo
 *   limite decade e il posto passa al successivo in coda (BIB-44 / CA-04)
 */

import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import {
  Prisma,
  StatoListaAttesa,
  StatoPrenotazione,
  StatoPosto,
  TipoNotifica,
} from '@prisma/client';
// La promozione dalla coda NON viene reimplementata qui: si invoca la funzione
// di dominio già pronta (transazionale Serializable + FOR UPDATE SKIP LOCKED,
// idempotente, e che scrive da sé il LogEvento `CODA_PROMOZIONE`).
import {
  promuoviPrimoInCoda,
  type PromozioneCoda,
} from '@/lib/prenotazioni-service';

/**
 * 🔐 HELPER INTERNO — STANDARDIZZA L'ATTORE DEGLI EVENTI AUTOMAZIONE (BIB-46 / CA-05)
 *
 * Restituisce un oggetto standard per il campo `dettagli.attore` di ogni LogEvento
 * scritto dalle automazioni. Questo consente l'audit di chi/cosa ha originato un evento:
 * - Automazione: `{ tipo: 'automazione', processo: 'cron-automations' }`
 * - Per azioni utente: `{ tipo: 'utente', userId }`
 */
function attoreAutomazione() {
  return {
    tipo: 'automazione' as const,
    processo: 'cron-automations' as const,
  };
}

/**
 * 1️⃣ REMINDER CHECK-IN
 * Invia notifica 15 minuti prima dell'ora di inizio prenotazione
 */
export async function sendCheckInReminders() {
  const now = new Date();
  const in15Minutes = new Date(now.getTime() + 15 * 60 * 1000);
  const in20Minutes = new Date(now.getTime() + 20 * 60 * 1000);

  // Trova prenotazioni confermate che iniziano tra 15-20 minuti
  const prenotazioni = await prisma.prenotazione.findMany({
    where: {
      stato: StatoPrenotazione.CONFERMATA,
      data: {
        gte: new Date(now.setHours(0, 0, 0, 0)),
        lte: new Date(now.setHours(23, 59, 59, 999)),
      },
      oraInizio: {
        gte: in15Minutes,
        lte: in20Minutes,
      },
      // Solo se non ha già una notifica di reminder oggi
      user: {
        notifiche: {
          none: {
            tipo: TipoNotifica.CHECK_IN_REMINDER,
            createdAt: {
              gte: new Date(now.setHours(0, 0, 0, 0)),
            },
            actionUrl: {
              contains: 'prenotazioni',
            },
          },
        },
      },
    },
    include: {
      user: true,
      posto: {
        include: {
          sala: true,
        },
      },
    },
  });

  let count = 0;

  for (const prenotazione of prenotazioni) {
    await prisma.notifica.create({
      data: {
        userId: prenotazione.userId,
        tipo: TipoNotifica.CHECK_IN_REMINDER,
        titolo: '⏰ Check-in tra 15 minuti',
        messaggio: `Non dimenticare di fare check-in per il posto ${prenotazione.posto.numero} in ${prenotazione.posto.sala.nome}. Hai tempo fino alle ${prenotazione.oraInizio.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}.`,
        actionUrl: `/prenotazioni/${prenotazione.id}`,
        actionLabel: 'Fai check-in',
      },
    });

    await prisma.logEvento.create({
      data: {
        tipo: 'AUTOMATION',
        descrizione: `Reminder check-in inviato per prenotazione ${prenotazione.id}`,
        dettagli: {
          prenotazioneId: prenotazione.id,
          userId: prenotazione.userId,
          oraInizio: prenotazione.oraInizio,
        },
      },
    });

    count++;
  }

  return { sent: count, message: `${count} reminder check-in inviati` };
}

/**
 * 2️⃣ ALERT SCADENZA PRESTITI
 * Invia notifica 3 giorni prima e il giorno della scadenza
 */
export async function sendLoanExpiryAlerts() {
  const now = new Date();
  const in3Days = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  // Prestiti che scadono tra 3 giorni (avviso anticipato)
  const prestiti3Giorni = await prisma.prestito.findMany({
    where: {
      stato: 'ATTIVO',
      dataScadenza: {
        gte: new Date(in3Days.setHours(0, 0, 0, 0)),
        lte: new Date(in3Days.setHours(23, 59, 59, 999)),
      },
    },
    include: {
      user: true,
      libro: true,
    },
  });

  // Prestiti che scadono domani (ultimo avviso)
  const prestitiDomani = await prisma.prestito.findMany({
    where: {
      stato: 'ATTIVO',
      dataScadenza: {
        gte: new Date(tomorrow.setHours(0, 0, 0, 0)),
        lte: new Date(tomorrow.setHours(23, 59, 59, 999)),
      },
    },
    include: {
      user: true,
      libro: true,
    },
  });

  let count = 0;

  // Avviso 3 giorni prima
  for (const prestito of prestiti3Giorni) {
    await prisma.notifica.create({
      data: {
        userId: prestito.userId,
        tipo: TipoNotifica.ALERT,
        titolo: '📚 Prestito in scadenza',
        messaggio: `Il libro "${prestito.libro.titolo}" scade tra 3 giorni (${prestito.dataScadenza.toLocaleDateString('it-IT')}). Ricordati di restituirlo o rinnovarlo.`,
        actionUrl: '/prestiti',
      },
    });

    await prisma.logEvento.create({
      data: {
        tipo: 'AUTOMATION',
        descrizione: `Alert scadenza 3 giorni inviato per prestito ${prestito.id}`,
        dettagli: {
          prestitoId: prestito.id,
          userId: prestito.userId,
          libroId: prestito.libroId,
          dataScadenza: prestito.dataScadenza,
        },
      },
    });

    count++;
  }

  // Avviso 1 giorno prima (più urgente)
  for (const prestito of prestitiDomani) {
    await prisma.notifica.create({
      data: {
        userId: prestito.userId,
        tipo: TipoNotifica.ALERT,
        titolo: '⚠️ Prestito scade domani!',
        messaggio: `URGENTE: Il libro "${prestito.libro.titolo}" scade domani (${prestito.dataScadenza.toLocaleDateString('it-IT')}). Restituiscilo oggi o rinnovalo per evitare penali.`,
        actionUrl: '/prestiti',
      },
    });

    await prisma.logEvento.create({
      data: {
        tipo: 'AUTOMATION',
        descrizione: `Alert scadenza 1 giorno inviato per prestito ${prestito.id}`,
        dettagli: {
          prestitoId: prestito.id,
          userId: prestito.userId,
          libroId: prestito.libroId,
          dataScadenza: prestito.dataScadenza,
        },
      },
    });

    count++;
  }

  return { sent: count, message: `${count} alert scadenza prestiti inviati` };
}

/**
 * 🔔 NOTIFICHE DEGLI EVENTI DELLA LISTA D'ATTESA (BIB-42 / CA-05)
 *
 * I tre eventi della coda per cui l'utente riceve una notifica. I nomi
 * coincidono con i valori già presenti sia in `TipoNotifica` sia in
 * `TipoEvento` dello schema Prisma (qui NON si tocca `prisma/schema.prisma`),
 * così lo stesso valore serve per la `Notifica` e per il `LogEvento`.
 *  - `CODA_INGRESSO`   — conferma di ingresso in lista d'attesa.
 *  - `CODA_PROMOZIONE` — l'utente è stato promosso: esiste una prenotazione sua.
 *  - `CODA_SCADENZA`   — la richiesta è decaduta senza esito.
 */
type TipoEventoCoda = 'CODA_INGRESSO' | 'CODA_PROMOZIONE' | 'CODA_SCADENZA';

/** Esito della generazione di una notifica di coda: mai un throw verso il chiamante. */
export interface NotificaEventoCodaResult {
  /** `true` se sia la `Notifica` sia il `LogEvento` sono stati scritti. */
  notificaCreata: boolean;
  /** Messaggio d'errore quando la scrittura è fallita ed è stata assorbita. */
  errore?: string;
}

/** Parametri per generare la notifica utente di un evento della lista d'attesa. */
export interface NotificaEventoCodaInput {
  /** Destinatario della notifica (utente in coda o appena promosso). */
  userId: string;
  /** Evento della coda da notificare. */
  tipo: TipoEventoCoda;
  /** Posto coinvolto: usato solo per rendere leggibile il testo del messaggio. */
  posto?: { numero: string; salaNome?: string };
  /** Prenotazione creata dalla promozione (solo per `CODA_PROMOZIONE`). */
  prenotazioneId?: string;
  /** Richiesta di lista d'attesa collegata (ingresso / scadenza). */
  richiestaId?: string;
  /** ID univoco che correla tutti gli eventi della stessa catena di rilascio+promozione (BIB-46 / CA-05). */
  correlationId?: string;
}

/** Frammento di testo che descrive il posto, con o senza nome sala. */
function descriviPostoCoda(posto?: { numero: string; salaNome?: string }): string {
  if (!posto) {
    return 'il posto richiesto';
  }
  return posto.salaNome
    ? `il posto ${posto.numero} (${posto.salaNome})`
    : `il posto ${posto.numero}`;
}

/**
 * Costruisce titolo, messaggio e link d'azione della notifica in base al tipo
 * di evento. Testi in italiano, tono informativo.
 * - promozione → `actionUrl` verso la prenotazione creata;
 * - ingresso / scadenza → `actionUrl` verso la lista d'attesa.
 */
function contenutoNotificaCoda(input: NotificaEventoCodaInput): {
  titolo: string;
  messaggio: string;
  actionUrl: string;
  actionLabel: string;
} {
  const posto = descriviPostoCoda(input.posto);

  switch (input.tipo) {
    case 'CODA_INGRESSO':
      return {
        titolo: "📋 Sei in lista d'attesa",
        messaggio: `Ti abbiamo inserito in lista d'attesa per ${posto}. Appena si libera per la tua fascia oraria creeremo la prenotazione e ti avviseremo.`,
        actionUrl: '/prenotazioni/coda',
        actionLabel: "Vedi lista d'attesa",
      };
    case 'CODA_PROMOZIONE':
      return {
        titolo: "🎉 Posto assegnato dalla lista d'attesa",
        messaggio: `Buone notizie: ${posto} si è liberato e la prenotazione è ora tua. Ricordati di fare il check-in nei tempi previsti per non perderla.`,
        // Se per qualunque motivo manca l'id si rimanda all'elenco prenotazioni.
        actionUrl: input.prenotazioneId
          ? `/prenotazioni/${input.prenotazioneId}`
          : '/prenotazioni',
        actionLabel: 'Vedi prenotazione',
      };
    case 'CODA_SCADENZA':
      return {
        titolo: "⌛ Richiesta in lista d'attesa scaduta",
        messaggio: `La tua richiesta in lista d'attesa per ${posto} è decaduta senza esito. Se ti serve ancora puoi rimetterti in lista d'attesa.`,
        actionUrl: '/prenotazioni/coda',
        actionLabel: "Torna alla lista d'attesa",
      };
  }
}

/**
 * ♻️ HELPER — GENERA LA NOTIFICA UTENTE DI UN EVENTO DELLA LISTA D'ATTESA
 *
 * Scrive due righe:
 *  1. una `Notifica` per l'utente (`tipo` = valore di `TipoNotifica`);
 *  2. un `LogEvento` di audit con lo *stesso* nome enum (lato `TipoEvento`),
 *     `targetUserId` = destinatario e `dettagli` con i riferimenti utili.
 *
 * È volutamente *best-effort*: se la scrittura fallisce, l'errore viene loggato
 * e assorbito (ritorno `{ notificaCreata: false, errore }`), così il giro delle
 * automazioni non si interrompe per una notifica non riuscita (requisito di
 * robustezza BIB-42). Per lo stesso motivo NON apre transazioni: `Notifica` e
 * `LogEvento` sono informativi e indipendenti dal resto del flusso.
 *
 * Nota sull'audit: per l'ingresso in coda e per la promozione il servizio di
 * dominio scrive già un proprio `LogEvento` dell'*azione*. Questo `LogEvento` è
 * distinto e complementare: registra l'*invio della notifica*
 * (`dettagli.evento = 'notifica'`), non duplica l'evento di dominio.
 */
export async function notificaEventoCoda(
  input: NotificaEventoCodaInput,
): Promise<NotificaEventoCodaResult> {
  const { titolo, messaggio, actionUrl, actionLabel } =
    contenutoNotificaCoda(input);

  try {
    // 1️⃣ Notifica visibile all'utente (compare in /notifiche e nel badge).
    await prisma.notifica.create({
      data: {
        userId: input.userId,
        tipo: input.tipo,
        titolo,
        messaggio,
        actionUrl,
        actionLabel,
      },
    });

    // 2️⃣ Traccia di audit con lo stesso nome enum lato `TipoEvento`.
    // BIB-46 / CA-05: arricchimento audit con correlationId e attore.
    await prisma.logEvento.create({
      data: {
        tipo: input.tipo,
        targetUserId: input.userId,
        prenotazioneId: input.prenotazioneId ?? null,
        descrizione: `Notifica evento coda inviata (${input.tipo})`,
        dettagli: {
          evento: 'notifica',
          tipo: input.tipo,
          posto: input.posto?.numero ?? null,
          sala: input.posto?.salaNome ?? null,
          prenotazioneId: input.prenotazioneId ?? null,
          listaAttesaId: input.richiestaId ?? null,
          // BIB-46 / CA-05: attore standardizzato e correlationId per ricostruire la catena.
          attore: attoreAutomazione(),
          correlationId: input.correlationId ?? null,
        },
      },
    });

    return { notificaCreata: true };
  } catch (err) {
    // Assorbe l'errore: una notifica mancata non deve propagarsi al chiamante.
    const errore = err instanceof Error ? err.message : String(err);
    console.error('❌ Errore generazione notifica evento coda:', err);
    return { notificaCreata: false, errore };
  }
}

/**
 * 🧩 WRAPPER PRONTO ALL'USO PER LA SCADENZA DELLA CODA (BIB-42 → usato da BIB-44)
 *
 * Unico punto d'ingresso tipizzato con cui avvisare l'utente quando la sua
 * richiesta in lista d'attesa decade senza esito. La logica che decide *quando*
 * una richiesta decade vive in `scadiPromozioniNonConfermate` (BIB-44 / CA-04);
 * qui si formatta e si scrive soltanto l'avviso.
 *
 * @param userId destinatario dell'avviso
 * @param ctx    riferimenti opzionali per arricchire testo e audit; il
 *               `correlationId` (BIB-46 / CA-05) è additivo e facoltativo, così
 *               le chiamate preesistenti restano valide
 */
export async function notificaScadenzaCoda(
  userId: string,
  ctx: {
    posto?: { numero: string; salaNome?: string };
    richiestaId?: string;
    correlationId?: string;
  } = {},
): Promise<NotificaEventoCodaResult> {
  return notificaEventoCoda({
    userId,
    tipo: 'CODA_SCADENZA',
    posto: ctx.posto,
    richiestaId: ctx.richiestaId,
    correlationId: ctx.correlationId,
  });
}

// Valore di ritorno di `processaCodaPerPosto`. `promossa` e `prenotazioneId`
// sono i campi storici di BIB-40 e restano invariati; `userId` è aggiunto da
// BIB-42 / CA-05 per permettere al chiamante di notificare l'utente promosso
// senza rileggere la prenotazione. È `undefined` a coda vuota o in caso d'errore.
export type EsitoProcessaCoda = {
  promossa: boolean;
  prenotazioneId?: string;
  userId?: string;
};

/**
 * ♻️ HELPER RIUSABILE — INNESCO PROMOZIONE LISTA D'ATTESA
 *
 * Quando un'automazione libera un posto per un certo slot (posto + data +
 * intervallo orario), questo helper "innesca" l'elaborazione della lista
 * d'attesa per quello stesso slot.
 *
 * Cosa fa (e cosa NON fa):
 * - INVOCA `promuoviPrimoInCoda` del servizio di dominio. Quella funzione è già
 *   transazionale e idempotente: crea la prenotazione per il primo utente
 *   IN_ATTESA, marca la richiesta di coda come PROMOSSA e scrive da sé il
 *   LogEvento `CODA_PROMOZIONE`. Qui NON si riscrive nulla di tutto ciò.
 * - Aggiunge soltanto un LogEvento di *innesco* (`tipo: 'AUTOMATION'`), così
 *   resta traccia del tentativo anche quando la coda è vuota, quando il posto
 *   risulta ancora occupato, o quando la promozione fallisce per un dato
 *   sporco. La `CODA_PROMOZIONE` NON viene duplicata.
 *
 * `promuoviPrimoInCoda` ritorna `null` (senza lanciare) se la coda è vuota o il
 * posto è ancora occupato: è un esito atteso, non un errore.
 *
 * L'helper è pensato per essere richiamato da più automazioni: oggi dal
 * rilascio no-show (BIB-40 / CA-04), in futuro dal percorso "SCADUTA" della
 * finestra di conferma (BIB-44), che potrà riusarlo senza modifiche.
 *
 * @param slot posto e intervallo appena liberati
 * @param correlationId ID univoco che correla tutti gli eventi della stessa catena di rilascio+promozione (BIB-46 / CA-05)
 * @returns `EsitoProcessaCoda` — `promossa` è true solo se è stata
 *          effettivamente creata una nuova prenotazione a partire dalla coda;
 *          `prenotazioneId`/`userId` valorizzati solo in quel caso
 */
export async function processaCodaPerPosto(
  slot: {
    postoId: string;
    data: Date;
    oraInizio: Date;
    oraFine: Date;
  },
  correlationId?: string,
): Promise<EsitoProcessaCoda> {
  // Rappresentazione compatta e serializzabile dello slot, riusata in ogni
  // esito del LogEvento di innesco (utile per gli audit anche a coda vuota).
  const dettagliSlot = {
    postoId: slot.postoId,
    data: slot.data.toISOString().slice(0, 10), // "YYYY-MM-DD"
    oraInizio: slot.oraInizio.toISOString().slice(11, 16), // "HH:MM"
    oraFine: slot.oraFine.toISOString().slice(11, 16), // "HH:MM"
  };

  let promozione: PromozioneCoda | null = null;
  let errore: string | undefined;

  try {
    // Unica responsabilità: invocare il dominio. `prisma` fa da
    // PrismaTransactionRunner (espone `$transaction`).
    promozione = await promuoviPrimoInCoda(
      {
        postoId: slot.postoId,
        data: slot.data,
        oraInizio: slot.oraInizio,
        oraFine: slot.oraFine,
      },
      prisma,
    );
  } catch (err) {
    // Un singolo slot problematico (es. prenotazione stantia con data ormai
    // nel passato, che fa fallire la validazione dell'intervallo) non deve
    // interrompere il resto del giro di automazioni: lo si registra e basta.
    errore = err instanceof Error ? err.message : String(err);
    console.error('❌ Errore innesco promozione coda:', err);
  }

  // Esito leggibile per descrizione e dettagli del log.
  const esito: 'promossa' | 'coda_vuota' | 'errore' = errore
    ? 'errore'
    : promozione
      ? 'promossa'
      : 'coda_vuota';

  // LogEvento di *innesco*: sempre scritto, così ogni tentativo lascia traccia.
  // BIB-46 / CA-05: arricchimento audit con correlationId e attore.
  await prisma.logEvento.create({
    data: {
      tipo: 'AUTOMATION',
      // Si collega utente/prenotazione promossi solo se esistono davvero.
      targetUserId: promozione?.prenotazione.userId ?? null,
      prenotazioneId: promozione?.prenotazione.id ?? null,
      descrizione: `Innesco promozione lista d'attesa per posto ${slot.postoId} (esito: ${esito})`,
      dettagli: {
        ...dettagliSlot,
        esito,
        prenotazioneId: promozione?.prenotazione.id ?? null,
        listaAttesaId: promozione?.richiestaId ?? null,
        utenteId: promozione?.prenotazione.userId ?? null,
        errore: errore ?? null,
        // BIB-46 / CA-05: attore standardizzato e correlationId per ricostruire la catena.
        attore: attoreAutomazione(),
        correlationId: correlationId ?? null,
      },
    },
  });

  return {
    promossa: promozione !== null,
    prenotazioneId: promozione?.prenotazione.id,
    // BIB-42 / CA-05: chi chiama usa questo id per la notifica CODA_PROMOZIONE.
    userId: promozione?.prenotazione.userId,
  };
}

/**
 * 3️⃣ RILASCIO AUTOMATICO NO-SHOW
 * Libera i posti di prenotazioni confermate senza check-in dopo 15 minuti dall'ora di inizio
 *
 * BIB-46 / CA-05: ogni catena di rilascio+promozione è correlata da un `correlationId`
 * univoco, così gli audit log consentono di ricostruire l'intera storia di una promozione.
 */
export async function releaseNoShowReservations() {
  const now = new Date();
  const minus15Minutes = new Date(now.getTime() - 15 * 60 * 1000);

  // Trova prenotazioni confermate con ora inizio passata da più di 15 minuti
  const prenotazioni = await prisma.prenotazione.findMany({
    where: {
      stato: StatoPrenotazione.CONFERMATA,
      data: {
        lte: now,
      },
      oraInizio: {
        lte: minus15Minutes,
      },
    },
    include: {
      user: true,
      posto: {
        include: {
          sala: true,
        },
      },
    },
  });

  // BIB-47 / CA-04: proteggi le prenotazioni nate da una promozione di coda
  // entro la finestra di conferma. Sono per uno slot già iniziato da oltre 15
  // minuti (è l'unico caso in cui un no-show promuove qualcuno): senza questa
  // esclusione la run successiva del cron le marcherebbe subito NO_SHOW, prima
  // che il promosso possa fare check-in — la catena no-show → promozione non
  // sarebbe idempotente e scavalcherebbe la finestra di BIB-44. Trascorsa la
  // finestra se ne occupa `scadiPromozioniNonConfermate` (che gira PRIMA di
  // questo passo, vedi `runAllAutomations`), che le porta a `SCADUTA`; a quel
  // punto non sono più `CONFERMATA` e questa query non le riseleziona.
  // Le prenotazioni "normali" (senza LogEvento `CODA_PROMOZIONE` recente) non
  // sono toccate: il comportamento di baseline resta invariato.
  const finestraConferma = new Date(
    now.getTime() - FINESTRA_CONFERMA_PROMOZIONE_MINUTI * 60 * 1000,
  );
  const idProtetti = new Set(
    prenotazioni.length === 0
      ? []
      : (
          await prisma.logEvento.findMany({
            where: {
              tipo: 'CODA_PROMOZIONE',
              prenotazioneId: { in: prenotazioni.map((p) => p.id) },
              createdAt: { gte: finestraConferma },
            },
            select: { prenotazioneId: true },
          })
        )
          .map((e) => e.prenotazioneId)
          .filter((id): id is string => id !== null),
  );
  const daProcessare = prenotazioni.filter((p) => !idProtetti.has(p.id));

  let count = 0;
  // Quante promozioni dalla lista d'attesa sono state effettivamente innescate
  // dai posti liberati in questo giro (BIB-40 / CA-04).
  let promoted = 0;
  // BIB-46 / CA-05: lista dei correlationId della run, per il riepilogo finale.
  const correlationIds: string[] = [];

  for (const prenotazione of daProcessare) {
    // BIB-46 / CA-05: genera un correlationId univoco per questa catena di rilascio+promozione.
    const correlationId = randomUUID();
    correlationIds.push(correlationId);

    // Aggiorna prenotazione a NO_SHOW
    await prisma.prenotazione.update({
      where: { id: prenotazione.id },
      data: {
        stato: StatoPrenotazione.NO_SHOW,
      },
    });

    // Libera il posto
    await prisma.posto.update({
      where: { id: prenotazione.postoId },
      data: {
        stato: StatoPosto.DISPONIBILE,
      },
    });

    // Notifica utente
    await prisma.notifica.create({
      data: {
        userId: prenotazione.userId,
        tipo: TipoNotifica.ALERT,
        titolo: '❌ Prenotazione annullata per no-show',
        messaggio: `La tua prenotazione per il posto ${prenotazione.posto.numero} in ${prenotazione.posto.sala.nome} è stata annullata perché non hai fatto check-in entro 15 minuti dall'orario di inizio.`,
        actionUrl: '/prenotazioni',
      },
    });

    // Log evento
    // BIB-46 / CA-05: arricchimento audit con correlationId e attore.
    await prisma.logEvento.create({
      data: {
        tipo: 'NO_SHOW_AUTO',
        userId: prenotazione.userId,
        prenotazioneId: prenotazione.id,
        descrizione: `Rilascio automatico posto ${prenotazione.posto.numero} per no-show`,
        dettagli: {
          prenotazioneId: prenotazione.id,
          userId: prenotazione.userId,
          postoId: prenotazione.postoId,
          oraInizio: prenotazione.oraInizio,
          rilasciatoAlle: now,
          // BIB-46 / CA-05: attore standardizzato e correlationId per ricostruire la catena.
          attore: attoreAutomazione(),
          correlationId,
        },
      },
    });

    count++;

    // 🔁 CA-04 (BIB-40): il posto è appena tornato DISPONIBILE per questo slot.
    // Si innesca l'elaborazione della lista d'attesa invocando la funzione di
    // dominio tramite l'helper riusabile (nessun errore se la coda è vuota).
    // BIB-46 / CA-05: passa il correlationId per propagarlo nella catena.
    const esitoCoda = await processaCodaPerPosto(
      {
        postoId: prenotazione.postoId,
        data: prenotazione.data,
        oraInizio: prenotazione.oraInizio,
        oraFine: prenotazione.oraFine,
      },
      correlationId,
    );
    if (esitoCoda.promossa) {
      promoted++;

      // 🔔 CA-05 (BIB-42): l'utente promosso dalla lista d'attesa riceve una
      // notifica dedicata che punta alla prenotazione appena creata.
      // `notificaEventoCoda` è best-effort (gestisce da sé gli errori): un
      // fallimento qui non deve fermare il giro delle automazioni.
      // BIB-46 / CA-05: passa il correlationId per propagarlo nella catena.
      if (esitoCoda.userId) {
        await notificaEventoCoda({
          userId: esitoCoda.userId,
          tipo: 'CODA_PROMOZIONE',
          posto: {
            numero: prenotazione.posto.numero,
            salaNome: prenotazione.posto.sala.nome,
          },
          prenotazioneId: esitoCoda.prenotazioneId,
          correlationId,
        });
      }
    }
  }

  // BIB-46 / CA-05: scrivi un unico LogEvento di riepilogo run con vista d'insieme.
  if (count > 0) {
    await prisma.logEvento.create({
      data: {
        tipo: 'AUTOMATION',
        descrizione: `Riepilogo run rilascio no-show: ${count} rilasci, ${promoted} promozioni`,
        dettagli: {
          processo: 'releaseNoShowReservations',
          rilasci: count,
          promozioni: promoted,
          correlationIds,
          timestamp: now.toISOString(),
          // BIB-46 / CA-05: attore standardizzato per il riepilogo.
          attore: attoreAutomazione(),
        },
      },
    });
  }

  return {
    released: count,
    promoted,
    message: `${count} posti liberati per no-show, ${promoted} promozioni dalla lista d'attesa`,
  };
}

/**
 * ⏳ FINESTRA DI CONFERMA DELLA PROMOZIONE (BIB-44 / CA-04)
 *
 * Minuti a disposizione di chi viene promosso dalla lista d'attesa per
 * *confermare* il posto. Trascorsa la finestra la richiesta decade, la
 * prenotazione creata dalla promozione viene marcata `SCADUTA`, il posto torna
 * disponibile e passa al successivo in coda.
 */
export const FINESTRA_CONFERMA_PROMOZIONE_MINUTI = 15;

/**
 * 📌 ASSUNZIONE DI PROGETTO — COSA SIGNIFICA "CONFERMARE" (BIB-44 / CA-04)
 *
 * Nel modello dati attuale NON esiste un endpoint di conferma dedicato né uno
 * stato "in attesa di conferma" (`StatoListaAttesa` ha solo IN_ATTESA, PROMOSSA,
 * SCADUTA, ANNULLATA) — e lo schema Prisma qui NON si tocca. L'atto con cui
 * l'utente promosso dimostra di volere davvero il posto è quindi il **check-in**
 * sulla prenotazione nata dalla promozione:
 *
 *   confermata  ⇔  `prenotazione.checkInAt != null`
 *                  oppure `prenotazione.stato ∈ { CHECK_IN, COMPLETATA }`
 *
 * (`COMPLETATA` è inclusa perché una sessione già chiusa implica il check-in,
 * anche se `checkInAt` fosse stato ripulito.) Un endpoint di conferma esplicito
 * è fuori scope: è materia di BIB-51 / Fase 5.
 */
const STATI_PROMOZIONE_CONFERMATA: ReadonlySet<StatoPrenotazione> = new Set([
  StatoPrenotazione.CHECK_IN,
  StatoPrenotazione.COMPLETATA,
]);

/** Proiezione minima della prenotazione nata da una promozione. */
type PrenotazionePromozione = {
  id: string;
  stato: StatoPrenotazione;
  checkInAt: Date | null;
};

/** Richiesta `PROMOSSA` da valutare, con i dati del posto per il testo della notifica. */
type RichiestaPromossa = {
  id: string;
  userId: string;
  postoId: string;
  data: Date;
  oraInizio: Date;
  oraFine: Date;
  updatedAt: Date;
  posto: { numero: string; sala: { nome: string } };
};

/** Esito di `scadiPromozioniNonConfermate`. */
export type EsitoScadenzaPromozioni = {
  /** Richieste portate da `PROMOSSA` a `SCADUTA` in questo giro. */
  scadute: number;
  /** Nuove promozioni innescate sui posti liberati dalle scadenze. */
  promozioniInnescate: number;
  message: string;
};

/**
 * Errore *interno* usato come segnale di rollback: se fra la lettura e la
 * transazione l'utente fa check-in, la guardia sulla prenotazione fallisce e si
 * annulla anche la chiusura della richiesta di coda già scritta nella stessa
 * transazione. Non è un errore da segnalare: è l'esito "confermato in extremis".
 */
class ConfermaSopraggiunta extends Error {
  constructor() {
    super('Promozione confermata mentre veniva valutata la scadenza');
    this.name = 'ConfermaSopraggiunta';
  }
}

/** `true` se la prenotazione testimonia una promozione confermata dall'utente. */
function promozioneConfermata(prenotazione: PrenotazionePromozione): boolean {
  return (
    prenotazione.checkInAt !== null ||
    STATI_PROMOZIONE_CONFERMATA.has(prenotazione.stato)
  );
}

/** Rappresentazione compatta e serializzabile dello slot di una richiesta di coda. */
function dettagliSlotRichiesta(richiesta: RichiestaPromossa) {
  return {
    listaAttesaId: richiesta.id,
    postoId: richiesta.postoId,
    data: richiesta.data.toISOString().slice(0, 10), // "YYYY-MM-DD"
    oraInizio: richiesta.oraInizio.toISOString().slice(11, 16), // "HH:MM"
    oraFine: richiesta.oraFine.toISOString().slice(11, 16), // "HH:MM"
  };
}

/**
 * 🔎 RISALE ALLA PRENOTAZIONE CREATA DALLA PROMOZIONE
 *
 * `ListaAttesa` non ha una FK verso la `Prenotazione` generata (e lo schema non
 * si tocca), quindi il collegamento si ricostruisce dall'audit trail: la
 * promozione scrive un `LogEvento` `CODA_PROMOZIONE` con `targetUserId`
 * dell'utente, `prenotazioneId` valorizzato e `dettagli.listaAttesaId` uguale
 * all'id della richiesta. Si prende il più recente.
 *
 * Ripiego: se il log manca (dati precedenti a BIB-40, o log ripuliti) si cerca
 * la prenotazione dell'utente sullo *stesso identico slot*. È un filtro stretto
 * — utente + posto + data + intervallo — quindi non può pescare la prenotazione
 * di un altro utente promosso dopo di lui.
 */
async function trovaPrenotazioneDellaPromozione(
  richiesta: RichiestaPromossa,
): Promise<PrenotazionePromozione | null> {
  const log = await prisma.logEvento.findFirst({
    where: {
      tipo: 'CODA_PROMOZIONE',
      targetUserId: richiesta.userId,
      prenotazioneId: { not: null },
      dettagli: { path: ['listaAttesaId'], equals: richiesta.id },
    },
    orderBy: { createdAt: 'desc' },
    select: { prenotazioneId: true },
  });

  if (log?.prenotazioneId) {
    return prisma.prenotazione.findUnique({
      where: { id: log.prenotazioneId },
      select: { id: true, stato: true, checkInAt: true },
    });
  }

  return prisma.prenotazione.findFirst({
    where: {
      userId: richiesta.userId,
      postoId: richiesta.postoId,
      data: richiesta.data,
      oraInizio: richiesta.oraInizio,
      oraFine: richiesta.oraFine,
      stato: {
        in: [
          StatoPrenotazione.CONFERMATA,
          StatoPrenotazione.CHECK_IN,
          StatoPrenotazione.COMPLETATA,
        ],
      },
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true, stato: true, checkInAt: true },
  });
}

/**
 * 5️⃣ SCADENZA DELLE PROMOZIONI NON CONFERMATE (BIB-44 / CA-04)
 *
 * Chi viene promosso dalla lista d'attesa ha `FINESTRA_CONFERMA_PROMOZIONE_MINUTI`
 * per confermare (= fare check-in, vedi l'assunzione sopra). Se non lo fa:
 *  1. la sua `ListaAttesa` passa a `SCADUTA`;
 *  2. la `Prenotazione` nata dalla promozione passa a `SCADUTA` e il `Posto`
 *     torna `DISPONIBILE`;
 *  3. l'utente decaduto riceve la notifica `CODA_SCADENZA`;
 *  4. il posto viene riofferto al **successivo in coda** riusando
 *     `processaCodaPerPosto` (che a sua volta chiama il dominio).
 *
 * ⏱️ ISTANTE DI PROMOZIONE — `ListaAttesa.updatedAt` con `stato = 'PROMOSSA'` è
 * l'unico timestamp disponibile senza aggiungere colonne: `updatedAt` viene
 * riscritto proprio dalla `updateMany` che porta la richiesta a `PROMOSSA`.
 *
 * ♻️ IDEMPOTENZA — ogni scrittura di stato è una `updateMany` con guardia sullo
 * stato atteso: se `count !== 1` un'altra esecuzione ha già gestito la riga e si
 * esce senza effetti. Le due guardie stanno nella stessa transazione
 * Serializable, quindi o cambiano entrambe o nessuna. Dopo il primo giro le
 * richieste non sono più `PROMOSSA`, quindi il secondo giro non le seleziona
 * nemmeno: niente doppie scadenze, doppie notifiche o doppie promozioni. Sulle
 * prenotazioni resta comunque il vincolo `EXCLUDE` del DB a impedire
 * sovrapposizioni sullo stesso posto.
 */
export async function scadiPromozioniNonConfermate(): Promise<EsitoScadenzaPromozioni> {
  const now = new Date();
  // Soglia: promosso da almeno FINESTRA minuti e ancora senza conferma.
  const sogliaPromozione = new Date(
    now.getTime() - FINESTRA_CONFERMA_PROMOZIONE_MINUTI * 60 * 1000,
  );

  const richieste = (await prisma.listaAttesa.findMany({
    where: {
      stato: StatoListaAttesa.PROMOSSA,
      updatedAt: { lte: sogliaPromozione },
    },
    include: { posto: { include: { sala: true } } },
    // Le più vecchie per prime: la coda resta equa anche in caso di arretrati.
    orderBy: { updatedAt: 'asc' },
  })) as unknown as RichiestaPromossa[];

  let scadute = 0;
  let promozioniInnescate = 0;
  // Promozioni che risultano confermate: nessuna azione, ma utili nel riepilogo.
  let confermate = 0;
  // BIB-46 / CA-05: un correlationId per ogni catena scadenza → nuova promozione.
  const correlationIds: string[] = [];

  for (const richiesta of richieste) {
    const correlationId = randomUUID();
    const descrizionePosto = {
      numero: richiesta.posto.numero,
      salaNome: richiesta.posto.sala.nome,
    };

    try {
      // 1️⃣ Qual è la prenotazione nata da questa promozione, e com'è andata?
      const prenotazione = await trovaPrenotazioneDellaPromozione(richiesta);

      // 2️⃣ Conferma arrivata in tempo → la richiesta ha avuto esito: non si scade.
      //    Non si scrive alcun log per non gonfiare l'audit a ogni giro di cron.
      if (prenotazione && promozioneConfermata(prenotazione)) {
        confermate++;
        continue;
      }

      // 2️⃣bis La prenotazione esiste ma è già in uno stato terminale diverso
      //    (CANCELLATA / NO_SHOW / SCADUTA): l'esito c'è già stato, non è una
      //    decadenza per mancata conferma. Si chiude comunque la richiesta di
      //    coda — altrimenti resterebbe `PROMOSSA` per sempre — ma senza
      //    toccare prenotazione e posto (li ha già gestiti chi li ha chiusi).
      const prenotazioneDaScadere =
        prenotazione !== null &&
        prenotazione.stato === StatoPrenotazione.CONFERMATA
          ? prenotazione
          : null;

      // 3️⃣ Transazione atomica: chiusura richiesta + decadenza prenotazione +
      //    rilascio posto + audit. Serializable per coerenza con il dominio.
      const chiusa = await prisma.$transaction(
        async (tx) => {
          // Guardia A — la richiesta deve essere ANCORA `PROMOSSA`.
          const richiestaChiusa = await tx.listaAttesa.updateMany({
            where: { id: richiesta.id, stato: StatoListaAttesa.PROMOSSA },
            data: { stato: StatoListaAttesa.SCADUTA },
          });

          if (richiestaChiusa.count !== 1) {
            // Un'altra esecuzione del cron l'ha già gestita: nessun effetto.
            return false;
          }

          if (prenotazioneDaScadere) {
            // Guardia B — la prenotazione deve essere ancora CONFERMATA e senza
            // check-in. Se nel frattempo l'utente ha confermato si annulla tutta
            // la transazione (compresa la guardia A) sollevando il segnale.
            const decaduta = await tx.prenotazione.updateMany({
              where: {
                id: prenotazioneDaScadere.id,
                stato: StatoPrenotazione.CONFERMATA,
                checkInAt: null,
              },
              data: { stato: StatoPrenotazione.SCADUTA },
            });

            if (decaduta.count !== 1) {
              throw new ConfermaSopraggiunta();
            }

            // Il posto torna disponibile solo se c'era davvero una prenotazione
            // nostra da chiudere: senza di essa non sappiamo chi lo occupa.
            await tx.posto.update({
              where: { id: richiesta.postoId },
              data: { stato: StatoPosto.DISPONIBILE },
            });
          }

          // Audit della decadenza (BIB-46 / CA-05: attore + correlationId).
          await tx.logEvento.create({
            data: {
              tipo: 'CODA_SCADENZA',
              targetUserId: richiesta.userId,
              prenotazioneId: prenotazioneDaScadere?.id ?? null,
              descrizione: `Promozione non confermata entro ${FINESTRA_CONFERMA_PROMOZIONE_MINUTI} minuti: richiesta scaduta`,
              dettagli: {
                ...dettagliSlotRichiesta(richiesta),
                utenteId: richiesta.userId,
                prenotazioneId: prenotazioneDaScadere?.id ?? null,
                // `false` quando la prenotazione non è stata trovata o era già
                // in uno stato terminale: utile in revisione.
                prenotazioneScaduta: prenotazioneDaScadere !== null,
                finestraMinuti: FINESTRA_CONFERMA_PROMOZIONE_MINUTI,
                promossoAlle: richiesta.updatedAt.toISOString(),
                scadutoAlle: now.toISOString(),
                attore: attoreAutomazione(),
                correlationId,
              },
            },
          });

          return true;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );

      if (!chiusa) {
        // Guardia A fallita: la riga era già stata chiusa altrove.
        continue;
      }

      scadute++;
      correlationIds.push(correlationId);

      // 4️⃣ Avviso all'utente decaduto (best-effort: non lancia mai).
      await notificaScadenzaCoda(richiesta.userId, {
        posto: descrizionePosto,
        richiestaId: richiesta.id,
        correlationId,
      });

      // 5️⃣ Fuori dalla transazione — come fa `releaseNoShowReservations` — si
      //    rioffre lo slot al successivo in coda. `processaCodaPerPosto`
      //    assorbe da sé sia la coda vuota sia gli errori del dominio.
      const esitoCoda = await processaCodaPerPosto(
        {
          postoId: richiesta.postoId,
          data: richiesta.data,
          oraInizio: richiesta.oraInizio,
          oraFine: richiesta.oraFine,
        },
        correlationId,
      );

      if (esitoCoda.promossa) {
        promozioniInnescate++;

        // Il nuovo promosso riceve la notifica `CODA_PROMOZIONE`, esattamente
        // come nella catena del no-show (BIB-42 / CA-05).
        if (esitoCoda.userId) {
          await notificaEventoCoda({
            userId: esitoCoda.userId,
            tipo: 'CODA_PROMOZIONE',
            posto: descrizionePosto,
            prenotazioneId: esitoCoda.prenotazioneId,
            correlationId,
          });
        }
      }
    } catch (err) {
      if (err instanceof ConfermaSopraggiunta) {
        // Check-in arrivato fra la lettura e la transazione: rollback completo,
        // nessuna scadenza. Si tiene traccia perché è una corsa interessante.
        confermate++;
        await prisma.logEvento.create({
          data: {
            tipo: 'AUTOMATION',
            targetUserId: richiesta.userId,
            descrizione: `Scadenza promozione annullata: conferma sopraggiunta (richiesta ${richiesta.id})`,
            dettagli: {
              ...dettagliSlotRichiesta(richiesta),
              esito: 'confermata',
              attore: attoreAutomazione(),
              correlationId,
            },
          },
        });
        continue;
      }

      // Robustezza: una richiesta problematica non interrompe il giro.
      const errore = err instanceof Error ? err.message : String(err);
      console.error('❌ Errore scadenza promozione lista d\'attesa:', err);
      await prisma.logEvento.create({
        data: {
          tipo: 'AUTOMATION',
          targetUserId: richiesta.userId,
          descrizione: `Errore nella scadenza della promozione (richiesta ${richiesta.id})`,
          dettagli: {
            ...dettagliSlotRichiesta(richiesta),
            esito: 'errore',
            errore,
            attore: attoreAutomazione(),
            correlationId,
          },
        },
      });
    }
  }

  // Riepilogo run solo se qualcosa è davvero scaduto: così una seconda
  // esecuzione ravvicinata non lascia alcuna traccia (idempotenza end-to-end).
  if (scadute > 0) {
    await prisma.logEvento.create({
      data: {
        tipo: 'AUTOMATION',
        descrizione: `Riepilogo run scadenza promozioni: ${scadute} scadute, ${promozioniInnescate} promozioni`,
        dettagli: {
          processo: 'scadiPromozioniNonConfermate',
          scadute,
          promozioni: promozioniInnescate,
          confermate,
          finestraMinuti: FINESTRA_CONFERMA_PROMOZIONE_MINUTI,
          correlationIds,
          timestamp: now.toISOString(),
          attore: attoreAutomazione(),
        },
      },
    });
  }

  return {
    scadute,
    promozioniInnescate,
    message: `${scadute} promozioni scadute per mancata conferma, ${promozioniInnescate} promozioni dalla lista d'attesa`,
  };
}

/**
 * 4️⃣ NOTIFICA POSTO LIBERATO
 * Quando un posto viene liberato in anticipo, notifica gli utenti che hanno preferenze simili
 * (questa è chiamata manualmente dalla cancellazione prenotazione, non è periodica)
 */
export async function notifyAvailableSeat(prenotazione: {
  id: string;
  data: Date;
  oraInizio: Date;
  oraFine: Date;
  posto: {
    id: string;
    numero: number;
    sala: {
      id: string;
      nome: string;
    };
    presaElettrica: boolean;
    vistaFinestra: boolean;
    accessibile: boolean;
  };
}) {
  // Trova utenti che hanno prenotato posti simili negli ultimi 30 giorni
  const usersWithSimilarPreferences = await prisma.user.findMany({
    where: {
      prenotazioni: {
        some: {
          posto: {
            OR: [
              { salaId: prenotazione.posto.sala.id }, // Stessa sala
              { haPresaElettrica: prenotazione.posto.presaElettrica },
              { isAccessibile: prenotazione.posto.accessibile },
            ],
          },
          createdAt: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          },
        },
      },
    },
    take: 10, // Max 10 notifiche
  });

  let count = 0;

  for (const user of usersWithSimilarPreferences) {
    await prisma.notifica.create({
      data: {
        userId: user.id,
        tipo: TipoNotifica.INFO,
        titolo: '✨ Posto disponibile!',
        messaggio: `Un posto simile a quelli che prenoti di solito è appena diventato disponibile: Posto ${prenotazione.posto.numero} in ${prenotazione.posto.sala.nome} per il ${prenotazione.data.toLocaleDateString('it-IT')} dalle ${prenotazione.oraInizio.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}.`,
        actionUrl: '/prenota',
      },
    });

    count++;
  }

  await prisma.logEvento.create({
    data: {
      tipo: 'AUTOMATION',
      descrizione: `Notifiche posto liberato inviate per posto ${prenotazione.posto.numero}`,
      dettagli: {
        postoId: prenotazione.posto.id,
        notifiche: count,
      },
    },
  });

  return { notified: count, message: `${count} utenti notificati di posto disponibile` };
}

/**
 * 🎯 ESEGUI TUTTE LE AUTOMAZIONI
 * Funzione principale da chiamare dal cron job
 */
export async function runAllAutomations() {
  console.log('🤖 Avvio automazioni:', new Date().toISOString());

  const results = {
    timestamp: new Date(),
    reminders: { sent: 0 },
    loanAlerts: { sent: 0 },
    // `promoted`: promozioni dalla lista d'attesa innescate dai no-show liberati
    // (BIB-40 / CA-04). `released` resta invariato per retro-compatibilità.
    noShows: { released: 0, promoted: 0 },
    // BIB-44 / CA-04 — campo *additivo*: promozioni decadute per mancata
    // conferma entro la finestra e nuove promozioni che ne sono derivate.
    // I campi preesistenti non cambiano, quindi i consumatori restano validi.
    promozioniScadute: { scadute: 0, promozioniInnescate: 0 },
    errors: [] as string[],
  };

  try {
    // 1. Reminder check-in
    const reminders = await sendCheckInReminders();
    results.reminders = reminders;
    console.log('✅ Reminders:', reminders);
  } catch (error) {
    console.error('❌ Errore reminders:', error);
    results.errors.push(`Reminders: ${error}`);
  }

  try {
    // 2. Alert scadenza prestiti
    const loanAlerts = await sendLoanExpiryAlerts();
    results.loanAlerts = loanAlerts;
    console.log('✅ Loan alerts:', loanAlerts);
  } catch (error) {
    console.error('❌ Errore loan alerts:', error);
    results.errors.push(`Loan alerts: ${error}`);
  }

  try {
    // 3. Scadenza delle promozioni non confermate (BIB-44 / CA-04).
    //    BIB-47: va PRIMA del rilascio no-show. Così, quando la finestra di
    //    conferma è scaduta, questo passo porta la prenotazione della promozione
    //    a `SCADUTA` e promuove il successivo; il passo di no-show — che filtra
    //    `stato = CONFERMATA` — non la vede più e non c'è doppia gestione.
    //    Le promozioni ancora dentro la finestra restano protette qui
    //    (`updatedAt` recente) e nel no-show (grazia su `createdAt`).
    const promozioniScadute = await scadiPromozioniNonConfermate();
    results.promozioniScadute = promozioniScadute;
    console.log('✅ Promozioni scadute:', promozioniScadute);
  } catch (error) {
    console.error('❌ Errore scadenza promozioni:', error);
    results.errors.push(`Promozioni scadute: ${error}`);
  }

  try {
    // 4. Rilascio no-show
    const noShows = await releaseNoShowReservations();
    results.noShows = noShows;
    console.log('✅ No-shows:', noShows);
  } catch (error) {
    console.error('❌ Errore no-shows:', error);
    results.errors.push(`No-shows: ${error}`);
  }

  console.log('🎯 Automazioni completate:', results);

  return results;
}
