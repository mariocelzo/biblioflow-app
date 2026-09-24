import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { promuoviPrimoInCoda } from "@/lib/prenotazioni-service";
import { emitCodaPromozione } from "@/lib/realtime-events";
import { staffCriticalApiRateLimiter } from "@/lib/rate-limit";

type PrenotazioneCancellata = {
  id: string;
  postoId: string;
  data: Date;
  oraInizio: Date;
  oraFine: Date;
  posto: {
    numero: string;
  };
};

type AttorePersonale = {
  id: string;
  email?: string | null;
  ruolo?: string;
};

type EsitoPromozioneAdmin = {
  richiestaId: string;
  prenotazioneId: string;
  userId: string;
  postoId: string;
  // BIB-50 / CA-06: nome e cognome dell'utente promosso, così che il feedback
  // nell'interfaccia admin dica *chi* è stato promosso senza leggere i log.
  utente?: { nome: string; cognome: string };
};

function dataIso(data: Date): string {
  return data.toISOString().slice(0, 10);
}

function oraIso(ora: Date): string {
  return ora.toISOString().slice(11, 16);
}

// INTEGRITA' DATI: stati di una prenotazione da cui e' ancora possibile una
// transizione (cancellazione, check-in, modifica). Da COMPLETATA, CANCELLATA,
// NO_SHOW o SCADUTA non si torna indietro: sono gli stessi quattro stati che
// automation-service.ts (riconoscimento "esito gia' avvenuto" nella scadenza
// della lista d'attesa) e PATCH/DELETE /api/prenotazioni/[id] (cancella dello
// studente) trattano come conclusi. Qui si applica lo STESSO vincolo alle
// azioni dello staff: un'azione admin non deve poter fare cio' che l'azione
// equivalente dello studente non potrebbe fare, ne' riscrivere uno storico
// gia' chiuso (usato da statistiche e controlli no-show).
const STATI_PRENOTAZIONE_MODIFICABILI: readonly string[] = ["CONFERMATA", "CHECK_IN"];

function prenotazioneModificabile(stato: string): boolean {
  return STATI_PRENOTAZIONE_MODIFICABILI.includes(stato);
}

// ===========================================================================
// Hardening B-9 (audit sicurezza 2026-09-04) — SOLO per il case "MODIFICA".
// Prima gli orari grezzi (`"09:00"`) e una `data` potenzialmente non valida
// venivano passati direttamente a Prisma su colonne `@db.Date` / `@db.Time`,
// che rifiutavano il valore facendo degenerare la rotta in un 500 opaco.
// Questi helper validano e normalizzano `nuoviDati` PRIMA di toccare Prisma,
// così l'admin riceve un 422 chiaro. La logica di coda/promozione degli altri
// case (BIB-49) NON è toccata.
// ===========================================================================

/** Esito di una validazione: valore normalizzato oppure messaggio d'errore. */
type EsitoParse<T> = { ok: true; valore: T } | { ok: false; errore: string };

/**
 * Valida una data calendario in formato `YYYY-MM-DD` (accetta anche una ISO
 * completa, di cui usa i primi 10 caratteri) e la normalizza a mezzanotte UTC,
 * coerentemente con la colonna `Prenotazione.data` (`@db.Date`).
 */
function parseDataModifica(raw: unknown): EsitoParse<Date> {
  if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    return { ok: false, errore: "Campo 'data' non valido: atteso formato YYYY-MM-DD" };
  }
  const giorno = new Date(`${raw.slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(giorno.getTime())) {
    return { ok: false, errore: "Campo 'data' non è una data di calendario valida" };
  }
  return { ok: true, valore: giorno };
}

/**
 * Valida un orario `HH:mm` (o `HH:mm:ss`) e lo converte nella data fittizia
 * `1970-01-01T HH:mm:00Z` con cui Prisma rappresenta le colonne `@db.Time`.
 */
function parseOraModifica(raw: unknown, campo: "oraInizio" | "oraFine"): EsitoParse<Date> {
  if (typeof raw !== "string") {
    return { ok: false, errore: `Campo '${campo}' non valido: atteso formato HH:mm` };
  }
  const match = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(raw);
  if (!match) {
    return { ok: false, errore: `Campo '${campo}' non valido: atteso formato HH:mm` };
  }
  const ore = Number(match[1]);
  const minuti = Number(match[2]);
  if (ore > 23 || minuti > 59) {
    return { ok: false, errore: `Campo '${campo}' fuori intervallo (00:00–23:59)` };
  }
  return { ok: true, valore: new Date(Date.UTC(1970, 0, 1, ore, minuti)) };
}

async function promuoviDopoCancellazione(
  prenotazione: PrenotazioneCancellata,
  attore: AttorePersonale,
): Promise<EsitoPromozioneAdmin | null> {
  // La promozione è un effetto collaterale best-effort della cancellazione: se
  // per questo slot non è possibile (coda vuota, oppure lo slot è già nel
  // passato e il dominio rifiuta l'intervallo) la cancellazione resta valida e
  // si risponde semplicemente con `promozione: null`, senza propagare un 500.
  let promozione: Awaited<ReturnType<typeof promuoviPrimoInCoda>>;
  try {
    promozione = await promuoviPrimoInCoda(
      {
        postoId: prenotazione.postoId,
        data: prenotazione.data,
        oraInizio: prenotazione.oraInizio,
        oraFine: prenotazione.oraFine,
      },
      prisma,
    );
  } catch (errore) {
    console.warn(
      `Promozione da coda non eseguita per la prenotazione ${prenotazione.id}:`,
      errore,
    );
    return null;
  }

  if (!promozione) {
    return null;
  }

  const esito: EsitoPromozioneAdmin = {
    richiestaId: promozione.richiestaId,
    prenotazioneId: promozione.prenotazione.id,
    userId: promozione.prenotazione.userId,
    postoId: prenotazione.postoId,
  };

  // BIB-50 / CA-06: arricchisce l'esito con il nome dell'utente promosso, così
  // che il riepilogo mostrato al personale sia leggibile. Lookup mirato e non
  // bloccante: se fallisce, il feedback ripiega sull'id ma la promozione è già
  // stata registrata sopra.
  const utentePromosso = await prisma.user.findUnique({
    where: { id: esito.userId },
    select: { nome: true, cognome: true },
  });
  if (utentePromosso) {
    esito.utente = utentePromosso;
  }

  await prisma.notifica.create({
    data: {
      userId: esito.userId,
      tipo: "CODA_PROMOZIONE",
      titolo: "🎉 Posto assegnato dalla lista d'attesa",
      messaggio: `Buone notizie: il posto ${prenotazione.posto.numero} si è liberato e la prenotazione è ora tua. Ricordati di fare il check-in nei tempi previsti per non perderla.`,
      actionUrl: `/prenotazioni/${esito.prenotazioneId}`,
      actionLabel: "Vedi prenotazione",
    },
  });

  // Evento di innesco separato dal CODA_PROMOZIONE scritto dal dominio: rende
  // esplicito che la catena nasce da un'azione del personale e non dal cron.
  await prisma.logEvento.create({
    data: {
      tipo: "OVERRIDE_BIBLIOTECARIO",
      userId: attore.id,
      targetUserId: esito.userId,
      prenotazioneId: esito.prenotazioneId,
      descrizione: "Promozione da coda innescata da cancellazione del personale",
      dettagli: {
        azione: "CANCELLAZIONE_ADMIN",
        prenotazioneCancellataId: prenotazione.id,
        listaAttesaId: esito.richiestaId,
        postoId: prenotazione.postoId,
        attore: {
          tipo: "personale",
          userId: attore.id,
          email: attore.email ?? null,
          ruolo: attore.ruolo ?? null,
        },
      },
    },
  });

  emitCodaPromozione({
    userId: esito.userId,
    postoId: prenotazione.postoId,
    numero: prenotazione.posto.numero,
    prenotazioneId: esito.prenotazioneId,
    data: dataIso(prenotazione.data),
    oraInizio: oraIso(prenotazione.oraInizio),
    oraFine: oraIso(prenotazione.oraFine),
  });

  return esito;
}

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

    // Rate limiting DOPO il controllo di ruolo: questo endpoint gestisce
    // cancellazioni, check-in manuali e modifiche di prenotazioni altrui, ma
    // è già riservato allo staff. Limitare prima farebbe consumare quota a
    // chiunque nemmeno autorizzato; limitare dopo protegge dall'abuso di un
    // account BIBLIOTECARIO/ADMIN. Si usa il limite STAFF (piu' permissivo di
    // quello per utente singolo) perché questo endpoint gestisce anche
    // ANNULLA_MULTIPLE, tipicamente invocato dal personale su piu' righe di
    // seguito.
    const rateLimitResult = await staffCriticalApiRateLimiter(req);
    if (rateLimitResult) return rateLimitResult;

    const body = await req.json();
    const { azione, prenotazioneIds, prenotazioneId, nuoviDati } = body;

    switch (azione) {
      case "ANNULLA_MULTIPLE": {
        if (!prenotazioneIds || !Array.isArray(prenotazioneIds)) {
          return NextResponse.json(
            { error: "IDs prenotazioni mancanti" },
            { status: 400 }
          );
        }

        // Annulla prenotazioni e libera posti
        const prenotazioni = await prisma.prenotazione.findMany({
          where: { id: { in: prenotazioneIds } },
          include: { posto: true, user: true }
        });

        const promozioni: EsitoPromozioneAdmin[] = [];
        // Righe gia' concluse (COMPLETATA/CANCELLATA/NO_SHOW/SCADUTA): non si
        // fa fallire l'intera richiesta multipla per UNA riga non annullabile,
        // si salta quella riga e si riporta quante sono state saltate (invece
        // di riscrivere silenziosamente lo storico).
        let saltate = 0;

        for (const pren of prenotazioni) {
          if (!prenotazioneModificabile(pren.stato)) {
            saltate++;
            continue;
          }

          // Update prenotazione
          await prisma.prenotazione.update({
            where: { id: pren.id },
            data: { stato: "CANCELLATA" }
          });

          // Libera il posto SOLO se e' QUESTA prenotazione ad occuparlo
          // (stato CHECK_IN). Controllare `posto.stato === "OCCUPATO"`
          // liberava anche un posto occupato da UN'ALTRA prenotazione (es. un
          // check-in successivo sullo stesso posto in una fascia diversa),
          // stessa logica gia' usata da PATCH /api/prenotazioni/[id].
          if (pren.stato === "CHECK_IN") {
            await prisma.posto.update({
              where: { id: pren.postoId },
              data: { stato: "DISPONIBILE" }
            });
          }

          // Log evento
          //
          // INTEGRITA' DATI (difetto logevento-prenotazione-non-collegato):
          // `prenotazioneId` va scritto anche come colonna relazionale
          // (LogEvento.prenotazioneId), non solo dentro `dettagli`. E'
          // quella colonna che GET /api/prenotazioni/[id] usa per popolare
          // la cronologia mostrata allo studente (`eventi`): prima restava
          // sempre NULL e la cancellazione admin era invisibile nello
          // storico della prenotazione, pur essendo avvenuta e notificata.
          await prisma.logEvento.create({
            data: {
              tipo: "PRENOTAZIONE_CANCELLATA",
              userId: pren.user.id,
              prenotazioneId: pren.id,
              dettagli: {
                prenotazioneId: pren.id,
                postoId: pren.postoId,
                motivazione: "Cancellazione admin multipla",
                cancellatoDa: session.user.email
              }
            }
          });

          // Notifica utente
          await prisma.notifica.create({
            data: {
              tipo: "SISTEMA",
              titolo: "Prenotazione cancellata",
              messaggio: `La tua prenotazione del ${pren.data.toLocaleDateString('it-IT')} è stata cancellata dall'amministrazione.`,
              userId: pren.user.id
            }
          });

          const promozione = await promuoviDopoCancellazione(
            pren,
            session.user,
          );
          if (promozione) {
            promozioni.push(promozione);
          }
        }

        const cancellate = prenotazioni.length - saltate;
        return NextResponse.json({
          success: true,
          message:
            saltate > 0
              ? `${cancellate} prenotazioni cancellate, ${saltate} già concluse e saltate`
              : `${cancellate} prenotazioni cancellate`,
          saltate,
          promozioni,
        });
      }

      case "ANNULLA_SINGOLA": {
        if (!prenotazioneId) {
          return NextResponse.json(
            { error: "ID prenotazione mancante" },
            { status: 400 }
          );
        }

        const prenotazione = await prisma.prenotazione.findUnique({
          where: { id: prenotazioneId },
          include: { posto: true, user: true }
        });

        if (!prenotazione) {
          return NextResponse.json(
            { error: "Prenotazione non trovata" },
            { status: 404 }
          );
        }

        // INTEGRITA' DATI: una prenotazione gia' conclusa (COMPLETATA,
        // CANCELLATA, NO_SHOW, SCADUTA) non puo' essere "ri-cancellata" — e'
        // lo stesso vincolo gia' applicato al cancella dello studente
        // (PATCH/DELETE /api/prenotazioni/[id], che ammette solo
        // CONFERMATA/CHECK_IN). Senza questo controllo l'admin poteva
        // riscrivere lo storico usato dalle statistiche e dai controlli
        // no-show (una COMPLETATA o NO_SHOW che ridiventa CANCELLATA sparisce
        // dalle une e altera gli altri).
        if (!prenotazioneModificabile(prenotazione.stato)) {
          return NextResponse.json(
            { error: "Impossibile cancellare: la prenotazione è già conclusa" },
            { status: 400 }
          );
        }

        // Libera il posto SOLO se e' QUESTA prenotazione ad occuparlo (stato
        // CHECK_IN). Va letto PRIMA dell'update qui sotto, che sovrascrive lo
        // stato: controllare `posto.stato === "OCCUPATO"` liberava anche un
        // posto occupato da UN'ALTRA prenotazione.
        const occupavaIlPosto = prenotazione.stato === "CHECK_IN";

        // Update prenotazione
        await prisma.prenotazione.update({
          where: { id: prenotazioneId },
          data: { stato: "CANCELLATA" }
        });

        if (occupavaIlPosto) {
          await prisma.posto.update({
            where: { id: prenotazione.postoId },
            data: { stato: "DISPONIBILE" }
          });
        }

        // Log evento (vedi nota su prenotazioneId nel case ANNULLA_MULTIPLE
        // qui sopra: stesso difetto, stessa correzione).
        await prisma.logEvento.create({
          data: {
            tipo: "PRENOTAZIONE_CANCELLATA",
            userId: prenotazione.user.id,
            prenotazioneId: prenotazione.id,
            dettagli: {
              prenotazioneId: prenotazione.id,
              postoId: prenotazione.postoId,
              motivazione: "Cancellazione admin",
              cancellatoDa: session.user.email
            }
          }
        });

        // Notifica utente
        await prisma.notifica.create({
          data: {
            tipo: "SISTEMA",
            titolo: "Prenotazione cancellata",
            messaggio: `La tua prenotazione del ${prenotazione.data.toLocaleDateString('it-IT')} è stata cancellata dall'amministrazione.`,
            userId: prenotazione.user.id
          }
        });

        const promozione = await promuoviDopoCancellazione(
          prenotazione,
          session.user,
        );

        return NextResponse.json({
          success: true,
          message: "Prenotazione cancellata",
          promozione,
        });
      }

      case "CHECK_IN_MANUALE": {
        if (!prenotazioneId) {
          return NextResponse.json(
            { error: "ID prenotazione mancante" },
            { status: 400 }
          );
        }

        const prenotazione = await prisma.prenotazione.findUnique({
          where: { id: prenotazioneId },
          include: { posto: true, user: true }
        });

        if (!prenotazione) {
          return NextResponse.json(
            { error: "Prenotazione non trovata" },
            { status: 404 }
          );
        }

        // INTEGRITA' DATI: allineato al check-in dello studente (PATCH
        // /api/prenotazioni/[id], azione "check-in": richiede stato
        // CONFERMATA). Prima si rifiutava solo chi era gia' CHECK_IN o
        // COMPLETATA, ammettendo pero' il check-in manuale di una
        // prenotazione CANCELLATA, NO_SHOW o SCADUTA — una transizione da uno
        // stato concluso che l'azione equivalente dello studente non
        // potrebbe mai fare.
        if (prenotazione.stato !== "CONFERMATA") {
          return NextResponse.json(
            { error: "Impossibile effettuare il check-in: la prenotazione non è confermata" },
            { status: 400 }
          );
        }

        // Update prenotazione
        await prisma.prenotazione.update({
          where: { id: prenotazioneId },
          data: { 
            stato: "CHECK_IN",
            checkInAt: new Date()
          }
        });

        // Occupa posto
        await prisma.posto.update({
          where: { id: prenotazione.postoId },
          data: { stato: "OCCUPATO" }
        });

        // Log evento (vedi nota su prenotazioneId nel case ANNULLA_MULTIPLE
        // piu' sopra: stesso difetto, stessa correzione).
        await prisma.logEvento.create({
          data: {
            tipo: "CHECK_IN",
            userId: prenotazione.user.id,
            prenotazioneId: prenotazione.id,
            dettagli: {
              prenotazioneId: prenotazione.id,
              postoId: prenotazione.postoId,
              metodo: "manuale_admin",
              effettuatoDa: session.user.email
            }
          }
        });

        // Notifica utente
        await prisma.notifica.create({
          data: {
            tipo: "PRENOTAZIONE",
            titolo: "Check-in effettuato",
            messaggio: `Check-in effettuato per la prenotazione del ${prenotazione.data.toLocaleDateString('it-IT')}.`,
            userId: prenotazione.user.id
          }
        });

        return NextResponse.json({
          success: true,
          message: "Check-in effettuato"
        });
      }

      case "MODIFICA": {
        if (!prenotazioneId || !nuoviDati) {
          return NextResponse.json(
            { error: "Dati mancanti" },
            { status: 400 }
          );
        }

        const prenotazione = await prisma.prenotazione.findUnique({
          where: { id: prenotazioneId },
          include: { user: true }
        });

        if (!prenotazione) {
          return NextResponse.json(
            { error: "Prenotazione non trovata" },
            { status: 404 }
          );
        }

        // INTEGRITA' DATI: una prenotazione gia' conclusa non deve poter
        // essere riscritta. Cambiare data/ora/posto DOPO che e' gia'
        // COMPLETATA, CANCELLATA, NO_SHOW o SCADUTA falsificherebbe lo
        // storico su cui si basano statistiche e controlli no-show,
        // esattamente come per ANNULLA_SINGOLA/ANNULLA_MULTIPLE sopra.
        if (!prenotazioneModificabile(prenotazione.stato)) {
          return NextResponse.json(
            { error: "Impossibile modificare: la prenotazione è già conclusa" },
            { status: 400 }
          );
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const updateData: any = {};

        // B-9: valida e normalizza data/orari PRIMA di Prisma. Ogni campo non
        // valido → 422 esplicito (niente 500). I valori validi diventano
        // oggetti Date nel formato atteso dalle colonne @db.Date / @db.Time.
        if (nuoviDati.data !== undefined) {
          const esito = parseDataModifica(nuoviDati.data);
          if (!esito.ok) {
            return NextResponse.json({ error: esito.errore }, { status: 422 });
          }
          updateData.data = esito.valore;
        }
        if (nuoviDati.oraInizio !== undefined) {
          const esito = parseOraModifica(nuoviDati.oraInizio, "oraInizio");
          if (!esito.ok) {
            return NextResponse.json({ error: esito.errore }, { status: 422 });
          }
          updateData.oraInizio = esito.valore;
        }
        if (nuoviDati.oraFine !== undefined) {
          const esito = parseOraModifica(nuoviDati.oraFine, "oraFine");
          if (!esito.ok) {
            return NextResponse.json({ error: esito.errore }, { status: 422 });
          }
          updateData.oraFine = esito.valore;
        }
        // Se dopo la modifica risultano definiti entrambi gli orari, l'intervallo
        // deve restare coerente (fine successiva all'inizio).
        {
          const inizioEff: Date | undefined =
            updateData.oraInizio ?? prenotazione.oraInizio;
          const fineEff: Date | undefined =
            updateData.oraFine ?? prenotazione.oraFine;
          if (
            inizioEff instanceof Date &&
            fineEff instanceof Date &&
            fineEff.getTime() <= inizioEff.getTime()
          ) {
            return NextResponse.json(
              { error: "L'ora di fine deve essere successiva all'ora di inizio" },
              { status: 422 },
            );
          }
        }
        if (nuoviDati.postoId) {
          // Verifica disponibilità nuovo posto
          const nuovoPosto = await prisma.posto.findUnique({
            where: { id: nuoviDati.postoId }
          });

          if (!nuovoPosto) {
            return NextResponse.json(
              { error: "Posto non trovato" },
              { status: 404 }
            );
          }

          if (nuovoPosto.stato !== "DISPONIBILE") {
            return NextResponse.json(
              { error: "Posto non disponibile" },
              { status: 400 }
            );
          }

          updateData.postoId = nuoviDati.postoId;
        }

        // INTEGRITA' DATI (difetto modifica-posto-non-aggiorna-stato-posti):
        // se la prenotazione e' gia' in CHECK_IN, il posto FISICO occupato
        // deve cambiare insieme al posto assegnato. PRIMA veniva aggiornato
        // solo `Prenotazione.postoId`: il vecchio posto restava OCCUPATO per
        // sempre (nessuna prenotazione lo deteneva piu', bloccato finche'
        // qualcuno non se ne accorgeva a mano) e il nuovo restava
        // DISPONIBILE nonostante uno studente vi fosse "seduto" secondo il
        // sistema. Stessa logica gia' applicata da ANNULLA_SINGOLA/MULTIPLE
        // (PR #76) per liberare il posto in uscita da CHECK_IN; qui in piu'
        // si occupa anche il nuovo. Le tre scritture (prenotazione + due
        // posti) vanno in un'unica transazione: a meta' non deve poter
        // restare uno stato inconsistente (es. nuovo posto occupato ma
        // vecchio mai liberato).
        const cambioPostoConCheckIn =
          typeof updateData.postoId === "string" &&
          updateData.postoId !== prenotazione.postoId &&
          prenotazione.stato === "CHECK_IN";

        if (cambioPostoConCheckIn) {
          await prisma.$transaction([
            prisma.prenotazione.update({
              where: { id: prenotazioneId },
              data: updateData,
            }),
            prisma.posto.update({
              where: { id: prenotazione.postoId },
              data: { stato: "DISPONIBILE" },
            }),
            prisma.posto.update({
              where: { id: updateData.postoId },
              data: { stato: "OCCUPATO" },
            }),
          ]);
        } else {
          // Update prenotazione
          await prisma.prenotazione.update({
            where: { id: prenotazioneId },
            data: updateData
          });
        }

        // Log evento
        //
        // INTEGRITA' DATI (difetto logevento-prenotazione-non-collegato):
        // - `prenotazioneId` va scritto anche come colonna relazionale
        //   (LogEvento.prenotazioneId), non solo dentro `dettagli`: e'
        //   quella colonna che GET /api/prenotazioni/[id] legge per
        //   popolare la cronologia mostrata allo studente. Prima restava
        //   sempre NULL.
        // - `tipo` non puo' restare PRENOTAZIONE_CANCELLATA: questa e' una
        //   MODIFICA, non una cancellazione, e registrarla cosi' falsifica
        //   lo storico. Non esiste (ancora) un valore dedicato tipo
        //   PRENOTAZIONE_MODIFICATA nell'enum TipoEvento: aggiungerlo
        //   richiederebbe una migrazione su prisma/schema.prisma, file
        //   fuori dal perimetro di questa correzione (vedi report). Si usa
        //   OVERRIDE_BIBLIOTECARIO, gia' presente nell'enum e gia' usato
        //   altrove in questo stesso file per un'azione dello staff su una
        //   prenotazione: non descrive la modifica con precisione, ma non e'
        //   fuorviante come "cancellata" per un'azione che non cancella
        //   nulla.
        await prisma.logEvento.create({
          data: {
            tipo: "OVERRIDE_BIBLIOTECARIO",
            userId: prenotazione.user.id,
            prenotazioneId: prenotazione.id,
            dettagli: {
              azione: "MODIFICA_PRENOTAZIONE",
              prenotazioneId: prenotazione.id,
              cambiamenti: nuoviDati,
              modificatoDa: session.user.email
            }
          }
        });

        // Notifica utente
        await prisma.notifica.create({
          data: {
            tipo: "SISTEMA",
            titolo: "Prenotazione modificata",
            messaggio: "La tua prenotazione è stata modificata dall'amministrazione.",
            userId: prenotazione.user.id
          }
        });

        return NextResponse.json({
          success: true,
          message: "Prenotazione modificata"
        });
      }

      default:
        return NextResponse.json(
          { error: "Azione non valida" },
          { status: 400 }
        );
    }

  } catch (error) {
    console.error("Errore API prenotazioni admin:", error);
    return NextResponse.json(
      { error: "Errore interno del server" },
      { status: 500 }
    );
  }
}
