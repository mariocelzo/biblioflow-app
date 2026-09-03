import { describe, expect, it } from "vitest";

import {
  creaPayloadCoda,
  isPostoAccodabile,
} from "@/components/mappa-biblioteca";

describe("BIB-52 · ingresso in coda dalla mappa", () => {
  it("[TC-BIB52-001] abilita la coda solo per posti occupati o prenotati", () => {
    expect(isPostoAccodabile({ stato: "OCCUPATO" })).toBe(true);
    expect(isPostoAccodabile({ stato: "PRENOTATO" })).toBe(true);
    expect(isPostoAccodabile({ stato: "DISPONIBILE" })).toBe(false);
    expect(isPostoAccodabile({ stato: "MANUTENZIONE" })).toBe(false);
  });

  it("[TC-BIB52-002] costruisce il contratto richiesto dall'endpoint coda", () => {
    expect(creaPayloadCoda("posto-a1", {
      data: "2030-01-15",
      oraInizio: "09:00",
      oraFine: "11:00",
    })).toEqual({
      postoId: "posto-a1",
      data: "2030-01-15",
      oraInizio: "09:00",
      oraFine: "11:00",
    });
  });
});
