/**
 * Test unit per src/lib/prestiti-scaduti.ts — visibilità dei prestiti
 * RINNOVATI nell'area admin (src/app/admin/prestiti/page.tsx,
 * src/components/admin/prestiti-actions.tsx).
 *
 * COSA verifica: un prestito RINNOVATO in ritardo deve essere trattato come
 * un ATTIVO in ritardo da:
 *  - `filtroScadenzaScaduti` (il filtro `?scadenza=scaduti`);
 *  - `contaScaduti` (la scheda statistica "Scaduti");
 *  - `filtraDaSollecitare` (l'elenco passato a "Sollecita Tutti");
 *  - `prestitoInCorso` (usata dal pulsante di sollecito singolo).
 *
 * PERCHÉ: prima tutti questi punti guardavano solo `stato === "ATTIVO"`: uno
 * studente che rinnova e poi non restituisce e' realmente in ritardo, ma
 * risultava invisibile ai solleciti.
 */
import { describe, expect, it } from "vitest";

import {
  contaScaduti,
  filtraDaSollecitare,
  filtroScadenzaScaduti,
  prestitoInCorso,
  STATI_PRESTITO_IN_CORSO,
} from "@/lib/prestiti-scaduti";

describe("STATI_PRESTITO_IN_CORSO / prestitoInCorso", () => {
  it("[TC-PS-001] include sia ATTIVO sia RINNOVATO", () => {
    expect(STATI_PRESTITO_IN_CORSO).toContain("ATTIVO");
    expect(STATI_PRESTITO_IN_CORSO).toContain("RINNOVATO");
  });

  it("[TC-PS-002] prestitoInCorso è vero per ATTIVO e RINNOVATO, falso per RESTITUITO/SCADUTO", () => {
    expect(prestitoInCorso("ATTIVO")).toBe(true);
    expect(prestitoInCorso("RINNOVATO")).toBe(true);
    expect(prestitoInCorso("RESTITUITO")).toBe(false);
    expect(prestitoInCorso("SCADUTO")).toBe(false);
  });
});

describe("filtroScadenzaScaduti", () => {
  it("[TC-PS-003] filtra su stato IN [ATTIVO, RINNOVATO], non sul solo ATTIVO", () => {
    const filtro = filtroScadenzaScaduti(new Date("2030-01-01T00:00:00.000Z"));
    expect(filtro.stato).toEqual({ in: ["ATTIVO", "RINNOVATO"] });
    expect(filtro.dataScadenza).toEqual({ lte: new Date("2030-01-01T00:00:00.000Z") });
  });
});

describe("contaScaduti", () => {
  const oggi = new Date("2030-06-15T00:00:00.000Z");
  const ieri = new Date("2030-06-14T00:00:00.000Z");
  const domani = new Date("2030-06-16T00:00:00.000Z");

  it("[TC-PS-004] conta un RINNOVATO in ritardo come scaduto (scenario del difetto)", () => {
    const prestiti = [
      { stato: "RINNOVATO", dataScadenza: ieri },
    ];
    expect(contaScaduti(prestiti, oggi)).toBe(1);
  });

  it("[TC-PS-005] conta un ATTIVO in ritardo come scaduto (regressione)", () => {
    expect(contaScaduti([{ stato: "ATTIVO", dataScadenza: ieri }], oggi)).toBe(1);
  });

  it("[TC-PS-006] non conta un RESTITUITO o un prestito non ancora scaduto", () => {
    const prestiti = [
      { stato: "RESTITUITO", dataScadenza: ieri },
      { stato: "ATTIVO", dataScadenza: domani },
      { stato: "RINNOVATO", dataScadenza: domani },
    ];
    expect(contaScaduti(prestiti, oggi)).toBe(0);
  });
});

describe("filtraDaSollecitare", () => {
  it("[TC-PS-007] include un RINNOVATO scaduto da più di 3 giorni (scenario del difetto)", () => {
    const prestiti = [
      { id: "p1", stato: "RINNOVATO", giorniRitardo: 5 },
      { id: "p2", stato: "ATTIVO", giorniRitardo: 10 },
      { id: "p3", stato: "RESTITUITO", giorniRitardo: 20 },
      { id: "p4", stato: "RINNOVATO", giorniRitardo: 1 },
    ];

    const risultato = filtraDaSollecitare(prestiti);

    expect(risultato.map((p) => p.id)).toEqual(["p1", "p2"]);
  });
});
