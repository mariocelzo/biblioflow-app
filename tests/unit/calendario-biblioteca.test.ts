/**
 * Test unitari per src/lib/calendario-biblioteca.ts (domenica/festivita'/
 * orizzonte 30gg — vedi il commento in cima a quel file per il difetto
 * "no-limite-server-domenica-festivi-30gg" che lo ha reso necessario).
 *
 * Puro, senza Prisma/DB: usa solo `Date` UTC di calendario (mezzanotte UTC
 * che rappresenta anno/mese/giorno), esattamente come lo riceve
 * `validaIntervallo` in prenotazioni-service.ts.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  ORIZZONTE_MASSIMO_GIORNI,
  isGiornoChiusoBiblioteca,
  superaOrizzonteMassimo,
} from "@/lib/calendario-biblioteca";

// PRINCIPIO GUIDA PER IL TEMPO: gira con TZ=UTC (come il server su Vercel),
// non con l'ora legale di chi esegue i test — vedi commento analogo in
// tests/unit/prenotazioni-estendi-orario-passato.test.ts.
const TZ_ORIGINALE = process.env.TZ;
beforeAll(() => {
  process.env.TZ = "UTC";
});
afterAll(() => {
  process.env.TZ = TZ_ORIGINALE;
});

function dataCalendario(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

describe("isGiornoChiusoBiblioteca", () => {
  it("[TC-CAL-001] rifiuta una domenica", () => {
    // 2026-09-27: la domenica riprodotta dal vivo nel difetto di collaudo
    // (POST /api/prenotazioni accettava questa data con 201 CONFERMATA).
    expect(isGiornoChiusoBiblioteca(dataCalendario("2026-09-27"))).toEqual({
      chiuso: true,
      motivo: "La biblioteca è chiusa la domenica",
    });
  });

  it("[TC-CAL-002] rifiuta una festivita' fissa (Immacolata Concezione)", () => {
    // 2026-12-08 (martedi'): festivita' fissa che NON cade di domenica,
    // cosi' questo test isola davvero il ramo "festività" da quello
    // "domenica" (a differenza di Ognissanti 2026-11-01, che nel 2026 cade
    // di domenica ed e' gia' coperto da TC-CAL-001 — coincidenza verificata
    // anche nel collaudo dal vivo che ha scoperto questo difetto).
    expect(isGiornoChiusoBiblioteca(dataCalendario("2026-12-08"))).toEqual({
      chiuso: true,
      motivo: "La biblioteca è chiusa per festività",
    });
  });

  it("[TC-CAL-003] rifiuta Pasquetta (festivita' mobile, calcolata non hardcodata)", () => {
    // Pasquetta 2026 = 6 aprile (Pasqua 2026 = 5 aprile): verificato contro
    // il calendario civile italiano reale, non solo contro l'algoritmo.
    expect(isGiornoChiusoBiblioteca(dataCalendario("2026-04-06"))).toEqual({
      chiuso: true,
      motivo: "La biblioteca è chiusa per festività",
    });
    // Un anno DIVERSO da quello con cui e' stato scritto il vecchio
    // FESTIVITA_2026 del wizard: dimostra che Pasquetta e' CALCOLATA, non
    // letta da una tabella scaduta al cambio di anno. Pasqua 2027 = 28
    // marzo, Pasquetta = 29 marzo.
    expect(isGiornoChiusoBiblioteca(dataCalendario("2027-03-29"))).toEqual({
      chiuso: true,
      motivo: "La biblioteca è chiusa per festività",
    });
  });

  it("[TC-CAL-004] accetta un giorno feriale qualunque", () => {
    // 2026-09-24 (giovedi'): nessuna domenica, nessuna festivita' fissa,
    // lontano da Pasquetta.
    expect(isGiornoChiusoBiblioteca(dataCalendario("2026-09-24"))).toEqual({
      chiuso: false,
      motivo: "",
    });
  });

  it("[TC-CAL-005] non scambia un sabato per una domenica", () => {
    // 2026-09-26 (sabato): la biblioteca resta aperta (solo la domenica e'
    // esplicitamente chiusa).
    expect(isGiornoChiusoBiblioteca(dataCalendario("2026-09-26")).chiuso).toBe(
      false,
    );
  });
});

describe("superaOrizzonteMassimo", () => {
  const oggi = dataCalendario("2026-09-24");

  it("[TC-CAL-006] accetta esattamente il limite di 30 giorni", () => {
    expect(ORIZZONTE_MASSIMO_GIORNI).toBe(30);
    expect(
      superaOrizzonteMassimo(dataCalendario("2026-10-24"), oggi),
    ).toBe(false);
  });

  it("[TC-CAL-007] rifiuta un giorno oltre il limite (31 giorni)", () => {
    // Stesso scenario del collaudo dal vivo: 2026-11-15 e' 52 giorni dopo
    // 2026-09-24, ben oltre i 30 ammessi.
    expect(
      superaOrizzonteMassimo(dataCalendario("2026-11-15"), oggi),
    ).toBe(true);
  });

  it("[TC-CAL-008] accetta la data odierna (0 giorni di anticipo)", () => {
    expect(superaOrizzonteMassimo(oggi, oggi)).toBe(false);
  });
});
