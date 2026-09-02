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
vi.mock("@/lib/prisma", () => ({
  prisma: {
    prenotazione: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
    posto: {
      update: vi.fn(),
    },
    notifica: {
      create: vi.fn(),
    },
    logEvento: {
      create: vi.fn(),
    },
  },
}));

// --- Mock del servizio di dominio: la promozione vera non viene eseguita. -----
vi.mock("@/lib/prenotazioni-service", () => ({
  promuoviPrimoInCoda: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { promuoviPrimoInCoda } from "@/lib/prenotazioni-service";
import {
  notificaEventoCoda,
  notificaScadenzaCoda,
  processaCodaPerPosto,
  releaseNoShowReservations,
} from "@/lib/automation-service";

// Spie tipizzate per configurare i valori di ritorno e leggere le chiamate.
const findManyMock = vi.mocked(prisma.prenotazione.findMany);
const prenotazioneUpdateMock = vi.mocked(prisma.prenotazione.update);
const postoUpdateMock = vi.mocked(prisma.posto.update);
const notificaCreateMock = vi.mocked(prisma.notifica.create);
const logEventoCreateMock = vi.mocked(prisma.logEvento.create);
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
