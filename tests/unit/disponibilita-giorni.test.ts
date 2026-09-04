/**
 * Test di hardening per `GET /api/disponibilita-giorni` (finding M-4).
 *
 * COSA verifica:
 *  - range con date non valide → 422;
 *  - `endDate` prima di `startDate` → 422;
 *  - range oltre 90 giorni → 422 (nessun fan-out di query);
 *  - range valido (<= 90 giorni) → 200 con UNA sola `groupBy` e nessun
 *    `prenotazione.count` per-giorno.
 *
 * PERCHÉ: prima il range non era validato e generava un `count` per ogni giorno
 * dentro un `Promise.all` senza tetto (DoS applicativo).
 */
import { NextRequest } from "next/server";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  prisma: {
    posto: { count: vi.fn() },
    prenotazione: { count: vi.fn(), groupBy: vi.fn() },
  },
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/prisma", () => ({ default: mocks.prisma, prisma: mocks.prisma }));

type Route = typeof import("@/app/api/disponibilita-giorni/route");
let route: Route;

function get(qs: string) {
  return new NextRequest(`http://localhost/api/disponibilita-giorni${qs}`);
}

beforeAll(async () => {
  route = await import("@/app/api/disponibilita-giorni/route");
});

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: "studente-1" } });
  mocks.prisma.posto.count.mockResolvedValue(10);
  mocks.prisma.prenotazione.groupBy.mockResolvedValue([]);
});

describe("M-4 · validazione del range di giorni", () => {
  it("[TC-M4-001] date non valide → 422", async () => {
    const response = await route.GET(
      get("?startDate=non-una-data&endDate=nemmeno"),
    );
    expect(response.status).toBe(422);
    expect(mocks.prisma.prenotazione.groupBy).not.toHaveBeenCalled();
  });

  it("[TC-M4-002] endDate precedente a startDate → 422", async () => {
    const response = await route.GET(
      get("?startDate=2030-02-10&endDate=2030-02-01"),
    );
    expect(response.status).toBe(422);
    expect(mocks.prisma.prenotazione.groupBy).not.toHaveBeenCalled();
  });

  it("[TC-M4-003] range oltre 90 giorni → 422, nessuna query eseguita", async () => {
    // 2030-01-01 → 2030-12-31 = 365 giorni.
    const response = await route.GET(
      get("?startDate=2030-01-01&endDate=2030-12-31"),
    );
    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining("90"),
    });
    expect(mocks.prisma.posto.count).not.toHaveBeenCalled();
    expect(mocks.prisma.prenotazione.groupBy).not.toHaveBeenCalled();
    expect(mocks.prisma.prenotazione.count).not.toHaveBeenCalled();
  });

  it("[TC-M4-004] esattamente 90 giorni → 200 con UNA groupBy e zero count per-giorno", async () => {
    // 2030-01-01 → 2030-03-31 = 90 giorni inclusivi.
    mocks.prisma.prenotazione.groupBy.mockResolvedValue([
      { data: new Date("2030-01-02T00:00:00.000Z"), _count: { _all: 3 } },
    ]);

    const response = await route.GET(
      get("?startDate=2030-01-01&endDate=2030-03-31"),
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      disponibilita: Array<{ data: string; postiDisponibili: number; postiTotali: number }>;
    };
    expect(body.disponibilita).toHaveLength(90);
    // Il fan-out per-giorno è stato sostituito da una sola groupBy.
    expect(mocks.prisma.prenotazione.groupBy).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.prenotazione.count).not.toHaveBeenCalled();
    // Il giorno con 3 prenotazioni attive ha 10 - 3 = 7 posti disponibili.
    const giorno = body.disponibilita.find((d) => d.data === "2030-01-02");
    expect(giorno?.postiDisponibili).toBe(7);
  });
});
