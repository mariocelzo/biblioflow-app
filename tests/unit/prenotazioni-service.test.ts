import { describe, expect, it } from "vitest";
import {
  DURATA_MASSIMA_PRENOTAZIONE_MINUTI,
  DURATA_MINIMA_PRENOTAZIONE_MINUTI,
  intervalliSiSovrappongono,
  validaPrenotazione,
} from "@/lib/prenotazioni-service";

const oggi = new Date("2030-01-15T12:00:00.000Z");
const posto = { id: "posto-bib27-001", attivo: true, stato: "DISPONIBILE" };

function inputValido() {
  return {
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

  it("[TC-BIB27-002] rifiuta una data nel passato", () => {
    expect(() =>
      validaPrenotazione({ ...inputValido(), data: "2030-01-14" }),
    ).toThrowError(
      expect.objectContaining({ code: "DATA_NEL_PASSATO", status: 400 }),
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

  it("[TC-BIB27-011] rifiuta una sovrapposizione attiva sullo stesso posto", () => {
    expect(() =>
      validaPrenotazione({
        ...inputValido(),
        prenotazioniEsistenti: [
          {
            id: "prenotazione-bib27-001",
            postoId: posto.id,
            data: "2030-01-15",
            oraInizio: "10:00",
            oraFine: "12:00",
            stato: "CONFERMATA",
          },
        ],
      }),
    ).toThrowError(
      expect.objectContaining({ code: "POSTO_GIA_PRENOTATO", status: 409 }),
    );
  });

  it("[TC-BIB27-012] accetta slot adiacenti e prenotazioni non attive", () => {
    expect(() =>
      validaPrenotazione({
        ...inputValido(),
        prenotazioniEsistenti: [
          {
            postoId: posto.id,
            data: "2030-01-15",
            oraInizio: "07:00",
            oraFine: "09:00",
            stato: "CHECK_IN",
          },
          {
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

  it("[TC-BIB27-013] ignora altri posti, giorni e la prenotazione corrente", () => {
    expect(() =>
      validaPrenotazione({
        ...inputValido(),
        prenotazioneIdDaEscludere: "prenotazione-bib27-current",
        prenotazioniEsistenti: [
          {
            id: "prenotazione-bib27-current",
            postoId: posto.id,
            data: "2030-01-15",
            oraInizio: "09:00",
            oraFine: "11:00",
            stato: "CONFERMATA",
          },
          {
            postoId: "posto-bib27-altro",
            data: "2030-01-15",
            oraInizio: "09:00",
            oraFine: "11:00",
            stato: "CONFERMATA",
          },
          {
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

  it("[TC-BIB27-014] usa intervalli semiaperti per la sovrapposizione", () => {
    expect(intervalliSiSovrappongono(9 * 60, 11 * 60, 11 * 60, 13 * 60)).toBe(
      false,
    );
    expect(intervalliSiSovrappongono(9 * 60, 11 * 60, 10 * 60, 12 * 60)).toBe(
      true,
    );
  });
});
