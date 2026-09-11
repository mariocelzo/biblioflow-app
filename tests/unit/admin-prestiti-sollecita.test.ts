// ============================================================================
// Test di POST /api/admin/prestiti (rilievo #2 dell'audit: "Sollecita Tutti")
// ============================================================================
// COSA: il bottone "Sollecita Tutti" di src/app/admin/prestiti/page.tsx era
// un <form action="/api/admin/prestiti" method="POST"> senza campi. Un form
// HTML senza `enctype` manda, di default, un body
// "application/x-www-form-urlencoded" (qui vuoto, non avendo campi): questa
// route fa `await req.json()`, che lancia un SyntaxError su un body del
// genere. La pagina admin veniva percio' sostituita dal JSON grezzo di un
// errore 500.
//
// Il fix vero e proprio e' lato client: il form e' stato sostituito da un
// bottone che fa una `fetch` JSON con l'azione SOLLECITA_MULTIPLI gia'
// gestita da questa route (stesso pattern di prestiti-actions.tsx). Qui si
// verifica, a livello di API:
//   1. che l'azione SOLLECITA_MULTIPLI - su cui il nuovo bottone si appoggia
//      - funzioni correttamente con un body JSON;
//   2. che un body malformato (la firma esatta lasciata da un vecchio form
//      HTML) ora produca un 400 esplicito invece del 500 generico che
//      cancellava la pagina: irrobustisce la route anche per qualunque altro
//      punto la richiami senza passare da JSON.

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  prisma: {
    prestito: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    logEvento: { create: vi.fn() },
    notifica: { create: vi.fn() },
  },
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/prisma", () => ({ default: mocks.prisma }));
// Il rate limiting non è oggetto di questo file: viene mockato per non far
// scattare 429 con le ripetute chiamate a route.POST nei test qui sotto.
vi.mock("@/lib/rate-limit", () => ({
  staffCriticalApiRateLimiter: vi.fn(async () => null),
}));

type AdminPrestitiRoute = typeof import("@/app/api/admin/prestiti/route");

let route: AdminPrestitiRoute;

const bibliotecario = {
  id: "bibliotecario-1",
  email: "bibliotecario@biblioflow.test",
  ruolo: "BIBLIOTECARIO",
};

beforeEach(async () => {
  vi.resetAllMocks();
  route = await import("@/app/api/admin/prestiti/route");
  mocks.auth.mockResolvedValue({ user: bibliotecario });
});

describe("SOLLECITA_MULTIPLI (azione su cui si appoggia il nuovo bottone)", () => {
  it("[TC-PREST-SOLL-001] invia un sollecito per ogni prestito effettivamente in ritardo", async () => {
    mocks.prisma.prestito.findMany.mockResolvedValue([
      {
        id: "prestito-1",
        userId: "utente-1",
        dataScadenza: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
        libro: { id: "libro-1", titolo: "Moby Dick" },
        user: { id: "utente-1" },
      },
    ]);

    const req = new NextRequest("http://localhost/api/admin/prestiti", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ azione: "SOLLECITA_MULTIPLI", prestitoIds: ["prestito-1"] }),
    });

    const res = await route.POST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mocks.prisma.notifica.create).toHaveBeenCalledTimes(1);
  });
});

describe("Corpo della richiesta non-JSON (la firma esatta lasciata dal vecchio <form>)", () => {
  it("[TC-PREST-BADJSON-001] risponde 400 esplicito invece del 500 che sostituiva la pagina", async () => {
    // Un <form method="POST"> senza campi e senza `enctype` manda esattamente
    // questo: Content-Type x-www-form-urlencoded e body vuoto.
    const req = new NextRequest("http://localhost/api/admin/prestiti", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "",
    });

    const res = await route.POST(req);

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBeTruthy();
  });
});
