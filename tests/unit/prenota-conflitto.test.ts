import { describe, expect, it } from "vitest";

// SUT: la classificazione pura del fallimento di POST /api/prenotazioni,
// estratta in cima a src/app/prenota/page.tsx proprio per essere testabile in isolamento.
import { isConflittoPrenotazione } from "@/app/prenota/page";

describe("BIB-54 · flusso di prenotazione con gestione del conflitto (CA-06)", () => {
  it("[TC-BIB54-001] classifica HTTP 409 come conflitto (si propone la coda)", () => {
    // 409 = ConflittoDisponibilita / ConflittoPrenotazioneUtente lato route.
    expect(
      isConflittoPrenotazione(409, {
        success: false,
        code: "POSTO_GIA_PRENOTATO",
        error: "Il posto e' gia' prenotato nell'orario scelto",
        suggerisciCoda: true,
      }),
    ).toBe(true);

    // Anche senza corpo utile, lo status 409 basta a classificare il conflitto.
    expect(isConflittoPrenotazione(409, null)).toBe(true);
    expect(isConflittoPrenotazione(409, undefined)).toBe(true);
    expect(isConflittoPrenotazione(409, {})).toBe(true);
  });

  it("[TC-BIB54-002] NON classifica come conflitto 422 / 500 / altri status", () => {
    // 422 = errore di validazione (ValidazioneError): comportamento invariato, toast.error.
    expect(
      isConflittoPrenotazione(422, {
        success: false,
        code: "DURATA_TROPPO_BREVE",
        error: "La prenotazione deve durare almeno 60 minuti",
        suggerisciCoda: false,
      }),
    ).toBe(false);

    // 422 anche per i campi obbligatori mancanti restituiti direttamente dal route.
    expect(
      isConflittoPrenotazione(422, {
        success: false,
        code: "CAMPI_OBBLIGATORI_MANCANTI",
        error: "Campi obbligatori mancanti",
        suggerisciCoda: false,
      }),
    ).toBe(false);

    // 500 = errore server generico.
    expect(
      isConflittoPrenotazione(500, {
        success: false,
        error: "Errore nella creazione della prenotazione",
      }),
    ).toBe(false);

    // 404 (posto non trovato) e altri status non attivano la proposta di coda.
    expect(
      isConflittoPrenotazione(404, {
        success: false,
        code: "POSTO_NON_TROVATO",
        error: "Il posto richiesto non esiste",
      }),
    ).toBe(false);

    // 201 (successo) non deve mai essere trattato come conflitto.
    expect(isConflittoPrenotazione(201, { success: true })).toBe(false);
  });

  it("[TC-BIB54-003] classifica come conflitto un body con code di conflitto anche senza status 409", () => {
    // Fallback difensivo: se lo status non e' propagato (0) ma il body porta il codice, e' comunque un conflitto.
    expect(
      isConflittoPrenotazione(0, {
        success: false,
        code: "POSTO_GIA_PRENOTATO",
        error: "Il posto e' stato assegnato a un'altra richiesta",
        suggerisciCoda: true,
      }),
    ).toBe(true);

    expect(
      isConflittoPrenotazione(200, { code: "UTENTE_GIA_PRENOTATO" }),
    ).toBe(true);

    // Anche il solo flag suggerisciCoda del contratto PrenotazioneErrorBody e' sufficiente.
    expect(
      isConflittoPrenotazione(400, { suggerisciCoda: true }),
    ).toBe(true);
  });

  it("[TC-BIB54-004] e' robusta contro body non oggetto o malformati", () => {
    expect(isConflittoPrenotazione(422, "conflitto")).toBe(false);
    expect(isConflittoPrenotazione(422, 123)).toBe(false);
    expect(isConflittoPrenotazione(422, ["POSTO_GIA_PRENOTATO"])).toBe(false);
    expect(isConflittoPrenotazione(422, { suggerisciCoda: "true" })).toBe(false);
    expect(isConflittoPrenotazione(422, { code: "ALTRO" })).toBe(false);
  });
});
