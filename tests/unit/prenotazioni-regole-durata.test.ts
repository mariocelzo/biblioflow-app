import { describe, expect, it } from "vitest";

// SUT: generazione PURA delle opzioni di durata del wizard `/prenota` (step 2),
// estratta in src/lib/prenotazioni-regole.ts proprio per essere testabile senza
// montare il componente React (vedi il commento sopra `generaOpzioniDurata`).
import {
  DURATA_MASSIMA_PRENOTAZIONE_MINUTI,
  generaOpzioniDurata,
  orarioInMinuti,
} from "@/lib/prenotazioni-regole";

/**
 * BUG VISTO IN PRODUZIONE dopo la PR #73: con l'orario del wizard calcolato
 * sull'inviluppo delle sale (08:00-22:00, il piu' ampio fra le sale reali:
 * Sala Studio Principale 08:00-22:00), "Mezza giornata (pomeriggio)"
 * diventava 13:00-22:00 (9h) e "Giornata intera" 08:00-22:00 (14h): entrambe
 * SELEZIONABILI in UI ma SEMPRE rifiutate dal server con DURATA_TROPPO_LUNGA
 * (DURATA_MASSIMA_PRENOTAZIONE_MINUTI = 8h), scoperto dall'utente solo alla
 * conferma finale.
 */
describe("generaOpzioniDurata · nessuna opzione supera la durata massima", () => {
  it("[REGR] con l'inviluppo reale (08:00-22:00) nessuna opzione supera le 8 ore", () => {
    const opzioni = generaOpzioniDurata("08:00", "22:00");

    for (const opzione of opzioni) {
      // "2h" non ha un orario fisso (si sceglie fra gli slot fissi a parte):
      // qui non c'e' nulla da controllare.
      if (!opzione.oraInizio || !opzione.oraFine) continue;

      const durata = orarioInMinuti(opzione.oraFine) - orarioInMinuti(opzione.oraInizio);
      expect(durata).toBeLessThanOrEqual(DURATA_MASSIMA_PRENOTAZIONE_MINUTI);
    }
  });

  it("[REGR] 'Mezza giornata (pomeriggio)' si accorcia a 8h posticipando l'inizio, non la chiusura", () => {
    const opzioni = generaOpzioniDurata("08:00", "22:00");
    const pomeriggio = opzioni.find((o) => o.id === "mezza_pomeriggio");

    // Ancorata alla CHIUSURA (si arriva fino a quando chiude la biblioteca):
    // prima era 13:00-22:00 (9h, rifiutata dal server), ora 14:00-22:00 (8h).
    expect(pomeriggio?.oraInizio).toBe("14:00");
    expect(pomeriggio?.oraFine).toBe("22:00");
  });

  it("[REGR] 'Giornata intera' si accorcia a 8h dall'apertura, non copre piu' l'intero inviluppo", () => {
    const opzioni = generaOpzioniDurata("08:00", "22:00");
    const giornata = opzioni.find((o) => o.id === "giornata");

    // Ancorata all'APERTURA (si comincia quando apre la biblioteca): prima
    // era 08:00-22:00 (14h, rifiutata dal server), ora 08:00-16:00 (8h).
    expect(giornata?.oraInizio).toBe("08:00");
    expect(giornata?.oraFine).toBe("16:00");
  });

  it("[REGR] 'Mezza giornata (mattina)' resta invariata quando gia' entro il limite", () => {
    const opzioni = generaOpzioniDurata("08:00", "22:00");
    const mattina = opzioni.find((o) => o.id === "mezza_mattina");

    // 08:00-13:00 = 5h, gia' sotto il massimo: nessun accorciamento necessario.
    expect(mattina?.oraInizio).toBe("08:00");
    expect(mattina?.oraFine).toBe("13:00");
  });

  it("con un inviluppo piu' corto di una sala singola nessuna opzione supera il massimo", () => {
    // Sala Gruppi da sola: 09:00-19:00 (10h totali) — anche qui pomeriggio
    // (13:00-19:00 = 6h) e giornata (09:00-19:00 = 10h > 8h) vanno verificate.
    const opzioni = generaOpzioniDurata("09:00", "19:00");

    for (const opzione of opzioni) {
      if (!opzione.oraInizio || !opzione.oraFine) continue;
      const durata = orarioInMinuti(opzione.oraFine) - orarioInMinuti(opzione.oraInizio);
      expect(durata).toBeLessThanOrEqual(DURATA_MASSIMA_PRENOTAZIONE_MINUTI);
    }

    const giornata = opzioni.find((o) => o.id === "giornata");
    expect(giornata?.oraInizio).toBe("09:00");
    expect(giornata?.oraFine).toBe("17:00"); // 09:00 + 8h, non piu' 19:00
  });
});
