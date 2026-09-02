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
  const auth = vi.fn();
  const creaPrenotazioneAtomica = vi.fn();
  const prisma = {
    $transaction: vi.fn(),
    prenotazione: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      groupBy: vi.fn(),
    },
    posto: { findUnique: vi.fn(), update: vi.fn() },
    listaAttesa: { findMany: vi.fn() },
    logEvento: { create: vi.fn(), deleteMany: vi.fn() },
    notifica: { create: vi.fn() },
  };

  return {
    auth,
    creaPrenotazioneAtomica,
    MockAuthError,
    prisma,
    requireUser,
  };
});

vi.mock("@/lib/auth", () => ({
  AuthError: mocks.MockAuthError,
  auth: mocks.auth,
  requireUser: mocks.requireUser,
  assertOwnership: (resource: { userId: string }, user: { id: string; ruolo: string }) => {
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
vi.mock("@/lib/rate-limit", () => ({ readApiRateLimiter: vi.fn(() => null) }));
vi.mock("@/lib/prenotazioni-service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/prenotazioni-service")>()),
  creaPrenotazioneAtomica: mocks.creaPrenotazioneAtomica,
}));

type CollectionRoute = typeof import("@/app/api/prenotazioni/route");
type DetailRoute = typeof import("@/app/api/prenotazioni/[id]/route");
type ExtensionRoute = typeof import("@/app/api/prenotazioni/[id]/estendi/route");
type CheckInRoute = typeof import("@/app/api/prenotazioni/[id]/check-in/route");
type QueueRoute = typeof import("@/app/api/prenotazioni/coda/route");
type AdminStatisticsRoute = typeof import("@/app/api/admin/statistiche/route");

let collectionRoute: CollectionRoute;
let detailRoute: DetailRoute;
let extensionRoute: ExtensionRoute;
let checkInRoute: CheckInRoute;
let queueRoute: QueueRoute;
let adminStatisticsRoute: AdminStatisticsRoute;

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

const params = { params: Promise.resolve({ id: "prenotazione-b" }) };

beforeAll(async () => {
  [
    collectionRoute,
    detailRoute,
    extensionRoute,
    checkInRoute,
    queueRoute,
    adminStatisticsRoute,
  ] = await Promise.all([
    import("@/app/api/prenotazioni/route"),
    import("@/app/api/prenotazioni/[id]/route"),
    import("@/app/api/prenotazioni/[id]/estendi/route"),
    import("@/app/api/prenotazioni/[id]/check-in/route"),
    import("@/app/api/prenotazioni/coda/route"),
    import("@/app/api/admin/statistiche/route"),
  ]);
});

beforeEach(() => {
  vi.resetAllMocks();
});

describe("autenticazione endpoint prenotazioni (CA-01)", () => {
  it("restituisce 401 su ogni operazione protetta senza sessione", async () => {
    mocks.requireUser.mockRejectedValue(
      new mocks.MockAuthError(
        401,
        "NON_AUTENTICATO",
        "E' richiesta una sessione autenticata",
      ),
    );

    const calls = [
      () => collectionRoute.GET(request("http://localhost/api/prenotazioni")),
      () => collectionRoute.POST(request("http://localhost/api/prenotazioni", "POST", {})),
      () => detailRoute.GET(request("http://localhost/api/prenotazioni/x"), params),
      () => detailRoute.PATCH(request("http://localhost/api/prenotazioni/x", "PATCH", {}), params),
      () => detailRoute.DELETE(request("http://localhost/api/prenotazioni/x", "DELETE"), params),
      () => extensionRoute.GET(request("http://localhost/api/prenotazioni/x/estendi"), params),
      () => extensionRoute.POST(request("http://localhost/api/prenotazioni/x/estendi", "POST", {}), params),
      () => checkInRoute.POST(request("http://localhost/api/prenotazioni/x/check-in", "POST", {}), params),
      () => queueRoute.GET(),
      () => queueRoute.POST(request("http://localhost/api/prenotazioni/coda", "POST", {})),
      () => queueRoute.DELETE(request("http://localhost/api/prenotazioni/coda", "DELETE")),
    ];

    const responses = await Promise.all(calls.map((call) => call()));
    expect(responses.map((response) => response.status)).toEqual(
      Array(responses.length).fill(401),
    );
  });

  it.each(["GET", "PATCH", "DELETE"] as const)(
    "nasconde con 404 la risorsa di un altro studente su %s",
    async (method) => {
      mocks.requireUser.mockResolvedValue(studentA);
      mocks.prisma.prenotazione.findUnique.mockResolvedValue({
        id: "prenotazione-b",
        userId: "utente-b",
        stato: "CONFERMATA",
        postoId: "posto-1",
        posto: { numero: "A1" },
      });

      const response =
        method === "GET"
          ? await detailRoute.GET(request("http://localhost/api/prenotazioni/x"), params)
          : method === "PATCH"
            ? await detailRoute.PATCH(
                request("http://localhost/api/prenotazioni/x", "PATCH", {
                  azione: "cancella",
                }),
                params,
              )
            : await detailRoute.DELETE(
                request("http://localhost/api/prenotazioni/x", "DELETE"),
                params,
              );

      expect(response.status).toBe(404);
      expect(mocks.prisma.prenotazione.update).not.toHaveBeenCalled();
      expect(mocks.prisma.prenotazione.delete).not.toHaveBeenCalled();
    },
  );

  it("ignora userId del payload e crea per l'utente autenticato", async () => {
    mocks.requireUser.mockResolvedValue(studentA);
    mocks.creaPrenotazioneAtomica.mockResolvedValue({
      id: "prenotazione-a",
      userId: studentA.id,
      postoId: "posto-1",
      data: new Date("2030-01-15T00:00:00.000Z"),
      oraInizio: new Date("1970-01-01T09:00:00.000Z"),
      oraFine: new Date("1970-01-01T11:00:00.000Z"),
      stato: "CONFERMATA",
    });
    mocks.prisma.posto.findUnique.mockResolvedValue({ numero: "A1" });
    mocks.prisma.logEvento.create.mockResolvedValue({ id: "log-1" });
    mocks.prisma.notifica.create.mockResolvedValue({ id: "notifica-1" });

    const response = await collectionRoute.POST(
      request("http://localhost/api/prenotazioni", "POST", {
        userId: "utente-b",
        postoId: "posto-1",
        data: "2030-01-15",
        oraInizio: "09:00",
        oraFine: "11:00",
      }),
    );

    expect(response.status).toBe(201);
    expect(mocks.creaPrenotazioneAtomica).toHaveBeenCalledWith(
      expect.objectContaining({ userId: studentA.id }),
      mocks.prisma,
    );
  });

  it("rifiuta con 403 uno studente su una rotta admin", async () => {
    mocks.auth.mockResolvedValue({ user: studentA });
    const response = await adminStatisticsRoute.GET(
      request("http://localhost/api/admin/statistiche?tipo=tasso-noshow"),
    );
    expect(response.status).toBe(403);
  });
});
