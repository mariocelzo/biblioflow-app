import { describe, expect, it } from "vitest";

import {
  descriviEsitoCoda,
  type EsitoAnnullamentoAdmin,
} from "@/components/admin/prenotazioni-actions";

describe("BIB-50 · feedback azioni admin sulla coda", () => {
  it("[TC-BIB50-001] identifica l'utente promosso e la nuova prenotazione", () => {
    const esito: EsitoAnnullamentoAdmin = {
      promozione: {
        richiestaId: "coda-1",
        prenotazioneId: "prenotazione-2",
        userId: "utente-2",
        postoId: "posto-a1",
        utente: { nome: "Ada", cognome: "Lovelace" },
      },
    };

    expect(descriviEsitoCoda(esito)).toBe(
      "Ada Lovelace è stato promosso dalla lista d'attesa (prenotazione prenotazione-2).",
    );
  });

  it("[TC-BIB50-002] comunica esplicitamente che la coda era vuota", () => {
    expect(descriviEsitoCoda({ promozione: null })).toBe(
      "Nessun utente era in lista d'attesa per questo intervallo.",
    );
  });

  it("[TC-BIB50-003] resta compatibile con la risposta API precedente", () => {
    expect(descriviEsitoCoda({})).toBe(
      "Prenotazione annullata; esito della lista d'attesa non disponibile.",
    );
  });
});
