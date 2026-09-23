// ============================================================================
// Test di GET /api/notifiche — validazione di `limit`/`offset`
// ============================================================================
// COSA: `limit`/`offset` finivano in `parseInt(...)` senza alcuna guardia
// anti-NaN prima di raggiungere `take`/`skip` di Prisma — stessa famiglia del
// difetto corretto in GET /api/sale per `piano`. A differenza di `piano`
// (filtro categorico su un `where`), qui il parametro è la dimensione della
// pagina: coerentemente con `intNelRange` di src/app/api/libri/route.ts, un
// valore non numerico torna al default invece di un 422.

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  prisma: {
    notifica: { findMany: vi.fn(), count: vi.fn() },
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
  isStaff: () => false,
  assertOwnership: () => {},
}));
vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));

type NotificheRoute = typeof import("@/app/api/notifiche/route");

let route: NotificheRoute;

beforeEach(async () => {
  vi.resetAllMocks();
  route = await import("@/app/api/notifiche/route");
  mocks.requireUser.mockResolvedValue({ id: "studente-1", ruolo: "STUDENTE" });
  mocks.prisma.notifica.findMany.mockResolvedValue([]);
  mocks.prisma.notifica.count.mockResolvedValue(0);
});

describe("GET /api/notifiche · limit/offset non numerici", () => {
  it("[TC-NOTIF-PAG-001] `limit`/`offset` non numerici non causano un errore: si usano i default", async () => {
    const res = await route.GET(
      new NextRequest("http://localhost/api/notifiche?limit=abc&offset=xyz"),
    );

    expect(res.status).toBe(200);
    const argomenti = mocks.prisma.notifica.findMany.mock.calls[0][0];
    expect(argomenti.take).toBe(50);
    expect(argomenti.skip).toBe(0);
  });

  it("[TC-NOTIF-PAG-002] un `limit` oltre il tetto viene riportato a 100", async () => {
    const res = await route.GET(new NextRequest("http://localhost/api/notifiche?limit=9999"));

    expect(res.status).toBe(200);
    const argomenti = mocks.prisma.notifica.findMany.mock.calls[0][0];
    expect(argomenti.take).toBe(100);
  });
});
