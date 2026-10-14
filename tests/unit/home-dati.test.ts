/**
 * Test unit per i dati reali della home (src/lib/home-dati.ts) e per il
 * riallineamento delle copie (src/lib/copie-libri.ts).
 *
 * Difetti coperti (segnalati su /libri/<id> in produzione):
 *  - la home mostrava libri e posti scritti a mano, con id inesistenti;
 *  - il catalogo mostrava ogni libro "Non disponibile" perche' leggeva
 *    `libro.disponibile`, campo che l'API non restituisce;
 *  - i contatori `copieDisponibili` del seed non corrispondevano ai prestiti.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import {
  caratteristichePosto,
  caricaLibriConsigliati,
  caricaPostiPreferiti,
} from "@/lib/home-dati";
import { formattaPosizioneLibro, normalizzaLibro } from "@/lib/catalogo-libri";
import { calcolaCopieDisponibili, riallineaCopieDisponibili } from "@/lib/copie-libri";

describe("caricaLibriConsigliati", () => {
  it("[TC-HOME-001] ritorna libri letti dal DB con la disponibilita' reale", async () => {
    const db = {
      libro: {
        findMany: vi.fn().mockResolvedValue([
          { id: "cmk1", titolo: "A", autore: "X", categoria: "Informatica", copieDisponibili: 2 },
          { id: "cmk2", titolo: "B", autore: "Y", categoria: null, copieDisponibili: 0 },
        ]),
      },
    };
    const libri = await caricaLibriConsigliati(db as never);
    expect(libri.map((l) => [l.id, l.disponibile])).toEqual([
      ["cmk1", true],
      ["cmk2", false],
    ]);
    expect(db.libro.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 3 }));
  });

  it("[TC-HOME-002] catalogo vuoto -> lista vuota, nessun libro inventato", async () => {
    const db = { libro: { findMany: vi.fn().mockResolvedValue([]) } };
    expect(await caricaLibriConsigliati(db as never)).toEqual([]);
  });
});

describe("caricaPostiPreferiti", () => {
  const posto = (id: string, extra = {}) => ({
    id,
    numero: `N-${id}`,
    attivo: true,
    stato: "DISPONIBILE",
    haPresaElettrica: true,
    haFinestra: false,
    isAccessibile: false,
    tavoloRegolabile: false,
    sala: { nome: "Sala Lettura", piano: 1 },
    ...extra,
  });

  it("[TC-HOME-003] nessuna prenotazione -> lista vuota e nessuna query sui posti", async () => {
    const db = {
      prenotazione: { groupBy: vi.fn().mockResolvedValue([]) },
      posto: { findMany: vi.fn() },
    };
    expect(await caricaPostiPreferiti("u1", db as never)).toEqual([]);
    expect(db.posto.findMany).not.toHaveBeenCalled();
  });

  it("[TC-HOME-004] rispetta l'ordine 'piu' usato prima' e lo stato reale del posto", async () => {
    const db = {
      prenotazione: {
        groupBy: vi.fn().mockResolvedValue([{ postoId: "p2" }, { postoId: "p1" }]),
      },
      posto: {
        findMany: vi
          .fn()
          .mockResolvedValue([posto("p1"), posto("p2", { stato: "OCCUPATO" })]),
      },
    };
    const posti = await caricaPostiPreferiti("u1", db as never);
    expect(posti.map((p) => [p.id, p.disponibile])).toEqual([
      ["p2", false],
      ["p1", true],
    ]);
    expect(posti[0]).toMatchObject({ sala: "Sala Lettura", piano: 1 });
    expect(db.prenotazione.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: "u1",
          stato: { in: ["CONFERMATA", "CHECK_IN", "COMPLETATA"] },
        }),
      }),
    );
  });

  it("[TC-HOME-005] elenca solo le caratteristiche che il posto ha davvero", () => {
    expect(
      caratteristichePosto({
        haPresaElettrica: true,
        haFinestra: false,
        isAccessibile: true,
        tavoloRegolabile: false,
      }),
    ).toEqual(["Presa elettrica", "Accessibile"]);
  });
});

describe("normalizzaLibro", () => {
  const base = { copieTotali: 5, copieDisponibili: 3, anno: 2008, scaffale: "INF-A", piano: 1 };

  it("[TC-CAT-010] deriva `disponibile` dalle copie (prima era sempre undefined)", () => {
    expect(normalizzaLibro(base).disponibile).toBe(true);
    expect(normalizzaLibro({ ...base, copieDisponibili: 0 }).disponibile).toBe(false);
  });

  it("[TC-CAT-011] mappa anno/scaffale/piano sui campi mostrati dalla UI", () => {
    const libro = normalizzaLibro(base);
    expect(libro.annoPubblicazione).toBe(2008);
    expect(libro.posizione).toBe("INF-A · Piano 1");
  });

  it("[TC-CAT-012] campi assenti -> null, non 'undefined' a schermo", () => {
    const libro = normalizzaLibro({ copieTotali: 1, copieDisponibili: 1 });
    expect(libro.annoPubblicazione).toBeNull();
    expect(libro.posizione).toBeNull();
    expect(formattaPosizioneLibro(null, 0)).toBe("Piano 0");
  });

  it("[TC-CAT-013] contatore fuori scala limitato a 0..totali", () => {
    expect(normalizzaLibro({ ...base, copieDisponibili: -1 }).copieDisponibili).toBe(0);
    expect(normalizzaLibro({ ...base, copieDisponibili: 9 }).copieDisponibili).toBe(5);
  });
});

describe("riallineaCopieDisponibili", () => {
  const libri = [
    { id: "a", titolo: "Clean Code", copieTotali: 5, copieDisponibili: 3 },
    { id: "b", titolo: "Fluent Python", copieTotali: 3, copieDisponibili: 1 },
    { id: "c", titolo: "Coerente", copieTotali: 2, copieDisponibili: 1 },
  ];
  const creaDb = () => ({
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
  });

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
});
