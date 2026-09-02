export type PrenotazioneErrorCode =
  | "DATA_NON_VALIDA"
  | "DATA_NEL_PASSATO"
  | "ORARIO_NON_VALIDO"
  | "INTERVALLO_NON_VALIDO"
  | "DURATA_TROPPO_BREVE"
  | "DURATA_TROPPO_LUNGA"
  | "POSTO_NON_TROVATO"
  | "POSTO_NON_ATTIVO"
  | "POSTO_IN_MANUTENZIONE"
  | "SALA_NON_ATTIVA"
  | "CONFIGURAZIONE_SALA_NON_VALIDA"
  | "FUORI_ORARIO_SALA"
  | "POSTO_GIA_PRENOTATO"
  | "UTENTE_GIA_PRENOTATO"
  | "RICHIESTA_CODA_DUPLICATA"
  | "RICHIESTA_CODA_NON_TROVATA"
  | "RICHIESTA_CODA_NON_ANNULLABILE";

export type PrenotazioneErrorStatus = 404 | 409 | 422;

export type PrenotazioneErrorBody = {
  code: PrenotazioneErrorCode;
  error: string;
  suggerisciCoda: boolean;
};

export class PrenotazioneError extends Error {
  constructor(
    public readonly code: PrenotazioneErrorCode,
    message: string,
    public readonly status: PrenotazioneErrorStatus,
    public readonly suggerisciCoda = false,
  ) {
    super(message);
    this.name = "PrenotazioneError";
  }

  toResponseBody(): PrenotazioneErrorBody {
    return {
      code: this.code,
      error: this.message,
      suggerisciCoda: this.suggerisciCoda,
    };
  }
}

export class ValidazioneError extends PrenotazioneError {
  constructor(code: PrenotazioneErrorCode, message: string) {
    super(code, message, 422);
    this.name = "ValidazioneError";
  }
}

export class ConflittoDisponibilita extends PrenotazioneError {
  constructor(message = "Il posto e' gia' prenotato nell'orario scelto") {
    super("POSTO_GIA_PRENOTATO", message, 409, true);
    this.name = "ConflittoDisponibilita";
  }
}

export class ConflittoPrenotazioneUtente extends PrenotazioneError {
  constructor(
    message = "Hai gia' una prenotazione attiva nell'orario scelto",
  ) {
    super("UTENTE_GIA_PRENOTATO", message, 409);
    this.name = "ConflittoPrenotazioneUtente";
  }
}

export class NonTrovato extends PrenotazioneError {
  constructor(
    code: PrenotazioneErrorCode = "POSTO_NON_TROVATO",
    message = "Il posto richiesto non esiste",
  ) {
    super(code, message, 404);
    this.name = "NonTrovato";
  }
}

export class RichiestaCodaDuplicata extends PrenotazioneError {
  constructor(message = "Sei gia' in lista d'attesa per questo intervallo") {
    super("RICHIESTA_CODA_DUPLICATA", message, 409);
    this.name = "RichiestaCodaDuplicata";
  }
}

export class RichiestaCodaNonTrovata extends PrenotazioneError {
  constructor(message = "La richiesta in lista d'attesa non esiste") {
    super("RICHIESTA_CODA_NON_TROVATA", message, 404);
    this.name = "RichiestaCodaNonTrovata";
  }
}

export class RichiestaCodaNonAnnullabile extends PrenotazioneError {
  constructor(message = "La richiesta non e' piu' annullabile") {
    super("RICHIESTA_CODA_NON_ANNULLABILE", message, 409);
    this.name = "RichiestaCodaNonAnnullabile";
  }
}
