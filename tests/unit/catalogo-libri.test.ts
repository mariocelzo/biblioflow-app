/**
 * Test unit per gli helper del tab "Catalogo" di /prestiti (src/app/prestiti/page.tsx).
 *
 * COSA verifica:
 *  1. `urlRicercaLibri` usa il parametro `q` (quello letto davvero da
 *     GET /api/libri), non `search` (mai letto lato server: il filtro
 *     restava sempre disattivato);
 *  2. `estraiLibriDaRisposta` restituisce l'array `data` dalla busta
 *     `{ success, data, pagination }`, non l'intera busta — e non esplode
 *     (nessun TypeError) su corpi mancanti/malformati o `success: false`.
 */
import { describe, expect, it } from "vitest";

import { estraiLibriDaRisposta, urlRicercaLibri } from "@/lib/catalogo-libri";

describe("urlRicercaLibri", () => {
  it("[TC-CAT-001] usa il parametro `q`, non `search`", () => {
    const url = urlRicercaLibri("clean code");
    expect(url).toContain("q=");
    expect(url).not.toContain("search=");
  });

  it("[TC-CAT-002] fa l'URL-encode del termine di ricerca", () => {
    expect(urlRicercaLibri("a b&c")).toBe("/api/libri?q=a%20b%26c");
  });
});

describe("estraiLibriDaRisposta", () => {
  it("[TC-CAT-003] estrae l'array `data` dalla busta {success, data, pagination}", () => {
    const busta = {
      success: true,
      data: [{ id: "1", titolo: "Clean Code" }],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
    };

    expect(estraiLibriDaRisposta(busta)).toEqual([{ id: "1", titolo: "Clean Code" }]);
  });

  it("[TC-CAT-004] NON restituisce l'intera busta se le si passa direttamente (niente TypeError a valle)", () => {
    // Scenario del difetto originale: `setLibri(data)` con `data` = l'intera
    // busta. Un array vuoto e' un fallback sicuro per `libri.map(...)`.
    const busta = { success: true, data: [{ id: "1" }] };
    const risultato = estraiLibriDaRisposta(busta);

    expect(Array.isArray(risultato)).toBe(true);
    expect(risultato).not.toBe(busta);
  });

  it("[TC-CAT-005] `success: false` produce un array vuoto", () => {
    expect(estraiLibriDaRisposta({ success: false, data: [{ id: "1" }] })).toEqual([]);
  });

  it("[TC-CAT-006] `data` mancante o non-array produce un array vuoto", () => {
    expect(estraiLibriDaRisposta({ success: true })).toEqual([]);
    expect(estraiLibriDaRisposta({ success: true, data: "non-un-array" })).toEqual([]);
  });

  it("[TC-CAT-007] corpo nullo/undefined produce un array vuoto", () => {
    expect(estraiLibriDaRisposta(null)).toEqual([]);
    expect(estraiLibriDaRisposta(undefined)).toEqual([]);
  });
});
