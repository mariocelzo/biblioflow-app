/**
 * Test di hardening per `GET /api/libri` (finding B-4).
 *
 * COSA verifica: `page` e `limit` presi dalla query string vengono sempre
 * riportati in un intervallo sicuro prima di finire in `skip`/`take`:
 *  - `limit` è vincolato a 1..100;
 *  - `page` è almeno 1 (nessun `skip` negativo);
 *  - valori non numerici ricadono sul default (nessun 500).
 *
 * PERCHÉ: prima `parseInt` senza clamp permetteva `take`/`skip` abnormi
 * (query costose, risposte JSON enormi) o negativi.
 */
import { NextRequest } from "next/server";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    libro: { count: vi.fn(), findMany: vi.fn() },
  },
}));

vi.mock("@/lib/prisma", () => ({ default: mocks.prisma, prisma: mocks.prisma }));

type Route = typeof import("@/app/api/libri/route");
let route: Route;

function get(qs: string) {
  return new NextRequest(`http://localhost/api/libri${qs}`);
}

/** Ultimi argomenti passati a `prisma.libro.findMany`. */
function ultimoFindManyArg() {
  const calls = mocks.prisma.libro.findMany.mock.calls;
  return calls[calls.length - 1][0] as { skip: number; take: number };
}

beforeAll(async () => {
  route = await import("@/app/api/libri/route");
});

beforeEach(() => {
  vi.resetAllMocks();
  mocks.prisma.libro.count.mockResolvedValue(0);
  mocks.prisma.libro.findMany.mockResolvedValue([]);
});

describe("B-4 · clamp di page/limit", () => {
  it("[TC-B4-001] limit enorme → clampato a 100", async () => {
    const response = await route.GET(get("?limit=99999"));
    expect(response.status).toBe(200);
    expect(ultimoFindManyArg().take).toBe(100);
    await expect(response.json()).resolves.toMatchObject({
      pagination: { limit: 100 },
    });
  });

  it("[TC-B4-002] limit negativo → clampato a 1", async () => {
    await route.GET(get("?limit=-5"));
    expect(ultimoFindManyArg().take).toBe(1);
  });

  it("[TC-B4-003] page negativa → clampata a 1 (skip 0)", async () => {
    await route.GET(get("?page=-3&limit=20"));
    expect(ultimoFindManyArg().skip).toBe(0);
  });

  it("[TC-B4-004] limit non numerico → default 20", async () => {
    await route.GET(get("?limit=abc"));
    expect(ultimoFindManyArg().take).toBe(20);
  });

  it("[TC-B4-005] valori validi → skip/take coerenti", async () => {
    await route.GET(get("?page=2&limit=50"));
    const arg = ultimoFindManyArg();
    expect(arg.take).toBe(50);
    expect(arg.skip).toBe(50);
  });

  it("[TC-B4-006] piano non numerico non arriva a Prisma (nessun 500)", async () => {
    const response = await route.GET(get("?piano=abc"));
    expect(response.status).toBe(200);
    const where = mocks.prisma.libro.findMany.mock.calls[0][0].where as Record<
      string,
      unknown
    >;
    expect(where).not.toHaveProperty("piano");
  });
});
