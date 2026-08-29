export const DURATA_MINIMA_PRENOTAZIONE_MINUTI = 60;
export const DURATA_MASSIMA_PRENOTAZIONE_MINUTI = 8 * 60;

const STATI_PRENOTAZIONE_ATTIVI = new Set(["CONFERMATA", "CHECK_IN"]);

export type PrenotazioneErrorCode =
  | "DATA_NON_VALIDA"
  | "DATA_NEL_PASSATO"
  | "ORARIO_NON_VALIDO"
  | "INTERVALLO_NON_VALIDO"
  | "DURATA_TROPPO_BREVE"
  | "DURATA_TROPPO_LUNGA"
  | "POSTO_NON_ATTIVO"
  | "POSTO_IN_MANUTENZIONE"
  | "POSTO_GIA_PRENOTATO";

export class PrenotazioneError extends Error {
  constructor(
    public readonly code: PrenotazioneErrorCode,
    message: string,
    public readonly status: 400 | 409 = 400,
  ) {
    super(message);
    this.name = "PrenotazioneError";
  }
}

export type DataPrenotazione = Date | string;
export type OraPrenotazione = Date | string;

export type PostoPrenotabile = {
  id: string;
  attivo: boolean;
  stato: string;
};

export type IntervalloPrenotazione = {
  id?: string;
  postoId: string;
  data: DataPrenotazione;
  oraInizio: OraPrenotazione;
  oraFine: OraPrenotazione;
  stato?: string;
};

export type ValidazionePrenotazioneInput = {
  posto: PostoPrenotabile;
  data: DataPrenotazione;
  oraInizio: OraPrenotazione;
  oraFine: OraPrenotazione;
  prenotazioniEsistenti?: readonly IntervalloPrenotazione[];
  prenotazioneIdDaEscludere?: string;
  adesso?: Date;
  durataMinimaMinuti?: number;
  durataMassimaMinuti?: number;
};

export type IntervalloValidato = {
  data: Date;
  oraInizioMinuti: number;
  oraFineMinuti: number;
  durataMinuti: number;
};

function giornoUtc(value: DataPrenotazione): Date {
  if (typeof value === "string") {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) {
      throw new PrenotazioneError(
        "DATA_NON_VALIDA",
        "Inserisci una data valida",
      );
    }

    const [, annoTesto, meseTesto, giornoTesto] = match;
    const anno = Number(annoTesto);
    const mese = Number(meseTesto);
    const giorno = Number(giornoTesto);
    const data = new Date(Date.UTC(anno, mese - 1, giorno));

    if (
      data.getUTCFullYear() !== anno ||
      data.getUTCMonth() !== mese - 1 ||
      data.getUTCDate() !== giorno
    ) {
      throw new PrenotazioneError(
        "DATA_NON_VALIDA",
        "Inserisci una data valida",
      );
    }

    return data;
  }

  if (Number.isNaN(value.getTime())) {
    throw new PrenotazioneError(
      "DATA_NON_VALIDA",
      "Inserisci una data valida",
    );
  }

  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  );
}

function minutiDaMezzanotte(value: OraPrenotazione): number {
  if (typeof value === "string") {
    const match = /^(\d{2}):(\d{2})$/.exec(value);
    if (!match) {
      throw new PrenotazioneError(
        "ORARIO_NON_VALIDO",
        "Inserisci un orario valido",
      );
    }

    const ore = Number(match[1]);
    const minuti = Number(match[2]);
    if (ore > 23 || minuti > 59) {
      throw new PrenotazioneError(
        "ORARIO_NON_VALIDO",
        "Inserisci un orario valido",
      );
    }

    return ore * 60 + minuti;
  }

  if (Number.isNaN(value.getTime())) {
    throw new PrenotazioneError(
      "ORARIO_NON_VALIDO",
      "Inserisci un orario valido",
    );
  }

  return value.getUTCHours() * 60 + value.getUTCMinutes();
}

function stessoGiorno(prima: Date, seconda: Date): boolean {
  return prima.getTime() === seconda.getTime();
}

export function intervalliSiSovrappongono(
  primoInizio: number,
  primoFine: number,
  secondoInizio: number,
  secondoFine: number,
): boolean {
  return primoInizio < secondoFine && primoFine > secondoInizio;
}

export function validaPrenotazione(
  input: ValidazionePrenotazioneInput,
): IntervalloValidato {
  const data = giornoUtc(input.data);
  const oggi = giornoUtc(input.adesso ?? new Date());
  const oraInizioMinuti = minutiDaMezzanotte(input.oraInizio);
  const oraFineMinuti = minutiDaMezzanotte(input.oraFine);
  const durataMinima =
    input.durataMinimaMinuti ?? DURATA_MINIMA_PRENOTAZIONE_MINUTI;
  const durataMassima =
    input.durataMassimaMinuti ?? DURATA_MASSIMA_PRENOTAZIONE_MINUTI;

  if (data < oggi) {
    throw new PrenotazioneError(
      "DATA_NEL_PASSATO",
      "Scegli una data di oggi o successiva",
    );
  }

  if (oraFineMinuti <= oraInizioMinuti) {
    throw new PrenotazioneError(
      "INTERVALLO_NON_VALIDO",
      "L'ora di fine deve essere successiva all'ora di inizio",
    );
  }

  const durataMinuti = oraFineMinuti - oraInizioMinuti;
  if (durataMinuti < durataMinima) {
    throw new PrenotazioneError(
      "DURATA_TROPPO_BREVE",
      `La prenotazione deve durare almeno ${durataMinima} minuti`,
    );
  }

  if (durataMinuti > durataMassima) {
    throw new PrenotazioneError(
      "DURATA_TROPPO_LUNGA",
      `La prenotazione non puo' durare piu' di ${durataMassima / 60} ore`,
    );
  }

  if (!input.posto.attivo) {
    throw new PrenotazioneError(
      "POSTO_NON_ATTIVO",
      "Questo posto non e' disponibile per la prenotazione",
    );
  }

  if (input.posto.stato === "MANUTENZIONE") {
    throw new PrenotazioneError(
      "POSTO_IN_MANUTENZIONE",
      "Questo posto e' temporaneamente in manutenzione",
    );
  }

  const sovrapposizione = (input.prenotazioniEsistenti ?? []).some(
    (prenotazione) => {
      if (
        prenotazione.postoId !== input.posto.id ||
        prenotazione.id === input.prenotazioneIdDaEscludere ||
        (prenotazione.stato !== undefined &&
          !STATI_PRENOTAZIONE_ATTIVI.has(prenotazione.stato)) ||
        !stessoGiorno(giornoUtc(prenotazione.data), data)
      ) {
        return false;
      }

      return intervalliSiSovrappongono(
        oraInizioMinuti,
        oraFineMinuti,
        minutiDaMezzanotte(prenotazione.oraInizio),
        minutiDaMezzanotte(prenotazione.oraFine),
      );
    },
  );

  if (sovrapposizione) {
    throw new PrenotazioneError(
      "POSTO_GIA_PRENOTATO",
      "Il posto e' gia' prenotato nell'orario scelto",
      409,
    );
  }

  return { data, oraInizioMinuti, oraFineMinuti, durataMinuti };
}
