import { describe, expect, it, vi } from "vitest";
import {
  ConflittoDisponibilita,
  DURATA_MASSIMA_PRENOTAZIONE_MINUTI,
  DURATA_MINIMA_PRENOTAZIONE_MINUTI,
  TIME_ZONE_BIBLIOTECA,
  annullaRichiestaCoda,
  creaPrenotazioneAtomica,
  entraInCoda,
  intervalliSiSovrappongono,
  posizioneInCoda,
  promuoviPrimoInCoda,
  trovaSovrapposizioni,
  validaIntervallo,
  validaPostoPrenotabile,
  validaPrenotazione,
  type PrismaTransactionRunner,
} from "@/lib/prenotazioni-service";

const oggi = new Date("2030-01-15T12:00:00.000Z");
const sala = {
  attiva: true,
  orarioApertura: "08:00",
  orarioChiusura: "18:00",
};
const posto = {
  id: "posto-bib27-001",
  attivo: true,
  stato: "DISPONIBILE",
  sala,
};

function inputValido() {
  return {
    userId: "utente-bib27-001",
    posto,
    data: "2030-01-15",
    oraInizio: "09:00",
    oraFine: "11:00",
    adesso: oggi,
  };
}

describe("servizio di validazione prenotazioni BIB-27", () => {
  it("[TC-BIB27-001] accetta un intervallo valido nella data odierna", () => {
    expect(validaPrenotazione(inputValido())).toEqual({
      data: new Date("2030-01-15T00:00:00.000Z"),
      oraInizioMinuti: 9 * 60,
      oraFineMinuti: 11 * 60,
      durataMinuti: 2 * 60,
    });
  });

  it("[TC-BIB27-002] rifiuta una data nel passato con 422", () => {
    expect(() =>
      validaPrenotazione({ ...inputValido(), data: "2030-01-14" }),
    ).toThrowError(
      expect.objectContaining({ code: "DATA_NEL_PASSATO", status: 422 }),
    );
  });

  it("[TC-BIB27-003] rifiuta una data inesistente", () => {
    expect(() =>
      validaPrenotazione({ ...inputValido(), data: "2030-02-30" }),
    ).toThrowError(expect.objectContaining({ code: "DATA_NON_VALIDA" }));
  });

  it("[TC-BIB27-004] rifiuta un orario non valido", () => {
    expect(() =>
      validaPrenotazione({ ...inputValido(), oraFine: "25:00" }),
    ).toThrowError(expect.objectContaining({ code: "ORARIO_NON_VALIDO" }));
  });

  it("[TC-BIB27-005] rifiuta una fine non successiva all'inizio", () => {
    expect(() =>
      validaPrenotazione({ ...inputValido(), oraFine: "09:00" }),
    ).toThrowError(expect.objectContaining({ code: "INTERVALLO_NON_VALIDO" }));
  });

  it("[TC-BIB27-006] applica il limite minimo di un'ora", () => {
    expect(DURATA_MINIMA_PRENOTAZIONE_MINUTI).toBe(60);
    expect(() =>
      validaPrenotazione({ ...inputValido(), oraFine: "09:30" }),
    ).toThrowError(expect.objectContaining({ code: "DURATA_TROPPO_BREVE" }));
  });

  it("[TC-BIB27-007] accetta il limite massimo di otto ore", () => {
    expect(DURATA_MASSIMA_PRENOTAZIONE_MINUTI).toBe(480);
    expect(() =>
      validaPrenotazione({
        ...inputValido(),
        oraInizio: "09:00",
        oraFine: "17:00",
      }),
    ).not.toThrow();
  });

  it("[TC-BIB27-008] rifiuta una durata superiore a otto ore", () => {
    expect(() =>
      validaPrenotazione({
        ...inputValido(),
        oraInizio: "09:00",
        oraFine: "18:00",
      }),
    ).toThrowError(expect.objectContaining({ code: "DURATA_TROPPO_LUNGA" }));
  });

  it("[TC-BIB27-009] rifiuta un posto non attivo", () => {
    expect(() =>
      validaPrenotazione({
        ...inputValido(),
        posto: { ...posto, attivo: false },
      }),
    ).toThrowError(expect.objectContaining({ code: "POSTO_NON_ATTIVO" }));
  });

  it("[TC-BIB27-010] rifiuta un posto in manutenzione", () => {
    expect(() =>
      validaPrenotazione({
        ...inputValido(),
        posto: { ...posto, stato: "MANUTENZIONE" },
      }),
    ).toThrowError(expect.objectContaining({ code: "POSTO_IN_MANUTENZIONE" }));
  });

  it("[TC-BIB27-011] restituisce 404 quando il posto non esiste", () => {
    expect(() => validaPostoPrenotabile(null)).toThrowError(
      expect.objectContaining({ code: "POSTO_NON_TROVATO", status: 404 }),
    );
  });

  it("[TC-BIB27-012] rifiuta una sala non attiva", () => {
    expect(() =>
      validaPrenotazione({
        ...inputValido(),
        posto: { ...posto, sala: { ...sala, attiva: false } },
      }),
    ).toThrowError(expect.objectContaining({ code: "SALA_NON_ATTIVA" }));
  });

  it("[TC-BIB27-013] applica gli orari di apertura della sala", () => {
    expect(() =>
      validaPrenotazione({
        ...inputValido(),
        oraInizio: "07:00",
        oraFine: "09:00",
      }),
    ).toThrowError(expect.objectContaining({ code: "FUORI_ORARIO_SALA" }));
  });

  it("[TC-BIB27-014] usa Europe/Rome per determinare il giorno corrente", () => {
    expect(TIME_ZONE_BIBLIOTECA).toBe("Europe/Rome");
    expect(() =>
      validaPrenotazione({
        ...inputValido(),
        data: "2030-01-14",
        adesso: new Date("2030-01-15T00:30:00+01:00"),
      }),
    ).toThrowError(expect.objectContaining({ code: "DATA_NEL_PASSATO" }));
  });

  it("[TC-BIB27-015] rifiuta una sovrapposizione sullo stesso posto e suggerisce la coda", () => {
    let errore: unknown;
    try {
      validaPrenotazione({
        ...inputValido(),
        prenotazioniEsistenti: [
          {
            id: "prenotazione-bib27-posto",
            userId: "altro-utente",
            postoId: posto.id,
            data: "2030-01-15",
            oraInizio: "10:00",
            oraFine: "12:00",
            stato: "CHECK_IN",
          },
        ],
      });
    } catch (value) {
      errore = value;
    }

    expect(errore).toBeInstanceOf(ConflittoDisponibilita);
    expect(errore).toMatchObject({
      code: "POSTO_GIA_PRENOTATO",
      status: 409,
      suggerisciCoda: true,
    });
    expect((errore as ConflittoDisponibilita).toResponseBody()).toMatchObject({
      code: "POSTO_GIA_PRENOTATO",
      suggerisciCoda: true,
    });
  });

  it("[TC-BIB27-016] rifiuta allo stesso utente un altro posto sovrapposto", () => {
    expect(() =>
      validaPrenotazione({
        ...inputValido(),
        prenotazioniEsistenti: [
          {
            id: "prenotazione-bib27-utente",
            userId: inputValido().userId,
            postoId: "posto-bib27-altro",
            data: "2030-01-15",
            oraInizio: "10:00",
            oraFine: "12:00",
            stato: "CONFERMATA",
          },
        ],
      }),
    ).toThrowError(
      expect.objectContaining({
        code: "UTENTE_GIA_PRENOTATO",
        status: 409,
        suggerisciCoda: false,
      }),
    );
  });

  it("[TC-BIB27-017] accetta slot adiacenti e prenotazioni terminali", () => {
    expect(() =>
      validaPrenotazione({
        ...inputValido(),
        prenotazioniEsistenti: [
          {
            userId: inputValido().userId,
            postoId: posto.id,
            data: "2030-01-15",
            oraInizio: "07:00",
            oraFine: "09:00",
            stato: "CHECK_IN",
          },
          {
            userId: inputValido().userId,
            postoId: posto.id,
            data: "2030-01-15",
            oraInizio: "10:00",
            oraFine: "12:00",
            stato: "CANCELLATA",
          },
        ],
      }),
    ).not.toThrow();
  });

  it("[TC-BIB27-018] ignora altri giorni e la prenotazione corrente", () => {
    expect(() =>
      validaPrenotazione({
        ...inputValido(),
        prenotazioneIdDaEscludere: "prenotazione-bib27-current",
        prenotazioniEsistenti: [
          {
            id: "prenotazione-bib27-current",
            userId: inputValido().userId,
            postoId: posto.id,
            data: "2030-01-15",
            oraInizio: "09:00",
            oraFine: "11:00",
            stato: "CONFERMATA",
          },
          {
            userId: inputValido().userId,
            postoId: posto.id,
            data: "2030-01-16",
            oraInizio: "09:00",
            oraFine: "11:00",
            stato: "CONFERMATA",
          },
        ],
      }),
    ).not.toThrow();
  });

  it("[TC-BIB27-019] espone separatamente conflitti posto e utente", () => {
    const intervallo = validaIntervallo(inputValido());
    const prenotazione = {
      userId: inputValido().userId,
      postoId: posto.id,
      data: "2030-01-15",
      oraInizio: "10:00",
      oraFine: "12:00",
      stato: "CONFERMATA",
    };

    expect(
      trovaSovrapposizioni({
        userId: inputValido().userId,
        postoId: posto.id,
        intervallo,
        prenotazioniEsistenti: [prenotazione],
      }),
    ).toEqual({ posto: [prenotazione], utente: [prenotazione] });
  });

  it("[TC-BIB27-020] usa intervalli semiaperti", () => {
    expect(intervalliSiSovrappongono(9 * 60, 11 * 60, 11 * 60, 13 * 60)).toBe(
      false,
    );
    expect(intervalliSiSovrappongono(9 * 60, 11 * 60, 10 * 60, 12 * 60)).toBe(
      true,
    );
  });
});

const dataDb = new Date("2030-01-15T00:00:00.000Z");
const oraInizioDb = new Date("1970-01-01T09:00:00.000Z");
const oraFineDb = new Date("1970-01-01T11:00:00.000Z");
const timestampDb = new Date("2030-01-01T09:00:00.000Z");

const richiestaCoda = {
  id: "richiesta-bib31-001",
  userId: "utente-bib31-001",
  postoId: posto.id,
  data: dataDb,
  oraInizio: oraInizioDb,
  oraFine: oraFineDb,
  stato: "IN_ATTESA" as const,
  createdAt: timestampDb,
  updatedAt: timestampDb,
};

const prenotazioneCreata = {
  id: "prenotazione-bib31-001",
  userId: richiestaCoda.userId,
  postoId: posto.id,
  data: dataDb,
  oraInizio: oraInizioDb,
  oraFine: oraFineDb,
  stato: "CONFERMATA" as const,
  checkInAt: null,
  checkOutAt: null,
  marginePendolare: false,
  minutiMarginePendolare: 30,
  estesa: false,
  oraFineOriginale: null,
  note: null,
  createdAt: timestampDb,
  updatedAt: timestampDb,
};

function transactionRunner<T extends object>(tx: T) {
  const transaction = vi.fn(async (callback: unknown) =>
    (callback as (value: T) => Promise<unknown>)(tx),
  );

  return {
    client: { $transaction: transaction } as unknown as PrismaTransactionRunner,
    transaction,
  };
}

function inputAtomico() {
  return {
    userId: richiestaCoda.userId,
    postoId: posto.id,
    data: "2030-01-15",
    oraInizio: "09:00",
    oraFine: "11:00",
    adesso: oggi,
  };
}

describe("servizio di dominio BIB-28—BIB-31", () => {
  it("[TC-BIB31-001] crea la prenotazione in transazione Serializable", async () => {
    const tx = {
      posto: { findUnique: vi.fn().mockResolvedValue(posto) },
      prenotazione: {
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockResolvedValue(prenotazioneCreata),
      },
    };
    const { client, transaction } = transactionRunner(tx);

    await expect(
      creaPrenotazioneAtomica(inputAtomico(), client),
    ).resolves.toEqual(prenotazioneCreata);
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "Serializable",
    });
    expect(tx.prenotazione.create).toHaveBeenCalledTimes(1);
  });

  it("[TC-BIB31-002] traduce la violazione DB in conflitto proponibile come coda", async () => {
    const tx = {
      posto: { findUnique: vi.fn().mockResolvedValue(posto) },
      prenotazione: {
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockRejectedValue({ code: "23P01" }),
      },
    };
    const { client } = transactionRunner(tx);

    await expect(creaPrenotazioneAtomica(inputAtomico(), client)).rejects.toMatchObject({
      code: "POSTO_GIA_PRENOTATO",
      status: 409,
      suggerisciCoda: true,
    });
  });

  it("[TC-BIB31-003] rifiuta una richiesta di coda duplicata", async () => {
    const tx = {
      listaAttesa: {
        findFirst: vi.fn().mockResolvedValue({ id: richiestaCoda.id }),
        create: vi.fn(),
      },
      logEvento: { create: vi.fn() },
    };
    const { client } = transactionRunner(tx);

    await expect(entraInCoda(inputAtomico(), client)).rejects.toMatchObject({
      code: "RICHIESTA_CODA_DUPLICATA",
      status: 409,
    });
    expect(tx.listaAttesa.create).not.toHaveBeenCalled();
    expect(tx.logEvento.create).not.toHaveBeenCalled();
  });

  it("[TC-BIB31-004] registra ingresso e LogEvento nella stessa transazione", async () => {
    const tx = {
      listaAttesa: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(richiestaCoda),
      },
      logEvento: { create: vi.fn().mockResolvedValue({ id: "evento-ingresso" }) },
    };
    const { client } = transactionRunner(tx);

    await expect(entraInCoda(inputAtomico(), client)).resolves.toEqual(
      richiestaCoda,
    );
    expect(tx.logEvento.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tipo: "CODA_INGRESSO",
        targetUserId: richiestaCoda.userId,
      }),
    });
  });

  it("[TC-BIB31-005] nasconde la richiesta di coda appartenente a un altro utente", async () => {
    const tx = {
      listaAttesa: {
        findUnique: vi.fn().mockResolvedValue({
          ...richiestaCoda,
          userId: "altro-utente",
        }),
        updateMany: vi.fn(),
      },
      logEvento: { create: vi.fn() },
    };
    const { client } = transactionRunner(tx);

    await expect(
      annullaRichiestaCoda(
        richiestaCoda.userId,
        richiestaCoda.id,
        client,
      ),
    ).rejects.toMatchObject({
      code: "RICHIESTA_CODA_NON_TROVATA",
      status: 404,
    });
    expect(tx.listaAttesa.updateMany).not.toHaveBeenCalled();
  });

  it("[TC-BIB31-006] calcola la posizione FIFO con id come tie-breaker", async () => {
    const tx = {
      listaAttesa: {
        findFirst: vi.fn().mockResolvedValue({
          id: "richiesta-b",
          createdAt: timestampDb,
        }),
        count: vi.fn().mockResolvedValue(1),
      },
    };
    const { client } = transactionRunner(tx);

    await expect(posizioneInCoda(inputAtomico(), client)).resolves.toBe(2);
    expect(tx.listaAttesa.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        OR: [
          { createdAt: { lt: timestampDb } },
          { createdAt: timestampDb, id: { lt: "richiesta-b" } },
        ],
      }),
    });
  });

  it("[TC-BIB31-007] due promozioni producono una prenotazione e un LogEvento", async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([richiestaCoda]),
      posto: { findUnique: vi.fn().mockResolvedValue(posto) },
      prenotazione: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({ id: prenotazioneCreata.id }),
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockResolvedValue(prenotazioneCreata),
      },
      listaAttesa: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      logEvento: {
        create: vi.fn().mockResolvedValue({ id: "evento-promozione" }),
      },
    };
    const { client } = transactionRunner(tx);
    const input = {
      postoId: posto.id,
      data: "2030-01-15",
      oraInizio: "09:00",
      oraFine: "11:00",
      adesso: oggi,
    };

    await expect(promuoviPrimoInCoda(input, client)).resolves.toMatchObject({
      richiestaId: richiestaCoda.id,
      prenotazione: prenotazioneCreata,
    });
    await expect(promuoviPrimoInCoda(input, client)).resolves.toBeNull();

    expect(tx.prenotazione.create).toHaveBeenCalledTimes(1);
    expect(tx.listaAttesa.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.logEvento.create).toHaveBeenCalledTimes(1);
    expect(tx.logEvento.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tipo: "CODA_PROMOZIONE",
        prenotazioneId: prenotazioneCreata.id,
        targetUserId: richiestaCoda.userId,
      }),
    });
  });
});
