// ============================================================================
// Test di GET /api/sale — validazione del parametro `piano`
// ============================================================================
// COSA: `GET /api/sale?piano=abc` rispondeva 500. `where.piano =
// parseInt(piano)` con un valore non numerico produce `NaN`, che arrivava
// intatto in una query Prisma: Prisma rifiuta il valore con una
// `PrismaClientValidationError`, tradotta dal catch generico in un 500 privo
// di informazioni utili per il client. Ora un `piano` non numerico produce un
// 422 esplicito in italiano, coerente con le altre GET già corrette per i
// filtri da query string non validi (vedi
// tests/post-modifica/api-enum-validazione-db.test.ts).
//
// Mock-based (nessun DB): la validazione avviene PRIMA di qualunque query,
// quindi non serve toccare Prisma per il caso non valido; per il caso valido
// si verifica che il filtro raggiunga `prisma.sala.findMany` con il numero
// corretto.

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  prisma: {
    sala: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/auth", () => ({
  AuthError: class extends Error {
    constructor(
      public readonly status: number,
      public readonly code: string,
      message: string,
    ) {
      super(message);
    }
  },
  requireUser: mocks.requireUser,
}));
vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));

type SaleRoute = typeof import("@/app/api/sale/route");

let route: SaleRoute;

beforeEach(async () => {
  vi.resetAllMocks();
  route = await import("@/app/api/sale/route");
  mocks.requireUser.mockResolvedValue({
    id: "studente-1",
    email: "studente@biblioflow.test",
    ruolo: "STUDENTE",
  });
  mocks.prisma.sala.findMany.mockResolvedValue([]);
});

describe("GET /api/sale · parametro piano", () => {
  it("[TC-SALE-PIANO-001] risponde 422 (non 500) se `piano` non è un numero intero", async () => {
    const res = await route.GET(new NextRequest("http://localhost/api/sale?piano=abc"));

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(String(body.error)).toContain("piano");
    expect(mocks.prisma.sala.findMany).not.toHaveBeenCalled();
  });

  it("[TC-SALE-PIANO-002] continua ad accettare un piano numerico valido", async () => {
    const res = await route.GET(new NextRequest("http://localhost/api/sale?piano=2"));

    expect(res.status).toBe(200);
    expect(mocks.prisma.sala.findMany).toHaveBeenCalledTimes(1);
    const argomenti = mocks.prisma.sala.findMany.mock.calls[0][0];
    expect(argomenti.where.piano).toBe(2);
  });
});
