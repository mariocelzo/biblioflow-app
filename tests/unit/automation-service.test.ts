import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Test unitari BIB-40 / CA-04 — innesco della promozione dalla lista d'attesa
 * quando il sistema libera automaticamente un posto (no-show).
 *
 * Strategia: si isola `automation-service` dal database e dal servizio di
 * dominio.
 *  - `@/lib/prisma` è sostituito da spie: nessuna query reale.
 *  - `@/lib/prenotazioni-service` è sostituito, così `promuoviPrimoInCoda` non
 *    esegue davvero la promozione ma restituisce un valore controllato dal test.
 * In questo modo si verifica *il contratto* di `releaseNoShowReservations`:
 * chiama `promuoviPrimoInCoda` una volta per posto liberato, gestisce il
 * ritorno `null` (coda vuota) e scrive i LogEvento attesi.
 */

// --- Mock del client Prisma: ogni metodo usato dal service è una spia. --------
// `$transaction` esegue la callback passandole il mock stesso come client `tx`:
// così le scritture dentro la transazione finiscono sulle stesse spie e restano
// ispezionabili dai test (nessun DB reale, nessuna transazione reale).
vi.mock("@/lib/prisma", () => {
  const prisma = {
    prenotazione: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    prestito: {
      findMany: vi.fn(),
    },
    listaAttesa: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    posto: {
      update: vi.fn(),
    },
    notifica: {
      create: vi.fn(),
    },
    logEvento: {
      create: vi.fn(),
      findFirst: vi.fn(),
    },
    $transaction: vi.fn(async (callback: (tx: unknown) => unknown) =>
      callback(prisma),
    ),
  };

  return { prisma };
});

// --- Mock del servizio di dominio: la promozione vera non viene eseguita. -----
vi.mock("@/lib/prenotazioni-service", () => ({
  promuoviPrimoInCoda: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { promuoviPrimoInCoda } from "@/lib/prenotazioni-service";
import {
  FINESTRA_CONFERMA_PROMOZIONE_MINUTI,
  notificaEventoCoda,
  notificaScadenzaCoda,
  processaCodaPerPosto,
  releaseNoShowReservations,
  runAllAutomations,
  scadiPromozioniNonConfermate,
} from "@/lib/automation-service";

// Spie tipizzate per configurare i valori di ritorno e leggere le chiamate.
const findManyMock = vi.mocked(prisma.prenotazione.findMany);
const prenotazioneUpdateMock = vi.mocked(prisma.prenotazione.update);
const prenotazioneUpdateManyMock = vi.mocked(prisma.prenotazione.updateMany);
const prenotazioneFindUniqueMock = vi.mocked(prisma.prenotazione.findUnique);
const prenotazioneFindFirstMock = vi.mocked(prisma.prenotazione.findFirst);
const prestitoFindManyMock = vi.mocked(prisma.prestito.findMany);
const listaAttesaFindManyMock = vi.mocked(prisma.listaAttesa.findMany);
const listaAttesaUpdateManyMock = vi.mocked(prisma.listaAttesa.updateMany);
const postoUpdateMock = vi.mocked(prisma.posto.update);
const notificaCreateMock = vi.mocked(prisma.notifica.create);
const logEventoCreateMock = vi.mocked(prisma.logEvento.create);
const logEventoFindFirstMock = vi.mocked(prisma.logEvento.findFirst);
const transactionMock = vi.mocked(prisma.$transaction);
const promuoviPrimoInCodaMock = vi.mocked(promuoviPrimoInCoda);

// --- Fixture: date coerenti con la rappresentazione Prisma (@db.Date/@db.Time).
const dataDb = new Date("2030-01-15T00:00:00.000Z");
const oraInizioDb = new Date("1970-01-01T09:00:00.000Z");
const oraFineDb = new Date("1970-01-01T11:00:00.000Z");

/** Prenotazione CONFERMATA andata in no-show, con la forma restituita da findMany (include posto+sala). */
function prenotazioneNoShow(overrides: Record<string, unknown> = {}) {
  return {
    id: "pren-1",
    userId: "utente-1",
    postoId: "posto-1",
    data: dataDb,
    oraInizio: oraInizioDb,
    oraFine: oraFineDb,
    posto: {
      id: "posto-1",
      numero: "A1",
      sala: { id: "sala-1", nome: "Sala Studio" },
    },
    ...overrides,
  };
}

/** Valore di ritorno di una promozione andata a buon fine. */
function promozioneOk(
  prenotazioneId = "pren-coda-1",
  userId = "utente-2",
  richiestaId = "lista-attesa-1",
) {
  return {
    richiestaId,
    prenotazione: { id: prenotazioneId, userId },
  } as unknown as Awaited<ReturnType<typeof promuoviPrimoInCoda>>;
}

beforeEach(() => {
  // `restoreMocks: true` (vitest.config) azzera le implementazioni fra i test:
  // qui si ripristina un comportamento neutro di default.
  findManyMock.mockResolvedValue([]);
  prenotazioneUpdateMock.mockResolvedValue({} as never);
  postoUpdateMock.mockResolvedValue({} as never);
  notificaCreateMock.mockResolvedValue({} as never);
  logEventoCreateMock.mockResolvedValue({} as never);
  promuoviPrimoInCodaMock.mockResolvedValue(null);
});

describe("releaseNoShowReservations — innesco promozione coda (BIB-40 / CA-04)", () => {
  it("[TC-BIB40-001] promuove il primo in coda per il posto liberato e ne tiene traccia", async () => {
    findManyMock.mockResolvedValue([prenotazioneNoShow()] as never);
    promuoviPrimoInCodaMock.mockResolvedValue(promozioneOk());

    const result = await releaseNoShowReservations();

    // Il posto è stato liberato e la coda è stata processata una sola volta.
    expect(postoUpdateMock).toHaveBeenCalledTimes(1);
    expect(promuoviPrimoInCodaMock).toHaveBeenCalledTimes(1);
    // Invocazione con lo slot esatto della prenotazione + il client prisma.
    expect(promuoviPrimoInCodaMock).toHaveBeenCalledWith(
      {
        postoId: "posto-1",
        data: dataDb,
        oraInizio: oraInizioDb,
        oraFine: oraFineDb,
      },
      prisma,
    );

    // Il valore di ritorno resta retro-compatibile (`released`) e aggiunge `promoted`.
    expect(result).toEqual({
      released: 1,
      promoted: 1,
      message: expect.stringContaining("1 promozioni"),
    });

    // Log NO_SHOW_AUTO invariato + nuovo log AUTOMATION di innesco con esito "promossa".
    expect(logEventoCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({ tipo: "NO_SHOW_AUTO" }),
    });
    expect(logEventoCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tipo: "AUTOMATION",
        prenotazioneId: "pren-coda-1",
        targetUserId: "utente-2",
        descrizione: expect.stringContaining("Innesco promozione lista d'attesa"),
        dettagli: expect.objectContaining({
          esito: "promossa",
          postoId: "posto-1",
          prenotazioneId: "pren-coda-1",
          listaAttesaId: "lista-attesa-1",
        }),
      }),
    });
    // L'evento di dominio "Promozione dalla lista d'attesa" lo scrive
    // `promuoviPrimoInCoda` (qui mockato): `releaseNoShowReservations` non lo
    // riscrive.
    expect(logEventoCreateMock).not.toHaveBeenCalledWith({
      data: expect.objectContaining({
        descrizione: "Promozione dalla lista d'attesa",
      }),
    });

    // BIB-42 / CA-05: l'utente promosso riceve la notifica `CODA_PROMOZIONE`
    // con `actionUrl` verso la prenotazione creata, più il relativo LogEvento.
    expect(notificaCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "utente-2",
        tipo: "CODA_PROMOZIONE",
        actionUrl: "/prenotazioni/pren-coda-1",
      }),
    });
    expect(logEventoCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tipo: "CODA_PROMOZIONE",
        targetUserId: "utente-2",
        prenotazioneId: "pren-coda-1",
        dettagli: expect.objectContaining({ evento: "notifica" }),
      }),
    });
  });

  it("[TC-BIB40-002] coda vuota: nessun errore e log di innesco con esito 'coda_vuota'", async () => {
    findManyMock.mockResolvedValue([prenotazioneNoShow()] as never);
    promuoviPrimoInCodaMock.mockResolvedValue(null); // coda vuota / posto ancora occupato

    const result = await releaseNoShowReservations();

    expect(promuoviPrimoInCodaMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      released: 1,
      promoted: 0,
      message: expect.stringContaining("0 promozioni"),
    });
    expect(logEventoCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tipo: "AUTOMATION",
        prenotazioneId: null,
        targetUserId: null,
        dettagli: expect.objectContaining({
          esito: "coda_vuota",
          prenotazioneId: null,
          errore: null,
        }),
      }),
    });
  });

  it("[TC-BIB40-003] una chiamata a promuoviPrimoInCoda per ogni posto liberato", async () => {
    findManyMock.mockResolvedValue([
      prenotazioneNoShow({ id: "pren-1", postoId: "posto-1" }),
      prenotazioneNoShow({
        id: "pren-2",
        postoId: "posto-2",
        posto: {
          id: "posto-2",
          numero: "B2",
          sala: { id: "sala-1", nome: "Sala Studio" },
        },
      }),
    ] as never);
    // Primo posto: coda vuota. Secondo posto: promozione effettuata.
    promuoviPrimoInCodaMock
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(promozioneOk("pren-coda-2", "utente-3"));

    const result = await releaseNoShowReservations();

    expect(promuoviPrimoInCodaMock).toHaveBeenCalledTimes(2);
    expect(promuoviPrimoInCodaMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ postoId: "posto-1" }),
      prisma,
    );
    expect(promuoviPrimoInCodaMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ postoId: "posto-2" }),
      prisma,
    );
    expect(result).toEqual({
      released: 2,
      promoted: 1,
      message: expect.any(String),
    });
  });

  it("[TC-BIB40-004] un errore della promozione non interrompe il giro ed è registrato", async () => {
    findManyMock.mockResolvedValue([
      prenotazioneNoShow({ id: "pren-1", postoId: "posto-1" }),
      prenotazioneNoShow({
        id: "pren-2",
        postoId: "posto-2",
        posto: {
          id: "posto-2",
          numero: "B2",
          sala: { id: "sala-1", nome: "Sala Studio" },
        },
      }),
    ] as never);
    promuoviPrimoInCodaMock
      .mockRejectedValueOnce(new Error("intervallo nel passato"))
      .mockResolvedValueOnce(promozioneOk("pren-coda-2", "utente-3"));

    const result = await releaseNoShowReservations();

    // Entrambi i posti liberati; solo il secondo ha prodotto una promozione.
    expect(result).toEqual({
      released: 2,
      promoted: 1,
      message: expect.any(String),
    });
    expect(logEventoCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tipo: "AUTOMATION",
        dettagli: expect.objectContaining({
          esito: "errore",
          errore: "intervallo nel passato",
        }),
      }),
    });
  });

  it("[TC-BIB40-005] senza no-show non tocca la coda", async () => {
    findManyMock.mockResolvedValue([] as never);

    const result = await releaseNoShowReservations();

    expect(promuoviPrimoInCodaMock).not.toHaveBeenCalled();
    expect(logEventoCreateMock).not.toHaveBeenCalled();
    expect(result).toEqual({
      released: 0,
      promoted: 0,
      message: expect.any(String),
    });
  });
});

describe("processaCodaPerPosto — helper riusabile", () => {
  const slot = {
    postoId: "posto-1",
    data: dataDb,
    oraInizio: oraInizioDb,
    oraFine: oraFineDb,
  };

  it("[TC-BIB40-006] invoca promuoviPrimoInCoda con lo slot e restituisce l'esito", async () => {
    promuoviPrimoInCodaMock.mockResolvedValue(promozioneOk());

    const esito = await processaCodaPerPosto(slot);

    expect(promuoviPrimoInCodaMock).toHaveBeenCalledWith(
      {
        postoId: "posto-1",
        data: dataDb,
        oraInizio: oraInizioDb,
        oraFine: oraFineDb,
      },
      prisma,
    );
    // BIB-42 / CA-05: il ritorno espone anche `userId` dell'utente promosso,
    // usato dal chiamante per la notifica. `promossa`/`prenotazioneId` invariati.
    expect(esito).toEqual({
      promossa: true,
      prenotazioneId: "pren-coda-1",
      userId: "utente-2",
    });
    // L'helper resta "puro": scrive solo il LogEvento di innesco (AUTOMATION).
    // La notifica CODA_PROMOZIONE la manda il chiamante, non `processaCodaPerPosto`.
    expect(logEventoCreateMock).toHaveBeenCalledTimes(1);
    expect(logEventoCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({ tipo: "AUTOMATION" }),
    });
    expect(notificaCreateMock).not.toHaveBeenCalled();
  });

  it("[TC-BIB40-007] ritorno null gestito senza errori e tracciato come 'coda_vuota'", async () => {
    promuoviPrimoInCodaMock.mockResolvedValue(null);

    const esito = await processaCodaPerPosto(slot);

    expect(esito).toEqual({ promossa: false, prenotazioneId: undefined });
    expect(logEventoCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tipo: "AUTOMATION",
        dettagli: expect.objectContaining({ esito: "coda_vuota" }),
      }),
    });
  });
});

/**
 * Test unitari BIB-42 / CA-05 — generazione delle notifiche per i tre eventi
 * della lista d'attesa (`notificaEventoCoda`) e wrapper `notificaScadenzaCoda`.
 *
 * Come sopra, `@/lib/prisma` è mockato: si verifica solo che l'helper crei la
 * `Notifica` e il `LogEvento` giusti (tipo / actionUrl / titolo / dettagli) e
 * che sia robusto (nessun throw se la scrittura fallisce).
 */
describe("notificaEventoCoda — notifiche eventi coda (BIB-42 / CA-05)", () => {
  const posto = { numero: "A1", salaNome: "Sala Studio" };

  it("[TC-BIB42-001] CODA_INGRESSO: notifica + log verso la lista d'attesa", async () => {
    const esito = await notificaEventoCoda({
      userId: "utente-1",
      tipo: "CODA_INGRESSO",
      posto,
      richiestaId: "lista-attesa-1",
    });

    expect(esito).toEqual({ notificaCreata: true });

    expect(notificaCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "utente-1",
        tipo: "CODA_INGRESSO",
        titolo: expect.stringContaining("lista d'attesa"),
        messaggio: expect.stringContaining("A1"),
        actionUrl: "/prenotazioni/coda",
        actionLabel: expect.any(String),
      }),
    });

    expect(logEventoCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tipo: "CODA_INGRESSO",
        targetUserId: "utente-1",
        prenotazioneId: null,
        descrizione: expect.stringContaining("CODA_INGRESSO"),
        dettagli: expect.objectContaining({
          evento: "notifica",
          tipo: "CODA_INGRESSO",
          posto: "A1",
          sala: "Sala Studio",
          listaAttesaId: "lista-attesa-1",
          prenotazioneId: null,
        }),
      }),
    });
  });

  it("[TC-BIB42-002] CODA_PROMOZIONE: actionUrl verso la prenotazione creata", async () => {
    const esito = await notificaEventoCoda({
      userId: "utente-2",
      tipo: "CODA_PROMOZIONE",
      posto,
      prenotazioneId: "pren-99",
    });

    expect(esito).toEqual({ notificaCreata: true });

    expect(notificaCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "utente-2",
        tipo: "CODA_PROMOZIONE",
        titolo: expect.stringContaining("Posto assegnato"),
        actionUrl: "/prenotazioni/pren-99",
        actionLabel: "Vedi prenotazione",
      }),
    });
    expect(logEventoCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tipo: "CODA_PROMOZIONE",
        targetUserId: "utente-2",
        prenotazioneId: "pren-99",
        dettagli: expect.objectContaining({
          evento: "notifica",
          prenotazioneId: "pren-99",
        }),
      }),
    });
  });

  it("[TC-BIB42-003] CODA_PROMOZIONE senza id: actionUrl di ripiego su /prenotazioni", async () => {
    await notificaEventoCoda({ userId: "utente-2", tipo: "CODA_PROMOZIONE" });

    expect(notificaCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tipo: "CODA_PROMOZIONE",
        actionUrl: "/prenotazioni",
        // Nessun posto passato → descrizione generica, nessun crash.
        messaggio: expect.stringContaining("il posto richiesto"),
      }),
    });
  });

  it("[TC-BIB42-004] CODA_SCADENZA: notifica + log verso la lista d'attesa", async () => {
    const esito = await notificaEventoCoda({
      userId: "utente-3",
      tipo: "CODA_SCADENZA",
      posto,
      richiestaId: "lista-attesa-7",
    });

    expect(esito).toEqual({ notificaCreata: true });
    expect(notificaCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "utente-3",
        tipo: "CODA_SCADENZA",
        titolo: expect.stringContaining("scaduta"),
        actionUrl: "/prenotazioni/coda",
      }),
    });
    expect(logEventoCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tipo: "CODA_SCADENZA",
        targetUserId: "utente-3",
        dettagli: expect.objectContaining({
          evento: "notifica",
          listaAttesaId: "lista-attesa-7",
        }),
      }),
    });
  });

  it("[TC-BIB42-005] robustezza: se la scrittura fallisce non lancia e lo segnala", async () => {
    notificaCreateMock.mockRejectedValueOnce(new Error("DB non raggiungibile"));

    const esito = await notificaEventoCoda({
      userId: "utente-1",
      tipo: "CODA_INGRESSO",
      richiestaId: "lista-attesa-1",
    });

    // Nessun throw: l'errore è assorbito e riportato nel risultato.
    expect(esito).toEqual({
      notificaCreata: false,
      errore: "DB non raggiungibile",
    });
    // Il log non viene tentato dopo il fallimento della notifica.
    expect(logEventoCreateMock).not.toHaveBeenCalled();
  });

  it("[TC-BIB42-006] notificaScadenzaCoda: wrapper che delega a CODA_SCADENZA", async () => {
    const esito = await notificaScadenzaCoda("utente-4", {
      posto,
      richiestaId: "lista-attesa-9",
    });

    expect(esito).toEqual({ notificaCreata: true });
    expect(notificaCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "utente-4",
        tipo: "CODA_SCADENZA",
        actionUrl: "/prenotazioni/coda",
      }),
    });
    expect(logEventoCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tipo: "CODA_SCADENZA",
        targetUserId: "utente-4",
        dettagli: expect.objectContaining({ listaAttesaId: "lista-attesa-9" }),
      }),
    });
  });
});

/**
 * Test unitari BIB-46 / CA-05 — tracciabilità completa su LogEvento.
 *
 * Verifica che:
 * - Ogni evento della catena di rilascio+promozione condivida lo stesso correlationId
 * - Ogni evento abbia un campo `attore` standardizzato
 * - La catena sia ricostruibile filtrando per correlationId
 * - Esista un riepilogo run alla fine con vista d'insieme
 */
describe("releaseNoShowReservations — tracciabilità completa (BIB-46 / CA-05)", () => {
  it("[TC-BIB46-001] correlationId coerente su tutti gli eventi della catena di rilascio+promozione", async () => {
    findManyMock.mockResolvedValue([prenotazioneNoShow()] as never);
    promuoviPrimoInCodaMock.mockResolvedValue(promozioneOk());

    await releaseNoShowReservations();

    // Estrai tutti i LogEvento creati
    const createdLogs = logEventoCreateMock.mock.calls.map((call) => call[0].data);

    // Filtra gli eventi della catena (NO_SHOW_AUTO + AUTOMATION di innesco + notifica CODA_PROMOZIONE)
    const chainLogs = createdLogs.filter(
      (log) => log.tipo === "NO_SHOW_AUTO" || (log.tipo === "AUTOMATION" && !log.descrizione?.includes("Riepilogo"))
    );

    // Estrai i correlationId
    const correlationIds = chainLogs
      .map((log) => (log.dettagli as Record<string, unknown>)?.correlationId)
      .filter((id) => id !== undefined && id !== null);

    // Devono essere tutti uguali
    expect(correlationIds.length).toBeGreaterThan(0);
    // Verifica che tutti i correlationId siano identici
    const uniqueIds = new Set(correlationIds);
    expect(uniqueIds.size).toBe(1);
  });

  it("[TC-BIB46-002] attore standardizzato in ogni evento della catena", async () => {
    findManyMock.mockResolvedValue([prenotazioneNoShow()] as never);
    promuoviPrimoInCodaMock.mockResolvedValue(promozioneOk());

    await releaseNoShowReservations();

    const createdLogs = logEventoCreateMock.mock.calls.map((call) => call[0].data);

    // Filtra gli eventi della catena (NO_SHOW_AUTO + AUTOMATION di innesco)
    const chainLogs = createdLogs.filter(
      (log) => log.tipo === "NO_SHOW_AUTO" || (log.tipo === "AUTOMATION" && !log.descrizione?.includes("Riepilogo"))
    );

    // Ogni evento deve avere attore.tipo === 'automazione'
    for (const log of chainLogs) {
      expect((log.dettagli as Record<string, unknown>)?.attore).toEqual({
        tipo: "automazione",
        processo: "cron-automations",
      });
    }
  });

  it("[TC-BIB46-003] ricostruibilità della catena: da correlationId risalgo a prenotazione liberata, esito, richiesta promossa", async () => {
    findManyMock.mockResolvedValue([prenotazioneNoShow()] as never);
    promuoviPrimoInCodaMock.mockResolvedValue(promozioneOk());

    await releaseNoShowReservations();

    const createdLogs = logEventoCreateMock.mock.calls.map((call) => call[0].data);

    // Estrai il correlationId dalla prima chiamata (NO_SHOW_AUTO)
    const noShowLog = createdLogs.find((log) => log.tipo === "NO_SHOW_AUTO");
    const correlationId = (noShowLog?.dettagli as Record<string, unknown>)?.correlationId;

    expect(correlationId).toBeTruthy();

    // Filtra gli eventi con questo correlationId
    const chainLogs = createdLogs.filter(
      (log) => (log.dettagli as Record<string, unknown>)?.correlationId === correlationId
    );

    // Verifica che la catena contenga:
    // 1. NO_SHOW_AUTO: prenotazione liberata (id, userId, postoId)
    const noShow = chainLogs.find((log) => log.tipo === "NO_SHOW_AUTO");
    expect(noShow?.dettagli).toMatchObject({
      prenotazioneId: "pren-1",
      userId: "utente-1",
      postoId: "posto-1",
    });

    // 2. AUTOMATION di innesco: esito (promossa), richiesta di coda promossa (listaAttesaId)
    const automationLog = chainLogs.find(
      (log) => log.tipo === "AUTOMATION" && log.descrizione?.includes("Innesco promozione")
    );
    expect(automationLog?.dettagli).toMatchObject({
      esito: "promossa",
      listaAttesaId: "lista-attesa-1",
      prenotazioneId: "pren-coda-1",
    });

    // 3. CODA_PROMOZIONE (notifica): prenotazioneId della nuova prenotazione
    const notificaLog = chainLogs.find((log) => log.tipo === "CODA_PROMOZIONE");
    expect(notificaLog?.dettagli).toMatchObject({
      prenotazioneId: "pren-coda-1",
      evento: "notifica",
    });
  });

  it("[TC-BIB46-004] riepilogo run con vista d'insieme: correlationIds, rilasci, promozioni", async () => {
    findManyMock.mockResolvedValue([
      prenotazioneNoShow({ id: "pren-1", postoId: "posto-1" }),
      prenotazioneNoShow({
        id: "pren-2",
        postoId: "posto-2",
        posto: {
          id: "posto-2",
          numero: "B2",
          sala: { id: "sala-1", nome: "Sala Studio" },
        },
      }),
    ] as never);
    // Primo: coda vuota. Secondo: promozione effettuata.
    promuoviPrimoInCodaMock
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(promozioneOk("pren-coda-2", "utente-3"));

    await releaseNoShowReservations();

    const createdLogs = logEventoCreateMock.mock.calls.map((call) => call[0].data);

    // Trova il LogEvento di riepilogo (tipo AUTOMATION, descrizione "Riepilogo run")
    const summaryLog = createdLogs.find(
      (log) => log.tipo === "AUTOMATION" && log.descrizione?.includes("Riepilogo run")
    );

    expect(summaryLog).toBeTruthy();
    expect(summaryLog?.dettagli).toMatchObject({
      processo: "releaseNoShowReservations",
      rilasci: 2,
      promozioni: 1,
    });
    expect(((summaryLog?.dettagli as Record<string, unknown>)?.correlationIds as string[])?.length).toBe(2);
    expect((summaryLog?.dettagli as Record<string, unknown>)?.attore).toEqual({
      tipo: "automazione",
      processo: "cron-automations",
    });
  });

  it("[TC-BIB46-005] processaCodaPerPosto con correlationId lo propaga nei dettagli", async () => {
    const correlationId = "test-correlation-123";
    const slot = {
      postoId: "posto-1",
      data: dataDb,
      oraInizio: oraInizioDb,
      oraFine: oraFineDb,
    };

    promuoviPrimoInCodaMock.mockResolvedValue(promozioneOk());

    const esito = await processaCodaPerPosto(slot, correlationId);

    expect(esito).toEqual({
      promossa: true,
      prenotazioneId: "pren-coda-1",
      userId: "utente-2",
    });

    expect(logEventoCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tipo: "AUTOMATION",
        dettagli: expect.objectContaining({
          correlationId,
          attore: {
            tipo: "automazione",
            processo: "cron-automations",
          },
        }),
      }),
    });
  });

  it("[TC-BIB46-006] notificaEventoCoda con correlationId lo propaga nei dettagli", async () => {
    const correlationId = "test-correlation-456";

    await notificaEventoCoda({
      userId: "utente-1",
      tipo: "CODA_PROMOZIONE",
      prenotazioneId: "pren-1",
      correlationId,
    });

    expect(logEventoCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tipo: "CODA_PROMOZIONE",
        dettagli: expect.objectContaining({
          correlationId,
          attore: {
            tipo: "automazione",
            processo: "cron-automations",
          },
        }),
      }),
    });
  });
});

/**
 * Test unitari BIB-44 / CA-04 — finestra di conferma della promozione.
 *
 * `scadiPromozioniNonConfermate` porta a SCADUTA le richieste PROMOSSA da oltre
 * la finestra e non confermate (= senza check-in sulla prenotazione nata dalla
 * promozione), libera il posto e rioffre lo slot al successivo in coda.
 *
 * Mock: come sopra `@/lib/prisma` è tutto spie e `$transaction` esegue la
 * callback passandole lo stesso mock come `tx`, così le scritture in
 * transazione restano ispezionabili.
 */
describe("scadiPromozioniNonConfermate — finestra di conferma (BIB-44 / CA-04)", () => {
  // Promossa "molto tempo fa": ben oltre la finestra di conferma.
  const promossaAlle = new Date(
    Date.now() - (FINESTRA_CONFERMA_PROMOZIONE_MINUTI + 30) * 60 * 1000,
  );

  /** Richiesta PROMOSSA nella forma restituita da findMany (include posto+sala). */
  function richiestaPromossa(overrides: Record<string, unknown> = {}) {
    return {
      id: "la-1",
      userId: "u-1",
      postoId: "p-1",
      data: dataDb,
      oraInizio: oraInizioDb,
      oraFine: oraFineDb,
      updatedAt: promossaAlle,
      posto: { numero: "A1", sala: { nome: "Sala Studio" } },
      ...overrides,
    };
  }

  beforeEach(() => {
    // `$transaction(cb)` → `cb(prisma)`: le scritture "in transazione" finiscono
    // sulle stesse spie del mock. (`restoreMocks` azzera l'impl del factory.)
    transactionMock.mockImplementation(
      // `$transaction` è sovraccaricato (array | callback): il cast tiene il
      // mock allineato allo stile del file (`as never`) senza introdurre `any`.
      (async (cb: (tx: unknown) => unknown) => cb(prisma)) as never,
    );
    listaAttesaFindManyMock.mockResolvedValue([] as never);
    listaAttesaUpdateManyMock.mockResolvedValue({ count: 1 } as never);
    prenotazioneUpdateManyMock.mockResolvedValue({ count: 1 } as never);
    prenotazioneFindUniqueMock.mockResolvedValue(null as never);
    prenotazioneFindFirstMock.mockResolvedValue(null as never);
    logEventoFindFirstMock.mockResolvedValue(null as never);
  });

  it("[TC-BIB44-001] promozione non confermata entro la finestra: scade, libera il posto e promuove il successivo", async () => {
    listaAttesaFindManyMock.mockResolvedValue([richiestaPromossa()] as never);
    // La prenotazione della promozione esiste, è CONFERMATA e senza check-in.
    logEventoFindFirstMock.mockResolvedValue({ prenotazioneId: "pren-prom" } as never);
    prenotazioneFindUniqueMock.mockResolvedValue({
      id: "pren-prom",
      stato: "CONFERMATA",
      checkInAt: null,
    } as never);
    // Il successivo in coda viene promosso.
    promuoviPrimoInCodaMock.mockResolvedValue(
      promozioneOk("pren-next", "u-2", "la-2"),
    );

    const result = await scadiPromozioniNonConfermate();

    expect(result).toEqual({
      scadute: 1,
      promozioniInnescate: 1,
      message: expect.any(String),
    });

    // Richiesta di coda: PROMOSSA → SCADUTA con guardia sullo stato.
    expect(listaAttesaUpdateManyMock).toHaveBeenCalledWith({
      where: { id: "la-1", stato: "PROMOSSA" },
      data: { stato: "SCADUTA" },
    });
    // Prenotazione della promozione: CONFERMATA+senza check-in → SCADUTA.
    expect(prenotazioneUpdateManyMock).toHaveBeenCalledWith({
      where: { id: "pren-prom", stato: "CONFERMATA", checkInAt: null },
      data: { stato: "SCADUTA" },
    });
    // Posto liberato.
    expect(postoUpdateMock).toHaveBeenCalledWith({
      where: { id: "p-1" },
      data: { stato: "DISPONIBILE" },
    });
    // Audit della decadenza.
    expect(logEventoCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tipo: "CODA_SCADENZA",
        targetUserId: "u-1",
        dettagli: expect.objectContaining({
          finestraMinuti: FINESTRA_CONFERMA_PROMOZIONE_MINUTI,
          attore: { tipo: "automazione", processo: "cron-automations" },
        }),
      }),
    });
    // Notifica di scadenza all'utente decaduto + notifica di promozione al successivo.
    expect(notificaCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: "u-1", tipo: "CODA_SCADENZA" }),
    });
    expect(notificaCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: "u-2", tipo: "CODA_PROMOZIONE" }),
    });
    // Il successivo in coda è stato ripescato sullo slot liberato.
    expect(promuoviPrimoInCodaMock).toHaveBeenCalledWith(
      {
        postoId: "p-1",
        data: dataDb,
        oraInizio: oraInizioDb,
        oraFine: oraFineDb,
      },
      prisma,
    );
  });

  it("[TC-BIB44-002] promozione confermata (check-in): nessuna scadenza, nessun effetto", async () => {
    listaAttesaFindManyMock.mockResolvedValue([richiestaPromossa()] as never);
    logEventoFindFirstMock.mockResolvedValue({ prenotazioneId: "pren-prom" } as never);
    prenotazioneFindUniqueMock.mockResolvedValue({
      id: "pren-prom",
      stato: "CHECK_IN",
      checkInAt: new Date(),
    } as never);

    const result = await scadiPromozioniNonConfermate();

    expect(result).toEqual({
      scadute: 0,
      promozioniInnescate: 0,
      message: expect.any(String),
    });
    expect(listaAttesaUpdateManyMock).not.toHaveBeenCalled();
    expect(postoUpdateMock).not.toHaveBeenCalled();
    expect(notificaCreateMock).not.toHaveBeenCalled();
    expect(promuoviPrimoInCodaMock).not.toHaveBeenCalled();
    // Nessun riepilogo run quando non è scaduto nulla (idempotenza end-to-end).
    expect(logEventoCreateMock).not.toHaveBeenCalled();
  });

  it("[TC-BIB44-003] idempotenza: se un'altra esecuzione ha già chiuso la richiesta, nessun effetto", async () => {
    listaAttesaFindManyMock.mockResolvedValue([richiestaPromossa()] as never);
    logEventoFindFirstMock.mockResolvedValue({ prenotazioneId: "pren-prom" } as never);
    prenotazioneFindUniqueMock.mockResolvedValue({
      id: "pren-prom",
      stato: "CONFERMATA",
      checkInAt: null,
    } as never);
    // La guardia sullo stato PROMOSSA non aggiorna nulla: già gestita altrove.
    listaAttesaUpdateManyMock.mockResolvedValue({ count: 0 } as never);

    const result = await scadiPromozioniNonConfermate();

    expect(result).toEqual({
      scadute: 0,
      promozioniInnescate: 0,
      message: expect.any(String),
    });
    expect(prenotazioneUpdateManyMock).not.toHaveBeenCalled();
    expect(postoUpdateMock).not.toHaveBeenCalled();
    expect(notificaCreateMock).not.toHaveBeenCalled();
    expect(promuoviPrimoInCodaMock).not.toHaveBeenCalled();
  });

  it("[TC-BIB44-004] conferma sopraggiunta durante la valutazione: rollback, niente scadenza", async () => {
    listaAttesaFindManyMock.mockResolvedValue([richiestaPromossa()] as never);
    logEventoFindFirstMock.mockResolvedValue({ prenotazioneId: "pren-prom" } as never);
    prenotazioneFindUniqueMock.mockResolvedValue({
      id: "pren-prom",
      stato: "CONFERMATA",
      checkInAt: null,
    } as never);
    // Fra lettura e transazione l'utente fa check-in: la guardia B non aggiorna.
    prenotazioneUpdateManyMock.mockResolvedValue({ count: 0 } as never);

    const result = await scadiPromozioniNonConfermate();

    expect(result).toEqual({
      scadute: 0,
      promozioniInnescate: 0,
      message: expect.any(String),
    });
    // Nessuna scadenza propagata: niente rilascio posto, niente notifiche, niente promozione.
    expect(postoUpdateMock).not.toHaveBeenCalled();
    expect(notificaCreateMock).not.toHaveBeenCalled();
    expect(promuoviPrimoInCodaMock).not.toHaveBeenCalled();
    // Tracciata la corsa come "confermata".
    expect(logEventoCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tipo: "AUTOMATION",
        dettagli: expect.objectContaining({ esito: "confermata" }),
      }),
    });
  });

  it("[TC-BIB44-005] nessuna promozione oltre la finestra: no-op senza riepilogo", async () => {
    listaAttesaFindManyMock.mockResolvedValue([] as never);

    const result = await scadiPromozioniNonConfermate();

    expect(result).toEqual({
      scadute: 0,
      promozioniInnescate: 0,
      message: expect.any(String),
    });
    expect(listaAttesaUpdateManyMock).not.toHaveBeenCalled();
    expect(logEventoCreateMock).not.toHaveBeenCalled();
  });

  it("[TC-BIB44-006] runAllAutomations esegue scadiPromozioniNonConfermate e il campo promozioniScadute è additivo", async () => {
    // Nessun reminder, nessun prestito, nessun no-show, nessuna promozione scaduta.
    findManyMock.mockResolvedValue([] as never);
    prestitoFindManyMock.mockResolvedValue([] as never);
    listaAttesaFindManyMock.mockResolvedValue([] as never);

    const results = await runAllAutomations();

    // I campi preesistenti restano al loro posto (retro-compatibilità).
    expect(results.noShows).toMatchObject({ released: 0, promoted: 0 });
    // Il nuovo campo è presente e coerente.
    expect(results.promozioniScadute).toMatchObject({
      scadute: 0,
      promozioniInnescate: 0,
    });
  });
});
