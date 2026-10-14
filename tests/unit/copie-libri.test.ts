/**
 * Test unit per il riallineamento di Libro.copieDisponibili (src/lib/copie-libri.ts).
 *
 * Difetto coperto: il seed scriveva i contatori a mano, incoerenti con i
 * prestiti (Clean Code 3/5 con 1 prestito attivo, Fluent Python 1/3 senza
 * prestiti), e il catalogo mostrava disponibilita' sbagliate.
 */
import { describe, expect, it, vi } from "vitest";

import { calcolaCopieDisponibili, riallineaCopieDisponibili } from "@/lib/copie-libri";

const libri = [
  { id: "a", titolo: "Clean Code", copieTotali: 5, copieDisponibili: 3 },
  { id: "b", titolo: "Fluent Python", copieTotali: 3, copieDisponibili: 1 },
  { id: "c", titolo: "Coerente", copieTotali: 2, copieDisponibili: 1 },
];

function creaDb() {
  return {
    libro: {
      findMany: vi.fn().mockResolvedValue(libri),
      update: vi.fn().mockResolvedValue({}),
    },
    prestito: {
      groupBy: vi.fn().mockResolvedValue([
        { libroId: "a", _count: { _all: 1 } },
        { libroId: "c", _count: { _all: 1 } },
      ]),
    },
  };
}

describe("riallineaCopieDisponibili", () => {
  it("[TC-COP-001] calcola totali - prestiti in corso, mai sotto zero", () => {
    expect(calcolaCopieDisponibili(5, 1)).toBe(4);
    expect(calcolaCopieDisponibili(1, 3)).toBe(0);
  });

  it("[TC-COP-002] dry-run: elenca le differenze senza scrivere", async () => {
    const db = creaDb();
    const correzioni = await riallineaCopieDisponibili(db as never, { applica: false });
    expect(correzioni.map((c) => [c.titolo, c.prima, c.dopo])).toEqual([
      ["Clean Code", 3, 4],
      ["Fluent Python", 1, 3],
    ]);
    expect(db.libro.update).not.toHaveBeenCalled();
  });

  it("[TC-COP-003] applica: aggiorna solo i libri incoerenti", async () => {
    const db = creaDb();
    await riallineaCopieDisponibili(db as never, { applica: true });
    expect(db.libro.update).toHaveBeenCalledTimes(2);
    expect(db.libro.update).toHaveBeenCalledWith({
      where: { id: "a" },
      data: { copieDisponibili: 4 },
    });
  });

  it("[TC-COP-004] conta i prestiti con gli stati che occupano una copia (ATTIVO, RINNOVATO)", async () => {
    const db = creaDb();
    await riallineaCopieDisponibili(db as never, { applica: false });
    expect(db.prestito.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: { stato: { in: ["ATTIVO", "RINNOVATO"] } } }),
    );
  });
});
