/**
 * 🔄 Real-time Events Service
 *
 * Funzioni helper per emettere eventi real-time quando
 * lo stato dei posti o altri dati cambiano.
 *
 * Uso in API routes:
 * ```ts
 * import { emitPostoUpdate } from '@/lib/realtime-events';
 *
 * // Dopo aver aggiornato un posto nel DB
 * await emitPostoUpdate(posto.id, 'OCCUPATO', posto.numero, posto.salaId);
 * ```
 *
 * Eventi emessi sul canale `posti`:
 * - `posto-update`        → aggiornamento singolo posto (mappa)
 * - `occupazione-update`  → percentuale di occupazione di una sala
 * - `coda-ingresso`       → un utente è entrato in lista d'attesa (BIB-45, CA-06)
 * - `coda-promozione`     → il primo in coda ha ottenuto una prenotazione (BIB-45, CA-06)
 *
 * Eventi emessi sul canale personale `user-<id>`:
 * - `nuova-notifica`      → notifica realtime per un singolo utente
 *                           (usata anche per avvisare l'utente promosso dalla coda)
 *
 * NOTA CA-06: `coda-ingresso` / `coda-promozione` sono nomi-evento nuovi. I client
 * che ascoltano solo `posto-update` / `occupazione-update` li ignorano senza
 * errori (EventSource consegna un evento solo agli `addEventListener` registrati),
 * quindi la mappa posti continua a funzionare esattamente come prima.
 */

import { sseEmitter } from './sse-emitter';
import { prisma } from './prisma';

/**
 * Emette evento di aggiornamento posto
 */
export function emitPostoUpdate(
  postoId: string,
  stato: 'DISPONIBILE' | 'OCCUPATO' | 'MANUTENZIONE',
  numero: string,
  salaId: string,
  salaNome?: string
): void {
  sseEmitter.emit('posti', 'posto-update', {
    postoId,
    stato,
    numero,
    salaId,
    salaNome,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Emette evento di aggiornamento occupazione sala
 */
export async function emitOccupazioneUpdate(salaId: string): Promise<void> {
  try {
    const [sala, stats] = await Promise.all([
      prisma.sala.findUnique({ where: { id: salaId } }),
      prisma.posto.groupBy({
        by: ['stato'],
        where: { salaId },
        _count: true,
      }),
    ]);

    if (!sala) return;

    const totale = stats.reduce((acc, s) => acc + s._count, 0);
    const disponibili = stats.find(s => s.stato === 'DISPONIBILE')?._count || 0;
    const percentuale = totale > 0 ? Math.round(((totale - disponibili) / totale) * 100) : 0;

    sseEmitter.emit('posti', 'occupazione-update', {
      salaId,
      salaNome: sala.nome,
      disponibili,
      totale,
      percentuale,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Errore emitOccupazioneUpdate:', error);
  }
}

/**
 * Emette aggiornamento completo di tutte le sale
 */
export async function emitOccupazioneCompleta(): Promise<void> {
  try {
    const sale = await prisma.sala.findMany({
      include: {
        posti: {
          select: { stato: true },
        },
      },
    });

    for (const sala of sale) {
      const totale = sala.posti.length;
      const disponibili = sala.posti.filter(p => p.stato === 'DISPONIBILE').length;
      const percentuale = totale > 0 ? Math.round(((totale - disponibili) / totale) * 100) : 0;

      sseEmitter.emit('posti', 'occupazione-update', {
        salaId: sala.id,
        salaNome: sala.nome,
        disponibili,
        totale,
        percentuale,
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error) {
    console.error('Errore emitOccupazioneCompleta:', error);
  }
}

/**
 * Emette notifica real-time a un utente specifico
 */
export function emitNotificaRealtime(
  userId: string,
  notifica: {
    id: string;
    tipo: string;
    titolo: string;
    messaggio: string;
    actionUrl?: string;
  }
): void {
  sseEmitter.emit(`user-${userId}`, 'nuova-notifica', {
    ...notifica,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Payload dell'evento `coda-ingresso` (prima del `timestamp`, aggiunto in emissione).
 *
 * È un evento "di sala": viene mandato in broadcast sul canale pubblico `posti`
 * e NON contiene dati identificativi dell'utente. Serve alle viste che mostrano
 * lo stato della coda (mappa posti, pannello sala) per aggiornare in tempo reale
 * quante persone sono in attesa e in che posizione.
 */
export interface CodaIngressoPayload {
  /** Posto su cui si è formata / allungata la coda */
  postoId: string;
  /** Numero/etichetta del posto: evita al client una query solo per l'UI */
  numero: string;
  /** Sala del posto, per filtrare gli aggiornamenti nella vista di una singola sala */
  salaId: string;
  /** Giorno della richiesta in coda, formato ISO `YYYY-MM-DD` */
  data: string;
  /** Ora di inizio dello slot richiesto, formato `HH:mm` */
  oraInizio: string;
  /** Ora di fine dello slot richiesto, formato `HH:mm` */
  oraFine: string;
  /** Posizione FIFO di chi è appena entrato in coda (1 = primo in attesa) */
  posizione: number;
}

/**
 * Payload dell'evento `coda-promozione` (prima del `timestamp`, aggiunto in emissione).
 *
 * Viene usato su due canali: come evento "di sala" sul canale pubblico `posti`
 * e — riusando `emitNotificaRealtime` — come notifica personale sul canale
 * `user-<userId>` dell'utente promosso.
 */
export interface CodaPromozionePayload {
  /** Utente promosso: determina il canale personale `user-<userId>` */
  userId: string;
  /** Posto assegnato dalla promozione */
  postoId: string;
  /** Numero/etichetta del posto, per l'UI */
  numero: string;
  /** Prenotazione confermata creata dalla promozione (per il link "vai alla prenotazione") */
  prenotazioneId: string;
  /** Giorno della prenotazione, formato ISO `YYYY-MM-DD` */
  data: string;
  /** Ora di inizio dello slot, formato `HH:mm` */
  oraInizio: string;
  /** Ora di fine dello slot, formato `HH:mm` */
  oraFine: string;
}

/**
 * Emette l'evento di ingresso in lista d'attesa (BIB-45, CA-06).
 *
 * Canale: `posti` (lo stesso della mappa). Nome-evento: `coda-ingresso`, non
 * usato altrove: i client "vecchi" lo ignorano nativamente. La forma e il canale
 * degli eventi già esistenti (`posto-update`, `occupazione-update`) non cambiano.
 *
 * @param payload dati della richiesta appena inserita in coda
 */
export function emitCodaIngresso(payload: CodaIngressoPayload): void {
  sseEmitter.emit('posti', 'coda-ingresso', {
    ...payload,
    // `timestamp` ISO 8601, coerente con tutti gli altri eventi realtime
    timestamp: new Date().toISOString(),
  });
}

/**
 * Emette la promozione dalla coda (BIB-45, CA-06) su DUE canali:
 *
 * 1. `posti` / `coda-promozione` — evento "di sala": aggiorna mappa e pannello
 *    coda per chiunque stia guardando quella sala.
 * 2. `user-<userId>` / `nuova-notifica` — notifica personale per l'utente
 *    promosso. Si RIUSA `emitNotificaRealtime` così da non introdurre un nuovo
 *    contratto sul canale utente: il campanello notifiche continua a funzionare
 *    come prima. L'`id` è derivato dalla prenotazione, quindi stabile e unico
 *    per promozione (evita notifiche duplicate lato client su re-emissione).
 *
 * Nessun evento/payload esistente cambia forma: qui si aggiunge solo un nuovo
 * produttore di `nuova-notifica`.
 *
 * @param payload dati dell'utente promosso e della prenotazione creata
 */
export function emitCodaPromozione(payload: CodaPromozionePayload): void {
  // 1) Evento pubblico sul canale della mappa posti.
  sseEmitter.emit('posti', 'coda-promozione', {
    ...payload,
    timestamp: new Date().toISOString(),
  });

  // 2) Notifica mirata all'utente promosso, sul suo canale personale,
  //    riusando il contratto `nuova-notifica` già consumato dall'UI.
  emitNotificaRealtime(payload.userId, {
    id: `coda-promozione-${payload.prenotazioneId}`,
    tipo: 'CODA_PROMOZIONE',
    titolo: "Sei stato promosso dalla lista d'attesa",
    messaggio: `Il posto ${payload.numero} è ora prenotato a tuo nome per il ${payload.data}, dalle ${payload.oraInizio} alle ${payload.oraFine}.`,
    actionUrl: `/prenotazioni/${payload.prenotazioneId}`,
  });
}

/**
 * Broadcast messaggio a tutti i client connessi
 */
export function broadcastMessage(
  event: string,
  data: Record<string, unknown>
): void {
  sseEmitter.broadcast(event, {
    ...data,
    timestamp: new Date().toISOString(),
  });
}
