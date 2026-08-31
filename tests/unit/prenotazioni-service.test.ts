import { describe, expect, it } from "vitest";
import {
  ConflittoDisponibilita,
  DURATA_MASSIMA_PRENOTAZIONE_MINUTI,
  DURATA_MINIMA_PRENOTAZIONE_MINUTI,
  TIME_ZONE_BIBLIOTECA,
  intervalliSiSovrappongono,
  trovaSovrapposizioni,
  validaIntervallo,
  validaPostoPrenotabile,
  validaPrenotazione,
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
