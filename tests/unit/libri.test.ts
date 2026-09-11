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

const mocks = vi.hoisted(() => {
  // `AuthError` ridefinito qui e non importato da `@/lib/auth`: quel modulo e'
  // interamente sostituito dal mock, quindi l'handler confrontera' `instanceof`
  // proprio contro questa classe.
  class AuthError extends Error {
    constructor(
      public readonly status: 401 | 403 | 404,
      public readonly code: string,
      message: string,
    ) {
      super(message);
      this.name = "AuthError";
    }
  }

  return {
    AuthError,
    requireUser: vi.fn(),
    prisma: {
      libro: { count: vi.fn(), findMany: vi.fn() },
    },
  };
});

vi.mock("@/lib/prisma", () => ({ default: mocks.prisma, prisma: mocks.prisma }));

// PERCHE' SERVE ORA: `GET /api/libri` non si autenticava affatto e il suo
// unico filtro era il middleware, che verificava solo l'ESISTENZA di un cookie
// di sessione. Da questo intervento la rotta chiama `requireUser()`, quindi il
// test deve fornire una sessione: senza mock, `auth()` cercherebbe gli header
// della richiesta fuori da un contesto Next e fallirebbe.
vi.mock("@/lib/auth", () => ({
  AuthError: mocks.AuthError,
  requireUser: mocks.requireUser,
}));

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
  // Sessione valida: qui si verifica il clamp dei parametri, non l'accesso.
  mocks.requireUser.mockResolvedValue({
    id: "utente-test",
    email: "studente@studenti.unisa.it",
    nome: "Studente",
    cognome: "Test",
    ruolo: "STUDENTE",
    matricola: null,
    isPendolare: false,
    necessitaAccessibilita: false,
  });
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

describe("difesa in profondita' · il catalogo si autentica da solo", () => {
  it("[TC-LIBRI-AUTH-001] senza sessione risponde 401 e non interroga il database", async () => {
    // PERCHE': fino a questo intervento la rotta non chiamava alcun controllo
    // di identita'. La sua unica barriera era il middleware, che si limitava a
    // verificare che ESISTESSE un cookie di sessione — quindi `curl -H
    // 'Cookie: authjs.session-token=x' /api/libri` rispondeva 200 con i dati.
    // Il middleware ora verifica il token sul serio, ma non deve restare
    // l'unica difesa: se il `matcher` a regex sbagliasse (e' gia' successo,
    // finding M-5), questo controllo continuerebbe a reggere.
    mocks.requireUser.mockRejectedValue(
      new mocks.AuthError(401, "NON_AUTENTICATO", "E' richiesta una sessione autenticata"),
    );

    const response = await route.GET(get(""));

    expect(response.status).toBe(401);
    expect(mocks.prisma.libro.findMany).not.toHaveBeenCalled();
    expect(mocks.prisma.libro.count).not.toHaveBeenCalled();
  });
});
