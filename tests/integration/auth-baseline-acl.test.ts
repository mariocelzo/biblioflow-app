// ============================================================================
// Test integrazione - Broken Access Control su endpoint baseline (C-3, C-4, C-6)
// ============================================================================
// COSA: verifica che gli endpoint /api/prestiti, /api/notifiche e /api/richieste
//       - fino a ieri privi di qualunque controllo di autenticazione - ora:
//         * rifiutino con 401 ogni chiamata senza sessione;
//         * impediscano a uno STUDENTE di leggere/modificare risorse altrui
//           (404 per "risorsa nascosta");
//         * ignorino sempre lo `userId` inviato nel body/query, usando solo
//           l'identita' della sessione.
// PERCHE': sono le stesse garanzie gia' coperte per /api/prenotazioni in
//       tests/integration/auth-prenotazioni.test.ts; qui le estendiamo agli
//       endpoint baseline rientrati in scope con l'audit di sicurezza.
//
// Il mock di "@/lib/auth" replica il contratto reale: requireUser e' un vi.fn()
// pilotabile per test, mentre assertOwnership/isStaff usano la logica vera.

import { NextRequest } from "next/server";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class MockAuthError extends Error {
    constructor(
      public readonly status: 401 | 403 | 404,
      public readonly code: string,
      message: string,
    ) {
      super(message);
      this.name = "AuthError";
    }
  }

  const requireUser = vi.fn();

  // Client Prisma completamente finto: ogni metodo usato dalle route sotto test.
  const prisma = {
    $transaction: vi.fn(),
    prestito: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
    notifica: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
    },
    richiestaPreparazione: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
    user: { findUnique: vi.fn() },
    libro: { findUnique: vi.fn() },
    logEvento: { create: vi.fn() },
  };

  return { MockAuthError, requireUser, prisma };
});

vi.mock("@/lib/auth", () => ({
  AuthError: mocks.MockAuthError,
  requireUser: mocks.requireUser,
  // Logica reale: lo staff sono BIBLIOTECARIO e ADMIN.
  isStaff: (ruolo: string) => ruolo === "BIBLIOTECARIO" || ruolo === "ADMIN",
  // Logica reale: al proprietario passa; allo studente non proprietario la
  // risorsa "non esiste" (404); agli altri ruoli e' 403.
  assertOwnership: (
    resource: { userId: string },
    user: { id: string; ruolo: string },
  ) => {
    if (resource.userId === user.id) return;
    throw new mocks.MockAuthError(
      user.ruolo === "STUDENTE" ? 404 : 403,
      user.ruolo === "STUDENTE"
        ? "RISORSA_NON_TROVATA"
        : "RISORSA_NON_AUTORIZZATA",
      user.ruolo === "STUDENTE"
        ? "La risorsa richiesta non esiste"
        : "L'utente non e' proprietario della risorsa",
    );
  },
}));

vi.mock("@/lib/prisma", () => ({ default: mocks.prisma, prisma: mocks.prisma }));
vi.mock("@/lib/rate-limit", () => ({
  readApiRateLimiter: vi.fn(() => null),
  loanRequestRateLimiter: vi.fn(() => null),
}));

type PrestitiRoute = typeof import("@/app/api/prestiti/route");
type PrestitoDetailRoute = typeof import("@/app/api/prestiti/[id]/route");
type PrestitoRinnovaRoute = typeof import("@/app/api/prestiti/[id]/rinnova/route");
type NotificheRoute = typeof import("@/app/api/notifiche/route");
type RichiesteRoute = typeof import("@/app/api/richieste/route");

let prestitiRoute: PrestitiRoute;
let prestitoDetailRoute: PrestitoDetailRoute;
let prestitoRinnovaRoute: PrestitoRinnovaRoute;
let notificheRoute: NotificheRoute;
let richiesteRoute: RichiesteRoute;

const studentA = {
  id: "utente-a",
  email: "a@biblioflow.test",
  nome: "Ada",
  cognome: "A",
  ruolo: "STUDENTE" as const,
  matricola: "A001",
  isPendolare: false,
  necessitaAccessibilita: false,
};

const librarian = {
  ...studentA,
  id: "bibliotecario-1",
  ruolo: "BIBLIOTECARIO" as const,
};

function request(
  url: string,
  method: "GET" | "POST" | "PATCH" | "DELETE" = "GET",
  body?: object,
) {
  return new NextRequest(url, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
}

// Params fittizi per le route dinamiche [id].
const detailParams = { params: Promise.resolve({ id: "prestito-b" }) };

beforeAll(async () => {
  [
    prestitiRoute,
    prestitoDetailRoute,
    prestitoRinnovaRoute,
    notificheRoute,
    richiesteRoute,
  ] = await Promise.all([
    import("@/app/api/prestiti/route"),
    import("@/app/api/prestiti/[id]/route"),
    import("@/app/api/prestiti/[id]/rinnova/route"),
    import("@/app/api/notifiche/route"),
    import("@/app/api/richieste/route"),
  ]);
});

beforeEach(() => {
  vi.resetAllMocks();
});

describe("ACL baseline - nessuna sessione (C-3/C-4/C-6)", () => {
  it("[TC-SEC-ACL-001] risponde 401 su ogni operazione senza sessione", async () => {
    // requireUser lancia AuthError 401: e' il comportamento reale con auth() nullo.
    mocks.requireUser.mockRejectedValue(
      new mocks.MockAuthError(
        401,
        "NON_AUTENTICATO",
        "E' richiesta una sessione autenticata",
      ),
    );

    const calls = [
      () => prestitiRoute.GET(request("http://localhost/api/prestiti")),
      () => prestitiRoute.POST(request("http://localhost/api/prestiti", "POST", {})),
      () => prestitoDetailRoute.GET(request("http://localhost/api/prestiti/x"), detailParams),
      () => prestitoDetailRoute.PATCH(request("http://localhost/api/prestiti/x", "PATCH", {}), detailParams),
      () => prestitoRinnovaRoute.POST(request("http://localhost/api/prestiti/x/rinnova", "POST", {}), detailParams),
      () => notificheRoute.GET(request("http://localhost/api/notifiche")),
      () => notificheRoute.POST(request("http://localhost/api/notifiche", "POST", {})),
      () => notificheRoute.PATCH(request("http://localhost/api/notifiche", "PATCH", {})),
      () => notificheRoute.DELETE(request("http://localhost/api/notifiche?id=x", "DELETE")),
      () => richiesteRoute.POST(request("http://localhost/api/richieste", "POST", {})),
      () => richiesteRoute.GET(),
    ];

    const responses = await Promise.all(calls.map((call) => call()));
    expect(responses.map((r) => r.status)).toEqual(
      Array(responses.length).fill(401),
    );
  });
});

describe("ACL baseline - STUDENTE e risorse altrui (C-3/C-4)", () => {
  it("[TC-SEC-ACL-010] GET /api/prestiti/[id] nasconde (404) il prestito di un altro utente", async () => {
    mocks.requireUser.mockResolvedValue(studentA);
    mocks.prisma.prestito.findUnique.mockResolvedValue({
      id: "prestito-b",
      userId: "utente-b",
      dataScadenza: new Date("2999-01-01"),
      stato: "ATTIVO",
      libro: { id: "libro-1", titolo: "X" },
    });

    const response = await prestitoDetailRoute.GET(
      request("http://localhost/api/prestiti/prestito-b"),
      detailParams,
    );

    expect(response.status).toBe(404);
  });

  it("[TC-SEC-ACL-011] PATCH /api/prestiti/[id] non rinnova il prestito altrui (404)", async () => {
    mocks.requireUser.mockResolvedValue(studentA);
    mocks.prisma.prestito.findUnique.mockResolvedValue({
      id: "prestito-b",
      userId: "utente-b",
      stato: "ATTIVO",
      rinnovi: 0,
      maxRinnovi: 2,
      libroId: "libro-1",
      libro: { id: "libro-1", titolo: "X" },
    });

    const response = await prestitoDetailRoute.PATCH(
      request("http://localhost/api/prestiti/prestito-b", "PATCH", {
        azione: "rinnova",
      }),
      detailParams,
    );

    expect(response.status).toBe(404);
    expect(mocks.prisma.prestito.update).not.toHaveBeenCalled();
  });

  it("[TC-SEC-ACL-012] POST /api/prestiti/[id]/rinnova non tocca il prestito altrui (404)", async () => {
    mocks.requireUser.mockResolvedValue(studentA);
    mocks.prisma.prestito.findUnique.mockResolvedValue({
      id: "prestito-b",
      userId: "utente-b",
      stato: "ATTIVO",
      rinnovi: 0,
      maxRinnovi: 2,
      libro: { id: "libro-1", titolo: "X" },
    });

    const response = await prestitoRinnovaRoute.POST(
      request("http://localhost/api/prestiti/prestito-b/rinnova", "POST", {}),
      detailParams,
    );

    expect(response.status).toBe(404);
    expect(mocks.prisma.prestito.update).not.toHaveBeenCalled();
  });

  it("[TC-SEC-ACL-013] DELETE /api/notifiche non elimina la notifica altrui (404)", async () => {
    mocks.requireUser.mockResolvedValue(studentA);
    mocks.prisma.notifica.findUnique.mockResolvedValue({
      id: "notifica-b",
      userId: "utente-b",
    });

    const response = await notificheRoute.DELETE(
      request("http://localhost/api/notifiche?id=notifica-b", "DELETE"),
    );

    expect(response.status).toBe(404);
    expect(mocks.prisma.notifica.delete).not.toHaveBeenCalled();
  });

  it("[TC-SEC-ACL-014] POST /api/notifiche e' vietato allo STUDENTE (403)", async () => {
    mocks.requireUser.mockResolvedValue(studentA);

    const response = await notificheRoute.POST(
      request("http://localhost/api/notifiche", "POST", {
        userId: "utente-b",
        tipo: "SISTEMA",
        titolo: "t",
        messaggio: "m",
      }),
    );

    expect(response.status).toBe(403);
    expect(mocks.prisma.notifica.create).not.toHaveBeenCalled();
  });
});

describe("ACL baseline - userId dal client sempre ignorato (C-3/C-4/C-6)", () => {
  it("[TC-SEC-ACL-020] GET /api/prestiti ignora ?userId e filtra sulla sessione", async () => {
    mocks.requireUser.mockResolvedValue(studentA);
    mocks.prisma.prestito.findMany.mockResolvedValue([]);

    await prestitiRoute.GET(
      request("http://localhost/api/prestiti?userId=utente-b"),
    );

    expect(mocks.prisma.prestito.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: studentA.id }),
      }),
    );
  });

  it("[TC-SEC-ACL-021] POST /api/prestiti crea per l'utente autenticato, non per body.userId", async () => {
    mocks.requireUser.mockResolvedValue(studentA);
    mocks.prisma.user.findUnique.mockResolvedValue({ id: studentA.id });
    mocks.prisma.libro.findUnique.mockResolvedValue({
      id: "libro-1",
      titolo: "X",
      copieDisponibili: 3,
    });
    mocks.prisma.prestito.findFirst.mockResolvedValue(null);
    mocks.prisma.prestito.count.mockResolvedValue(0);

    // $transaction esegue la callback con un "tx" finto e ne restituisce il valore.
    const txPrestitoCreate = vi.fn().mockResolvedValue({
      id: "prestito-nuovo",
      userId: studentA.id,
    });
    mocks.prisma.$transaction.mockImplementation(
      async (cb: (tx: unknown) => unknown) =>
        cb({
          libro: { update: vi.fn().mockResolvedValue({}) },
          prestito: { create: txPrestitoCreate },
        }),
    );
    mocks.prisma.logEvento.create.mockResolvedValue({ id: "log-1" });
    mocks.prisma.notifica.create.mockResolvedValue({ id: "notifica-1" });

    const response = await prestitiRoute.POST(
      request("http://localhost/api/prestiti", "POST", {
        userId: "utente-b",
        libroId: "libro-1",
      }),
    );

    expect(response.status).toBe(201);
    // La verifica di esistenza utente e la create usano studentA.id, non "utente-b".
    expect(mocks.prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: studentA.id },
    });
    expect(txPrestitoCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: studentA.id }),
      }),
    );
  });

  it("[TC-SEC-ACL-022] POST /api/richieste ignora body.userId e usa la sessione", async () => {
    mocks.requireUser.mockResolvedValue(studentA);
    mocks.prisma.richiestaPreparazione.create.mockResolvedValue({
      id: "richiesta-1",
      userId: studentA.id,
    });

    const response = await richiesteRoute.POST(
      request("http://localhost/api/richieste", "POST", {
        userId: "utente-b",
        libroId: "libro-1",
        note: "ok",
      }),
    );

    expect(response.status).toBe(201);
    expect(mocks.prisma.richiestaPreparazione.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: studentA.id }),
      }),
    );
  });

  it("[TC-SEC-ACL-023] POST /api/richieste rifiuta una nota troppo lunga (422)", async () => {
    mocks.requireUser.mockResolvedValue(studentA);

    const response = await richiesteRoute.POST(
      request("http://localhost/api/richieste", "POST", {
        libroId: "libro-1",
        note: "x".repeat(501),
      }),
    );

    expect(response.status).toBe(422);
    expect(mocks.prisma.richiestaPreparazione.create).not.toHaveBeenCalled();
  });

  it("[TC-SEC-ACL-024] PATCH /api/notifiche limita l'update alle notifiche della sessione", async () => {
    mocks.requireUser.mockResolvedValue(studentA);
    mocks.prisma.notifica.updateMany.mockResolvedValue({ count: 1 });

    await notificheRoute.PATCH(
      request("http://localhost/api/notifiche", "PATCH", {
        ids: ["notifica-1"],
        userId: "utente-b",
        segnaLetta: true,
      }),
    );

    expect(mocks.prisma.notifica.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ["notifica-1"] }, userId: studentA.id },
      }),
    );
  });

  it("[TC-SEC-ACL-025] GET /api/notifiche ignora ?userId e filtra sulla sessione", async () => {
    mocks.requireUser.mockResolvedValue(studentA);
    mocks.prisma.notifica.findMany.mockResolvedValue([]);
    mocks.prisma.notifica.count.mockResolvedValue(0);

    await notificheRoute.GET(
      request("http://localhost/api/notifiche?userId=utente-b"),
    );

    expect(mocks.prisma.notifica.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: studentA.id }),
      }),
    );
  });
});

describe("ACL baseline - validazione actionUrl (B-8)", () => {
  it("[TC-SEC-ACL-030] POST /api/notifiche rifiuta un actionUrl esterno (422)", async () => {
    mocks.requireUser.mockResolvedValue(librarian);

    const response = await notificheRoute.POST(
      request("http://localhost/api/notifiche", "POST", {
        userId: "utente-a",
        tipo: "SISTEMA",
        titolo: "t",
        messaggio: "m",
        actionUrl: "https://evil.example/phish",
      }),
    );

    expect(response.status).toBe(422);
    expect(mocks.prisma.notifica.create).not.toHaveBeenCalled();
  });

  it("[TC-SEC-ACL-031] POST /api/notifiche accetta un actionUrl interno", async () => {
    mocks.requireUser.mockResolvedValue(librarian);
    mocks.prisma.user.findUnique.mockResolvedValue({ id: "utente-a" });
    mocks.prisma.notifica.create.mockResolvedValue({ id: "notifica-1" });

    const response = await notificheRoute.POST(
      request("http://localhost/api/notifiche", "POST", {
        userId: "utente-a",
        tipo: "SISTEMA",
        titolo: "t",
        messaggio: "m",
        actionUrl: "/prestiti",
      }),
    );

    expect(response.status).toBe(201);
    expect(mocks.prisma.notifica.create).toHaveBeenCalled();
  });
});
