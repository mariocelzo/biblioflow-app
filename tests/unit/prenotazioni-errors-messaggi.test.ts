/**
 * Test di regressione per il difetto "apostrofi-ascii-invece-di-accenti"
 * (src/lib/prenotazioni-errors.ts): alcuni messaggi di errore mostrati allo
 * studente usavano l'apostrofo ASCII (') al posto della lettera accentata
 * (è/già/più) — es. "Il posto e' gia' prenotato..." invece di "Il posto è
 * già prenotato...". Questo test confronta il TESTO ESATTO dei messaggi di
 * default: avrebbe fallito prima della correzione.
 */
import { describe, expect, it } from "vitest";

import {
  ConflittoDisponibilita,
  ConflittoPrenotazioneUtente,
  RichiestaCodaDuplicata,
  RichiestaCodaNonAnnullabile,
} from "@/lib/prenotazioni-errors";

describe("prenotazioni-errors · accenti italiani veri nei messaggi di default", () => {
  it("[TC-ERR-001] ConflittoDisponibilita usa è/già accentati", () => {
    expect(new ConflittoDisponibilita().message).toBe(
      "Il posto è già prenotato nell'orario scelto",
    );
  });

  it("[TC-ERR-002] ConflittoPrenotazioneUtente usa già accentato", () => {
    expect(new ConflittoPrenotazioneUtente().message).toBe(
      "Hai già una prenotazione attiva nell'orario scelto",
    );
  });

  it("[TC-ERR-003] RichiestaCodaDuplicata usa già accentato", () => {
    expect(new RichiestaCodaDuplicata().message).toBe(
      "Sei già in lista d'attesa per questo intervallo",
    );
  });

  it("[TC-ERR-004] RichiestaCodaNonAnnullabile usa è/più accentati", () => {
    expect(new RichiestaCodaNonAnnullabile().message).toBe(
      "La richiesta non è più annullabile",
    );
  });

  it("[TC-ERR-005] nessun messaggio di default contiene un apostrofo ASCII al posto dell'accento", () => {
    // Pattern minimale e mirato: "e'"/"gia'"/"piu'" con SPAZIO o fine
    // stringa dopo l'apostrofo (per non toccare gli apostrofi legittimi
    // come in "d'attesa"/"nell'orario", che sono corretti cosi' come sono).
    const messaggi = [
      new ConflittoDisponibilita().message,
      new ConflittoPrenotazioneUtente().message,
      new RichiestaCodaDuplicata().message,
      new RichiestaCodaNonAnnullabile().message,
    ];
    const apostrofoAsciiSpurio = /\b(e|gia|piu)'(\s|$)/;
    for (const messaggio of messaggi) {
      expect(messaggio).not.toMatch(apostrofoAsciiSpurio);
    }
  });
});
