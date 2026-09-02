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
 */

import { prisma } from '@/lib/prisma';
import { StatoPrenotazione, StatoPosto, TipoNotifica } from '@prisma/client';
// La promozione dalla coda NON viene reimplementata qui: si invoca la funzione
// di dominio già pronta (transazionale Serializable + FOR UPDATE SKIP LOCKED,
// idempotente, e che scrive da sé il LogEvento `CODA_PROMOZIONE`).
import {
  promuoviPrimoInCoda,
  type PromozioneCoda,
} from '@/lib/prenotazioni-service';

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
 * @returns `{ promossa, prenotazioneId? }` — `promossa` è true solo se è stata
 *          effettivamente creata una nuova prenotazione a partire dalla coda
 */
export async function processaCodaPerPosto(slot: {
  postoId: string;
  data: Date;
  oraInizio: Date;
  oraFine: Date;
}): Promise<{ promossa: boolean; prenotazioneId?: string }> {
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
      },
    },
  });

  return {
    promossa: promozione !== null,
    prenotazioneId: promozione?.prenotazione.id,
  };
}

/**
 * 3️⃣ RILASCIO AUTOMATICO NO-SHOW
 * Libera i posti di prenotazioni confermate senza check-in dopo 15 minuti dall'ora di inizio
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

  let count = 0;
  // Quante promozioni dalla lista d'attesa sono state effettivamente innescate
  // dai posti liberati in questo giro (BIB-40 / CA-04).
  let promoted = 0;

  for (const prenotazione of prenotazioni) {
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
    await prisma.logEvento.create({
      data: {
        tipo: 'NO_SHOW_AUTO',
        descrizione: `Rilascio automatico posto ${prenotazione.posto.numero} per no-show`,
        dettagli: {
          prenotazioneId: prenotazione.id,
          userId: prenotazione.userId,
          postoId: prenotazione.postoId,
          oraInizio: prenotazione.oraInizio,
          rilasciatoAlle: now,
        },
      },
    });

    count++;

    // 🔁 CA-04 (BIB-40): il posto è appena tornato DISPONIBILE per questo slot.
    // Si innesca l'elaborazione della lista d'attesa invocando la funzione di
    // dominio tramite l'helper riusabile (nessun errore se la coda è vuota).
    const esitoCoda = await processaCodaPerPosto({
      postoId: prenotazione.postoId,
      data: prenotazione.data,
      oraInizio: prenotazione.oraInizio,
      oraFine: prenotazione.oraFine,
    });
    if (esitoCoda.promossa) {
      promoted++;
    }
  }

  return {
    released: count,
    promoted,
    message: `${count} posti liberati per no-show, ${promoted} promozioni dalla lista d'attesa`,
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
    // 3. Rilascio no-show
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
