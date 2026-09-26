import {
  Prisma,
  type ListaAttesa,
  type Prenotazione,
  type PrismaClient,
} from "@prisma/client";

import {
  ConflittoDisponibilita,
  ConflittoPrenotazioneUtente,
  NonTrovato,
  RichiestaCodaDuplicata,
  RichiestaCodaNonAnnullabile,
  RichiestaCodaNonTrovata,
  ValidazioneError,
} from "@/lib/prenotazioni-errors";

export {
  ConflittoDisponibilita,
  ConflittoPrenotazioneUtente,
  NonTrovato,
  PrenotazioneError,
  RichiestaCodaDuplicata,
  RichiestaCodaNonAnnullabile,
  RichiestaCodaNonTrovata,
  ValidazioneError,
  type PrenotazioneErrorBody,
  type PrenotazioneErrorCode,
} from "@/lib/prenotazioni-errors";

// Le regole "pure" (durata min/max, fuso orario, calcolo data/ora corrente
// della biblioteca) vivono in prenotazioni-regole.ts, SENZA dipendenza da
// Prisma, cosi' da poter essere importate anche da componenti client (vedi
// il commento in cima a quel file). Qui le ri-esportiamo per non rompere gli
// import esistenti (es. tests/unit/prenotazioni-service.test.ts).
import {
  DURATA_MASSIMA_PRENOTAZIONE_MINUTI,
  DURATA_MINIMA_PRENOTAZIONE_MINUTI,
  dataCorrenteBiblioteca,
  minutiCorrentiBiblioteca,
  orarioInMinuti,
} from "@/lib/prenotazioni-regole";

// Domenica/festività/orizzonte 30gg: regole di CALENDARIO, in un modulo
// separato da prenotazioni-regole.ts (che copre solo orari/durate) ma con lo
// stesso principio — SENZA dipendenza da Prisma — perché il wizard client
// (src/app/prenota/page.tsx) le importa da qui allo stesso modo. Vedi il
// commento in cima a calendario-biblioteca.ts per il difetto che ha reso
// necessario spostarle qui.
import {
  ORIZZONTE_MASSIMO_GIORNI,
  isGiornoChiusoBiblioteca,
  superaOrizzonteMassimo,
} from "@/lib/calendario-biblioteca";

export {
  DURATA_MASSIMA_PRENOTAZIONE_MINUTI,
  DURATA_MINIMA_PRENOTAZIONE_MINUTI,
  TIME_ZONE_BIBLIOTECA,
} from "@/lib/prenotazioni-regole";

const STATI_PRENOTAZIONE_ATTIVI = new Set(["CONFERMATA", "CHECK_IN"]);
const CODICI_CONFLITTO_POSTGRES = new Set(["23P01", "40001", "40P01"]);
const CODICI_CONFLITTO_PRISMA = new Set(["P2002", "P2004", "P2034"]);

export type DataPrenotazione = Date | string;
export type OraPrenotazione = Date | string;

export type SalaPrenotabile = {
  attiva: boolean;
  orarioApertura: string;
  orarioChiusura: string;
};

export type PostoPrenotabile = {
  id: string;
  attivo: boolean;
  stato: string;
  sala: SalaPrenotabile;
};

export type IntervalloPrenotazione = {
  id?: string;
  userId: string;
  postoId: string;
  data: DataPrenotazione;
  oraInizio: OraPrenotazione;
  oraFine: OraPrenotazione;
  stato?: string;
};

export type IntervalloInput = {
  data: DataPrenotazione;
  oraInizio: OraPrenotazione;
  oraFine: OraPrenotazione;
  adesso?: Date;
  durataMinimaMinuti?: number;
  durataMassimaMinuti?: number;
  // Disattiva il controllo ORARIO_NEL_PASSATO (vedi validaIntervallo). Di
  // default `false`/assente: una richiesta NUOVA (prenotazione diretta o
  // ingresso in coda) deve sempre riguardare un orario futuro. Va a `true`
  // solo per operazioni che agiscono su uno slot GIA' ESISTENTE e non su una
  // richiesta nuova dell'utente: la promozione dalla coda (`promuoviPrimoInCoda`,
  // che crea la prenotazione per uno slot appena liberato da un no-show — per
  // definizione gia' in corso o concluso) e la lettura della posizione di una
  // richiesta di coda esistente (`posizioneInCoda`, che non deve fallire solo
  // perche' lo slot per cui si e' in attesa e' nel frattempo iniziato).
  permettiOrarioPassato?: boolean;
};

export type ValidazionePrenotazioneInput = IntervalloInput & {
  userId: string;
  posto: PostoPrenotabile | null | undefined;
  prenotazioniEsistenti?: readonly IntervalloPrenotazione[];
  prenotazioneIdDaEscludere?: string;
};

export type IntervalloValidato = {
  data: Date;
  oraInizioMinuti: number;
  oraFineMinuti: number;
  durataMinuti: number;
};

export type Sovrapposizioni = {
  posto: IntervalloPrenotazione[];
  utente: IntervalloPrenotazione[];
};

export type CreaPrenotazioneAtomicaInput = IntervalloInput & {
  userId: string;
  postoId: string;
  marginePendolare?: boolean;
  minutiMarginePendolare?: number;
  note?: string | null;
};

export type CodaIntervalloInput = IntervalloInput & {
  userId: string;
  postoId: string;
};

export type PromozioneCoda = {
  richiestaId: string;
  prenotazione: Prenotazione;
};

export type PrismaTransactionRunner = Pick<PrismaClient, "$transaction">;

function dataCalendario(value: DataPrenotazione): Date {
  if (typeof value === "string") {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) {
      throw new ValidazioneError("DATA_NON_VALIDA", "Inserisci una data valida");
    }

    const anno = Number(match[1]);
    const mese = Number(match[2]);
    const giorno = Number(match[3]);
    const data = new Date(Date.UTC(anno, mese - 1, giorno));

    if (
      data.getUTCFullYear() !== anno ||
      data.getUTCMonth() !== mese - 1 ||
      data.getUTCDate() !== giorno
    ) {
      throw new ValidazioneError("DATA_NON_VALIDA", "Inserisci una data valida");
    }

    return data;
  }

  if (Number.isNaN(value.getTime())) {
    throw new ValidazioneError("DATA_NON_VALIDA", "Inserisci una data valida");
  }

  // Prisma rappresenta @db.Date come mezzanotte UTC.
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  );
}

// `dataCorrenteBiblioteca`/`minutiCorrentiBiblioteca` (data e ora correnti nel
// fuso della biblioteca) vivono in prenotazioni-regole.ts — importate sopra —
// perche' servono anche al client (vedi commento in cima a quel file).

function minutiDaMezzanotte(value: OraPrenotazione): number {
  if (typeof value === "string") {
    // Parsing/validazione di "HH:MM" condivisi col client tramite
    // `orarioInMinuti` (prenotazioni-regole.ts): stessa regex, stesso
    // messaggio di errore, un solo posto da aggiornare.
    return orarioInMinuti(value);
  }

  if (Number.isNaN(value.getTime())) {
    throw new ValidazioneError(
      "ORARIO_NON_VALIDO",
      "Inserisci un orario valido",
    );
  }

  // Prisma rappresenta @db.Time usando la data fittizia 1970-01-01 UTC.
  return value.getUTCHours() * 60 + value.getUTCMinutes();
}

export function intervalliSiSovrappongono(
  primoInizio: number,
  primoFine: number,
  secondoInizio: number,
  secondoFine: number,
): boolean {
  return primoInizio < secondoFine && primoFine > secondoInizio;
}

export function validaIntervallo(input: IntervalloInput): IntervalloValidato {
  // Calcolato una sola volta: serve sia per il giorno (dataCorrenteBiblioteca)
  // sia per l'orario corrente (minutiCorrentiBiblioteca) qui sotto.
  const adesso = input.adesso ?? new Date();
  const data = dataCalendario(input.data);
  const oggi = dataCorrenteBiblioteca(adesso);
  const oraInizioMinuti = minutiDaMezzanotte(input.oraInizio);
  const oraFineMinuti = minutiDaMezzanotte(input.oraFine);
  const durataMinima =
    input.durataMinimaMinuti ?? DURATA_MINIMA_PRENOTAZIONE_MINUTI;
  const durataMassima =
    input.durataMassimaMinuti ?? DURATA_MASSIMA_PRENOTAZIONE_MINUTI;

  if (data < oggi) {
    throw new ValidazioneError(
      "DATA_NEL_PASSATO",
      "Scegli una data di oggi o successiva",
    );
  }

  // DIFETTO VISTO IN COLLAUDO (no-limite-server-domenica-festivi-30gg):
  // domenica/festività/orizzonte 30gg erano applicati SOLO nel wizard
  // client (src/app/prenota/page.tsx), mai qui: chiamando l'API
  // direttamente (bypassando il wizard) si aggiravano. `calendario-
  // biblioteca.ts` e' ora la fonte di verita' UNICA, usata sia qui sia dal
  // wizard, cosi' le due regole non possono piu' divergere.
  const chiusura = isGiornoChiusoBiblioteca(data);
  if (chiusura.chiuso) {
    throw new ValidazioneError("GIORNO_CHIUSO", chiusura.motivo);
  }

  if (superaOrizzonteMassimo(data, oggi)) {
    throw new ValidazioneError(
      "DATA_TROPPO_LONTANA",
      `Puoi prenotare al massimo con ${ORIZZONTE_MASSIMO_GIORNI} giorni di anticipo`,
    );
  }

  // BUG VISTO IN PRODUZIONE: questo controllo prima confrontava solo le
  // DATE, mai l'ORA. Una prenotazione per "oggi 09:00-11:00" inviata alle
  // 15:00 passava la validazione perche' `data < oggi` e' falso quando la
  // data e' proprio oggi. Qui aggiungiamo il confronto sull'orario, ma solo
  // quando la data scelta e' effettivamente oggi (per le date future il
  // controllo sull'ora non ha senso).
  //
  // Scelta di design sul caso limite "slot gia' iniziato ma non ancora
  // finito" (es. sono le 14:00 e lo slot e' 13:00-15:00): lo trattiamo come
  // nel passato e lo rifiutiamo (oraInizioMinuti < minutiAttuali, non <=).
  // Motivo: il check-in e' pensato per avvenire all'ora di inizio
  // dichiarata; ammettere una prenotazione a meta' fascia darebbe all'utente
  // un servizio piu' corto di quello mostrato, senza che se ne accorga prima
  // di prenotare. Il client applica la STESSA regola (vedi
  // `isSlotOggiPassato` in `src/app/prenota/page.tsx`), cosi' lo slot
  // risulta gia' disabilitato in UI prima ancora di arrivare qui.
  if (!input.permettiOrarioPassato && data.getTime() === oggi.getTime()) {
    const minutiAttuali = minutiCorrentiBiblioteca(adesso);
    if (oraInizioMinuti < minutiAttuali) {
      throw new ValidazioneError(
        "ORARIO_NEL_PASSATO",
        "Questa fascia oraria è già iniziata: scegli un orario futuro",
      );
    }
  }

  if (oraFineMinuti <= oraInizioMinuti) {
    throw new ValidazioneError(
      "INTERVALLO_NON_VALIDO",
      "L'ora di fine deve essere successiva all'ora di inizio",
    );
  }

  const durataMinuti = oraFineMinuti - oraInizioMinuti;
  if (durataMinuti < durataMinima) {
    throw new ValidazioneError(
      "DURATA_TROPPO_BREVE",
      `La prenotazione deve durare almeno ${durataMinima} minuti`,
    );
  }

  if (durataMinuti > durataMassima) {
    throw new ValidazioneError(
      "DURATA_TROPPO_LUNGA",
      `La prenotazione non può durare più di ${durataMassima / 60} ore`,
    );
  }

  return { data, oraInizioMinuti, oraFineMinuti, durataMinuti };
}

export function validaPostoPrenotabile(
  posto: PostoPrenotabile | null | undefined,
): PostoPrenotabile {
  if (!posto) {
    throw new NonTrovato();
  }

  if (!posto.attivo) {
    throw new ValidazioneError(
      "POSTO_NON_ATTIVO",
      "Questo posto non è disponibile per la prenotazione",
    );
  }

  if (posto.stato === "MANUTENZIONE") {
    throw new ValidazioneError(
      "POSTO_IN_MANUTENZIONE",
      "Questo posto è temporaneamente in manutenzione",
    );
  }

  if (!posto.sala.attiva) {
    throw new ValidazioneError(
      "SALA_NON_ATTIVA",
      "Questa sala non è disponibile per la prenotazione",
    );
  }

  return posto;
}

export function validaOrarioSala(
  intervallo: IntervalloValidato,
  sala: SalaPrenotabile,
): void {
  let apertura: number;
  let chiusura: number;
  try {
    apertura = minutiDaMezzanotte(sala.orarioApertura);
    chiusura = minutiDaMezzanotte(sala.orarioChiusura);
  } catch {
    throw new ValidazioneError(
      "CONFIGURAZIONE_SALA_NON_VALIDA",
      "Gli orari della sala non sono configurati correttamente",
    );
  }

  if (chiusura <= apertura) {
    throw new ValidazioneError(
      "CONFIGURAZIONE_SALA_NON_VALIDA",
      "Gli orari della sala non sono configurati correttamente",
    );
  }

  if (
    intervallo.oraInizioMinuti < apertura ||
    intervallo.oraFineMinuti > chiusura
  ) {
    throw new ValidazioneError(
      "FUORI_ORARIO_SALA",
      `La sala è aperta dalle ${sala.orarioApertura} alle ${sala.orarioChiusura}`,
    );
  }
}

export function trovaSovrapposizioni(input: {
  userId: string;
  postoId: string;
  intervallo: IntervalloValidato;
  prenotazioniEsistenti: readonly IntervalloPrenotazione[];
  prenotazioneIdDaEscludere?: string;
}): Sovrapposizioni {
  const attiveSovrapposte = input.prenotazioniEsistenti.filter(
    (prenotazione) => {
      if (
        (input.prenotazioneIdDaEscludere !== undefined &&
          prenotazione.id === input.prenotazioneIdDaEscludere) ||
        (prenotazione.stato !== undefined &&
          !STATI_PRENOTAZIONE_ATTIVI.has(prenotazione.stato)) ||
        dataCalendario(prenotazione.data).getTime() !==
          input.intervallo.data.getTime()
      ) {
        return false;
      }

      return intervalliSiSovrappongono(
        input.intervallo.oraInizioMinuti,
        input.intervallo.oraFineMinuti,
        minutiDaMezzanotte(prenotazione.oraInizio),
        minutiDaMezzanotte(prenotazione.oraFine),
      );
    },
  );

  return {
    posto: attiveSovrapposte.filter(
      (prenotazione) => prenotazione.postoId === input.postoId,
    ),
    utente: attiveSovrapposte.filter(
      (prenotazione) => prenotazione.userId === input.userId,
    ),
  };
}

export function validaPrenotazione(
  input: ValidazionePrenotazioneInput,
): IntervalloValidato {
  const posto = validaPostoPrenotabile(input.posto);
  const intervallo = validaIntervallo(input);
  validaOrarioSala(intervallo, posto.sala);

  const sovrapposizioni = trovaSovrapposizioni({
    userId: input.userId,
    postoId: posto.id,
    intervallo,
    prenotazioniEsistenti: input.prenotazioniEsistenti ?? [],
    prenotazioneIdDaEscludere: input.prenotazioneIdDaEscludere,
  });

  if (sovrapposizioni.posto.length > 0) {
    throw new ConflittoDisponibilita();
  }

  if (sovrapposizioni.utente.length > 0) {
    throw new ConflittoPrenotazioneUtente();
  }

  return intervallo;
}

function oraPrisma(minuti: number): Date {
  return new Date(Date.UTC(1970, 0, 1, Math.floor(minuti / 60), minuti % 60));
}

function codiciErrore(
  error: unknown,
  visitati = new Set<object>(),
): Set<string> {
  const codici = new Set<string>();
  if (typeof error !== "object" || error === null) {
    return codici;
  }
  if (visitati.has(error)) {
    return codici;
  }
  visitati.add(error);

  const candidate = error as {
    code?: unknown;
    originalCode?: unknown;
    cause?: unknown;
    meta?: unknown;
    driverAdapterError?: unknown;
  };
  if (typeof candidate.code === "string") {
    codici.add(candidate.code);
  }

  // Gli adapter driver di Prisma 7 incapsulano i codici PostgreSQL in
  // meta.driverAdapterError.cause.originalCode (es. 40001 o 23P01).
  if (typeof candidate.originalCode === "string") {
    codici.add(candidate.originalCode);
  }

  for (const nested of [
    candidate.cause,
    candidate.meta,
    candidate.driverAdapterError,
  ]) {
    for (const code of codiciErrore(nested, visitati)) codici.add(code);
  }

  return codici;
}

export function isConflittoConcorrenza(error: unknown): boolean {
  return [...codiciErrore(error)].some(
    (code) =>
      CODICI_CONFLITTO_PRISMA.has(code) || CODICI_CONFLITTO_POSTGRES.has(code),
  );
}

export function isViolazioneUnicita(error: unknown): boolean {
  const codes = codiciErrore(error);
  return codes.has("P2002") || codes.has("23505");
}

async function creaPrenotazioneNellaTransazione(
  input: CreaPrenotazioneAtomicaInput,
  tx: Prisma.TransactionClient,
): Promise<Prenotazione> {
  const intervallo = validaIntervallo(input);
  const oraInizio = oraPrisma(intervallo.oraInizioMinuti);
  const oraFine = oraPrisma(intervallo.oraFineMinuti);

  const [posto, prenotazioniEsistenti] = await Promise.all([
    tx.posto.findUnique({
      where: { id: input.postoId },
      select: {
        id: true,
        attivo: true,
        stato: true,
        sala: {
          select: {
            attiva: true,
            orarioApertura: true,
            orarioChiusura: true,
          },
        },
      },
    }),
    tx.prenotazione.findMany({
      where: {
        data: intervallo.data,
        stato: { in: ["CONFERMATA", "CHECK_IN"] },
        oraInizio: { lt: oraFine },
        oraFine: { gt: oraInizio },
        OR: [{ postoId: input.postoId }, { userId: input.userId }],
      },
      select: {
        id: true,
        userId: true,
        postoId: true,
        data: true,
        oraInizio: true,
        oraFine: true,
        stato: true,
      },
    }),
  ]);

  validaPrenotazione({ ...input, posto, prenotazioniEsistenti });

  return tx.prenotazione.create({
    data: {
      userId: input.userId,
      postoId: input.postoId,
      data: intervallo.data,
      oraInizio,
      oraFine,
      marginePendolare: input.marginePendolare ?? false,
      minutiMarginePendolare: input.minutiMarginePendolare ?? 30,
      note: input.note ?? null,
    },
  });
}

/**
 * Mantiene verifica DB e inserimento nella stessa transazione Serializable.
 * Il vincolo di esclusione BIB-24 resta l'ultima garanzia contro due richieste
 * concorrenti che superano entrambe la lettura iniziale.
 */
export async function creaPrenotazioneAtomica(
  input: CreaPrenotazioneAtomicaInput,
  client: PrismaTransactionRunner,
): Promise<Prenotazione> {
  try {
    return await client.$transaction(
      (tx) => creaPrenotazioneNellaTransazione(input, tx),
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (error) {
    if (isConflittoConcorrenza(error)) {
      throw new ConflittoDisponibilita(
        "Il posto è stato assegnato a un'altra richiesta; puoi entrare in lista d'attesa",
      );
    }

    throw error;
  }
}

function dettagliCoda(
  richiesta: Pick<
    ListaAttesa,
    "id" | "postoId" | "data" | "oraInizio" | "oraFine"
  >,
): Prisma.InputJsonObject {
  return {
    listaAttesaId: richiesta.id,
    postoId: richiesta.postoId,
    data: richiesta.data.toISOString().slice(0, 10),
    oraInizio: richiesta.oraInizio.toISOString().slice(11, 16),
    oraFine: richiesta.oraFine.toISOString().slice(11, 16),
  };
}

export async function entraInCoda(
  input: CodaIntervalloInput,
  client: PrismaTransactionRunner,
): Promise<ListaAttesa> {
  const intervallo = validaIntervallo(input);
  const oraInizio = oraPrisma(intervallo.oraInizioMinuti);
  const oraFine = oraPrisma(intervallo.oraFineMinuti);

  try {
    return await client.$transaction(
      async (tx) => {
        const duplicata = await tx.listaAttesa.findFirst({
          where: {
            userId: input.userId,
            postoId: input.postoId,
            data: intervallo.data,
            oraInizio,
            oraFine,
            stato: "IN_ATTESA",
          },
          select: { id: true },
        });

        if (duplicata) {
          throw new RichiestaCodaDuplicata();
        }

        const richiesta = await tx.listaAttesa.create({
          data: {
            userId: input.userId,
            postoId: input.postoId,
            data: intervallo.data,
            oraInizio,
            oraFine,
          },
        });

        await tx.logEvento.create({
          data: {
            tipo: "CODA_INGRESSO",
            userId: input.userId,
            targetUserId: input.userId,
            descrizione: "Ingresso in lista d'attesa",
            dettagli: dettagliCoda(richiesta),
          },
        });

        return richiesta;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (error) {
    if (isViolazioneUnicita(error)) {
      throw new RichiestaCodaDuplicata();
    }
    throw error;
  }
}

export async function annullaRichiestaCoda(
  userId: string,
  richiestaId: string,
  client: PrismaTransactionRunner,
): Promise<ListaAttesa> {
  return client.$transaction(
    async (tx) => {
      const richiesta = await tx.listaAttesa.findUnique({
        where: { id: richiestaId },
      });

      // La risposta 404 evita di rivelare richieste appartenenti ad altri utenti.
      if (!richiesta || richiesta.userId !== userId) {
        throw new RichiestaCodaNonTrovata();
      }

      const risultato = await tx.listaAttesa.updateMany({
        where: { id: richiestaId, userId, stato: "IN_ATTESA" },
        data: { stato: "ANNULLATA" },
      });

      if (risultato.count !== 1) {
        throw new RichiestaCodaNonAnnullabile();
      }

      const annullata = { ...richiesta, stato: "ANNULLATA" as const };
      await tx.logEvento.create({
        data: {
          tipo: "CODA_ANNULLATA",
          userId,
          targetUserId: userId,
          descrizione: "Uscita dalla lista d'attesa",
          dettagli: dettagliCoda(annullata),
        },
      });

      return annullata;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function posizioneInCoda(
  input: CodaIntervalloInput,
  client: PrismaTransactionRunner,
): Promise<number> {
  // Legge la posizione di una richiesta di coda GIA' ESISTENTE (data/orario
  // gia' salvati quando l'utente e' entrato in coda, non una richiesta
  // nuova): niente ORARIO_NEL_PASSATO, altrimenti la pagina "la mia lista
  // d'attesa" smetterebbe di caricarsi non appena lo slot per cui si e' in
  // coda inizia, anche se la richiesta e' ancora legittimamente IN_ATTESA.
  const intervallo = validaIntervallo({ ...input, permettiOrarioPassato: true });
  const oraInizio = oraPrisma(intervallo.oraInizioMinuti);
  const oraFine = oraPrisma(intervallo.oraFineMinuti);

  return client.$transaction(
    async (tx) => {
      const richiesta = await tx.listaAttesa.findFirst({
        where: {
          userId: input.userId,
          postoId: input.postoId,
          data: intervallo.data,
          oraInizio,
          oraFine,
          stato: "IN_ATTESA",
        },
        select: { id: true, createdAt: true },
      });

      if (!richiesta) {
        throw new RichiestaCodaNonTrovata();
      }

      const davanti = await tx.listaAttesa.count({
        where: {
          postoId: input.postoId,
          data: intervallo.data,
          oraInizio,
          oraFine,
          stato: "IN_ATTESA",
          OR: [
            { createdAt: { lt: richiesta.createdAt } },
            { createdAt: richiesta.createdAt, id: { lt: richiesta.id } },
          ],
        },
      });

      return davanti + 1;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  );
}

export async function promuoviPrimoInCoda(
  input: Omit<CodaIntervalloInput, "userId">,
  client: PrismaTransactionRunner,
): Promise<PromozioneCoda | null> {
  // La promozione opera su uno slot GIA' LIBERATO (tipicamente da un
  // no-show: l'intero scenario presuppone che lo slot originale sia gia' in
  // corso o concluso), non su una richiesta nuova dell'utente: niente
  // ORARIO_NEL_PASSATO qui, altrimenti la promozione automatica fallirebbe
  // sistematicamente proprio nel caso d'uso per cui esiste.
  const intervallo = validaIntervallo({ ...input, permettiOrarioPassato: true });
  const oraInizio = oraPrisma(intervallo.oraInizioMinuti);
  const oraFine = oraPrisma(intervallo.oraFineMinuti);
  const dataSql = intervallo.data.toISOString().slice(0, 10);
  const oraInizioSql = oraInizio.toISOString().slice(11, 16);
  const oraFineSql = oraFine.toISOString().slice(11, 16);

  try {
    return await client.$transaction(
      async (tx) => {
        const prenotazioneAttiva = await tx.prenotazione.findFirst({
          where: {
            postoId: input.postoId,
            data: intervallo.data,
            stato: { in: ["CONFERMATA", "CHECK_IN"] },
            oraInizio: { lt: oraFine },
            oraFine: { gt: oraInizio },
          },
          select: { id: true },
        });

        if (prenotazioneAttiva) {
          return null;
        }

        const [richiesta] = await tx.$queryRaw<ListaAttesa[]>(Prisma.sql`
          SELECT *
          FROM "ListaAttesa"
          WHERE "postoId" = ${input.postoId}
            AND "data" = ${dataSql}::date
            AND "oraInizio" = ${oraInizioSql}::time
            AND "oraFine" = ${oraFineSql}::time
            AND "stato" = 'IN_ATTESA'
          ORDER BY "createdAt" ASC, "id" ASC
          FOR UPDATE SKIP LOCKED
          LIMIT 1
        `);

        if (!richiesta) {
          return null;
        }

        const prenotazione = await creaPrenotazioneNellaTransazione(
          {
            userId: richiesta.userId,
            postoId: richiesta.postoId,
            data: richiesta.data,
            oraInizio: richiesta.oraInizio,
            oraFine: richiesta.oraFine,
            // Stesso motivo di sopra: questa e' la creazione EFFETTIVA della
            // prenotazione per lo slot appena liberato, non una richiesta
            // nuova dell'utente promosso.
            permettiOrarioPassato: true,
            // BUG TROVATO SCRIVENDO I TEST per GIORNO_CHIUSO/DATA_TROPPO_LONTANA
            // (no-limite-server-domenica-festivi-30gg): questa chiamata NON
            // propagava `input.adesso` alla validazione interna, che quindi
            // calcolava "oggi" con l'orologio REALE invece che con l'istante
            // iniettato dal chiamante — inconsistente con l'`intervallo`
            // calcolato sopra (che invece lo riceve). In produzione i due
            // "adesso" coincidevano comunque (nessun chiamante passa
            // `adesso` a `promuoviPrimoInCoda`, vedi automation-service.ts e
            // admin/prenotazioni/route.ts: entrambi lasciano l'orologio
            // reale), ma senza questo campo la funzione non era testabile in
            // modo deterministico e, per un ipotetico chiamante futuro che
            // passasse `adesso`, il controllo DATA_TROPPO_LONTANA
            // validerebbe contro l'orologio sbagliato.
            adesso: input.adesso,
          },
          tx,
        );

        const promossa = await tx.listaAttesa.updateMany({
          where: { id: richiesta.id, stato: "IN_ATTESA" },
          data: { stato: "PROMOSSA" },
        });

        if (promossa.count !== 1) {
          return null;
        }

        await tx.logEvento.create({
          data: {
            tipo: "CODA_PROMOZIONE",
            targetUserId: richiesta.userId,
            prenotazioneId: prenotazione.id,
            descrizione: "Promozione dalla lista d'attesa",
            dettagli: {
              ...dettagliCoda(richiesta),
              prenotazioneId: prenotazione.id,
            },
          },
        });

        return { richiestaId: richiesta.id, prenotazione };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (error) {
    if (
      error instanceof ConflittoDisponibilita ||
      isConflittoConcorrenza(error)
    ) {
      return null;
    }

    throw error;
  }
}
