/**
 * Test unitari — GET /api/admin/statistiche?tipo=occupazione-oraria
 * (difetto "statistiche-occupazione-oraria-sempre-zero").
 *
 * BUG VERIFICATO DAL VIVO: con prenotazioni CHECK_IN/COMPLETATA reali, il
 * grafico "Occupazione oraria" mostrava SEMPRE 0 in ogni fascia (08:00..22:00).
 *
 * CAUSA: `p.oraInizio` e' un oggetto Date (colonna @db.Time letta cosi' da
 * Prisma), non una stringa "HH:mm". Il vecchio
 * `` `1970-01-01T${p.oraInizio}` `` interpolava `Date.prototype.toString()`,
 * non parsabile da `new Date(...)` → Invalid Date → `.getHours()` = NaN →
 * `oraKey` diventava sempre "NaN:00", che non combacia mai con nessuna delle
 * chiavi precostruite: il contatore per quella fascia non veniva mai
 * incrementato.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  prisma: {
    prenotazione: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/prisma", () => ({ default: mocks.prisma, prisma: mocks.prisma }));

type Route = typeof import("@/app/api/admin/statistiche/route");
let route: Route;

const admin = { id: "admin-1", ruolo: "ADMIN" };

/** oraInizio ("HH:MM") → Date nel formato @db.Time (1970-01-01 UTC), come lo restituisce Prisma. */
function oraDb(hh: number, mm: number): Date {
  return new Date(Date.UTC(1970, 0, 1, hh, mm));
}

function request(tipo: string) {
  return new NextRequest(`http://localhost/api/admin/statistiche?tipo=${tipo}`);
}

beforeEach(async () => {
  vi.resetAllMocks();
  route = await import("@/app/api/admin/statistiche/route");
  mocks.auth.mockResolvedValue({ user: admin });
});

describe("occupazione-oraria — la fascia oraria si calcola dalle cifre UTC dell'oggetto Date", () => {
  it("[TC-STAT-ORA-001] conta correttamente le prenotazioni per fascia (BUG STORICO: prima restituiva sempre 0)", async () => {
    mocks.prisma.prenotazione.findMany.mockResolvedValue([
      { oraInizio: oraDb(9, 15) }, // → fascia 09:00
      { oraInizio: oraDb(9, 50) }, // → fascia 09:00
      { oraInizio: oraDb(14, 5) }, // → fascia 14:00
      { oraInizio: oraDb(21, 59) }, // → fascia 21:00
    ]);

    const res = await route.GET(request("occupazione-oraria"));
    const body = (await res.json()) as { data: { ora: string; prenotazioni: number }[] };

    expect(res.status).toBe(200);
    const perOra = Object.fromEntries(body.data.map((r) => [r.ora, r.prenotazioni]));
    expect(perOra["09:00"]).toBe(2);
    expect(perOra["14:00"]).toBe(1);
    expect(perOra["21:00"]).toBe(1);
    // Tutte le altre 12 fasce (15 fasce totali, 08:00..22:00) restano a 0.
    const totale = Object.values(perOra).reduce((s, n) => s + n, 0);
    expect(totale).toBe(4);
    expect(body.data).toHaveLength(15);
  });

  it("[TC-STAT-ORA-002] con nessuna prenotazione tutte le 15 fasce sono a 0 (non NaN, non stringhe)", async () => {
    mocks.prisma.prenotazione.findMany.mockResolvedValue([]);

    const res = await route.GET(request("occupazione-oraria"));
    const body = (await res.json()) as { data: { ora: string; prenotazioni: number }[] };

    expect(body.data).toHaveLength(15);
    for (const riga of body.data) {
      expect(riga.prenotazioni).toBe(0);
      expect(Number.isNaN(riga.prenotazioni)).toBe(false);
    }
  });

  it("[TC-STAT-ORA-003] un orario fuori dall'inviluppo 08:00-22:00 non incrementa nessuna fascia (e non fa crashare la route)", async () => {
    mocks.prisma.prenotazione.findMany.mockResolvedValue([{ oraInizio: oraDb(23, 0) }]);

    const res = await route.GET(request("occupazione-oraria"));
    const body = (await res.json()) as { data: { ora: string; prenotazioni: number }[] };

    expect(res.status).toBe(200);
    const totale = body.data.reduce((s, r) => s + r.prenotazioni, 0);
    expect(totale).toBe(0);
  });
});
