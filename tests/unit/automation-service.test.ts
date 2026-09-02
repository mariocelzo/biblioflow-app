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
    // La CODA_PROMOZIONE la scrive il servizio di dominio: qui non deve comparire.
    expect(logEventoCreateMock).not.toHaveBeenCalledWith({
      data: expect.objectContaining({ tipo: "CODA_PROMOZIONE" }),
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
    expect(esito).toEqual({ promossa: true, prenotazioneId: "pren-coda-1" });
    // Un solo LogEvento (di innesco), tipo AUTOMATION: nessuna CODA_PROMOZIONE duplicata.
    expect(logEventoCreateMock).toHaveBeenCalledTimes(1);
    expect(logEventoCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({ tipo: "AUTOMATION" }),
    });
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
