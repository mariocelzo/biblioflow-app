import { describe, expect, it } from "vitest";

// Fonte unica della logica/etichette coda...
import * as hook from "@/hooks/use-ingresso-coda";
// ...ri-esportata dalle due viste dei posti.
import * as mappa from "@/components/mappa-biblioteca";
import * as mobile from "@/components/mobile-posti-grid";

/**
 * BIB-53 · CA-03 — la vista mobile deve offrire l'ingresso in lista d'attesa con
 * le STESSE azioni e le STESSE etichette della mappa.
 * AC esplicito: "Nessuna divergenza di etichette fra le due viste".
 *
 * Questi test verificano gli helper condivisi e che mappa e mobile puntino alla
 * medesima fonte di copy (`etichettaPosto` / `ETICHETTE_CODA`), rendendo una
 * divergenza di etichette impossibile per costruzione.
 */
describe("BIB-53 · parità mobile ↔ mappa per l'ingresso in coda", () => {
  it("[TC-BIB53-001] mappa e mobile ri-usano gli stessi riferimenti dell'hook condiviso", () => {
    // Identità referenziale: non due copie "uguali" ma lo stesso identico oggetto/funzione.
    expect(mappa.isPostoAccodabile).toBe(hook.isPostoAccodabile);
    expect(mappa.creaPayloadCoda).toBe(hook.creaPayloadCoda);
    expect(mappa.etichettaPosto).toBe(hook.etichettaPosto);
    expect(mappa.ETICHETTE_CODA).toBe(hook.ETICHETTE_CODA);

    expect(mobile.etichettaPosto).toBe(hook.etichettaPosto);
    expect(mobile.ETICHETTE_CODA).toBe(hook.ETICHETTE_CODA);

    // ...e quindi mobile ≡ mappa.
    expect(mobile.etichettaPosto).toBe(mappa.etichettaPosto);
    expect(mobile.ETICHETTE_CODA).toBe(mappa.ETICHETTE_CODA);
  });

  it("[TC-BIB53-002] `isPostoAccodabile` abilita la coda solo per OCCUPATO/PRENOTATO", () => {
    expect(hook.isPostoAccodabile({ stato: "OCCUPATO" })).toBe(true);
    expect(hook.isPostoAccodabile({ stato: "PRENOTATO" })).toBe(true);
    expect(hook.isPostoAccodabile({ stato: "DISPONIBILE" })).toBe(false);
    // MANUTENZIONE resta non selezionabile.
    expect(hook.isPostoAccodabile({ stato: "MANUTENZIONE" })).toBe(false);
  });

  it("[TC-BIB53-003] `creaPayloadCoda` produce il contratto atteso da POST /api/prenotazioni/coda", () => {
    expect(
      hook.creaPayloadCoda("posto-a1", {
        data: "2030-01-15",
        oraInizio: "09:00",
        oraFine: "11:00",
      }),
    ).toEqual({
      postoId: "posto-a1",
      data: "2030-01-15",
      oraInizio: "09:00",
      oraFine: "11:00",
    });
  });

  it("[TC-BIB53-004] `etichettaPosto` genera lo stesso aria-label/tooltip per ogni stato", () => {
    expect(hook.etichettaPosto({ numero: "A1", stato: "DISPONIBILE" })).toBe(
      "Posto A1 - Disponibile (clicca per selezionare)",
    );
    expect(hook.etichettaPosto({ numero: "A1", stato: "OCCUPATO" })).toBe(
      "Posto A1 - Occupato, coda disponibile (clicca per entrare)",
    );
    expect(hook.etichettaPosto({ numero: "A1", stato: "PRENOTATO" })).toBe(
      "Posto A1 - Prenotato, coda disponibile (clicca per entrare)",
    );
    expect(hook.etichettaPosto({ numero: "A1", stato: "MANUTENZIONE" })).toBe(
      "Posto A1 - In manutenzione",
    );
  });

  it("[TC-BIB53-005] `ETICHETTE_CODA` è la fonte unica del copy del pannello coda", () => {
    expect(hook.ETICHETTE_CODA.legenda).toBe("Coda disponibile");
    expect(hook.ETICHETTE_CODA.titoloPannello("A1")).toBe("Lista d'attesa · Posto A1");
    expect(hook.ETICHETTE_CODA.azioneEntra).toBe("Entra in lista d'attesa");
    expect(hook.ETICHETTE_CODA.descrizioneLibera).toBe(
      "Il posto è occupato per l'intervallo scelto. Puoi entrare in coda.",
    );
    expect(hook.ETICHETTE_CODA.descrizioneInCoda(3)).toBe(
      "Sei già in lista. Posizione attuale: 3.",
    );
    expect(hook.ETICHETTE_CODA.badgePosizione(3)).toBe("Posizione 3");
    expect(hook.ETICHETTE_CODA.ariaPosizione(3)).toBe("Posizione in coda 3");
  });
});
