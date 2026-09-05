/**
 * Test di sicurezza per `POST /api/prenotazioni/[id]/check-in` (finding M-2).
 *
 * COSA verifica: un `timestamp` fasullo nel body NON influenza:
 *  - il controllo della finestra "troppo presto / scaduto";
 *  - il valore persistito in `checkInAt`.
 * In entrambi i casi il server usa SEMPRE il proprio orologio (`new Date()`).
 *
 * PERCHÉ: prima `new Date(timestamp ?? Date.now())` permetteva a un client di
 * forzare un check-in fuori orario e di falsare l'istante registrato.
 *
 * L'orologio del server è congelato con i fake timers di vitest.
 */
import { NextRequest } from "next/server";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

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
  return {
    MockAuthError,
    requireUser: vi.fn(),
    assertOwnership: vi.fn(),
    prisma: {
      prenotazione: { findUnique: vi.fn(), update: vi.fn() },
      posto: { update: vi.fn() },
    },
  };
});

vi.mock("@/lib/auth", () => ({
  AuthError: mocks.MockAuthError,
  requireUser: mocks.requireUser,
  assertOwnership: mocks.assertOwnership,
}));
vi.mock("@/lib/prisma", () => ({ default: mocks.prisma, prisma: mocks.prisma }));

type Route = typeof import("@/app/api/prenotazioni/[id]/check-in/route");
let route: Route;

const user = { id: "studente-1", ruolo: "STUDENTE" as const };

// Prenotazione con slot 09:00–11:00 del 2030-06-15 (Date @db.Date / @db.Time).
const prenotazione = {
  id: "pren-1",
  userId: user.id,
  postoId: "posto-1",
  data: new Date("2030-06-15T00:00:00.000Z"),
  oraInizio: new Date("1970-01-01T09:00:00.000Z"),
  oraFine: new Date("1970-01-01T11:00:00.000Z"),
  stato: "CONFERMATA",
  user,
  posto: { id: "posto-1", numero: "A1", sala: { nome: "Sala", piano: 1 } },
};

function request(body: unknown) {
  return new NextRequest("http://localhost/api/prenotazioni/pren-1/check-in", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
const params = { params: Promise.resolve({ id: "pren-1" }) };

beforeAll(async () => {
  route = await import("@/app/api/prenotazioni/[id]/check-in/route");
});

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireUser.mockResolvedValue(user);
  mocks.prisma.prenotazione.findUnique.mockResolvedValue(prenotazione);
  mocks.prisma.prenotazione.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    ...prenotazione,
    ...data,
    posto: prenotazione.posto,
  }));
  mocks.prisma.posto.update.mockResolvedValue({ ...prenotazione.posto, stato: "OCCUPATO" });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("M-2 · il check-in usa il tempo del server, non del client", () => {
  it("[TC-M2-001] timestamp client nel passato (fuori finestra) viene ignorato: check-in OK con checkInAt = ora server", async () => {
    // Ora server: 08:50Z del 2030-06-15 → dentro la finestra [08:45, 09:00].
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2030-06-15T08:50:00.000Z"));

    // timestamp client palesemente falso: se fosse usato ⇒ "troppo presto" (400).
    const response = await route.POST(
      request({ timestamp: "2020-01-01T00:00:00.000Z" }),
      params,
    );

    expect(response.status).toBe(200);
    expect(mocks.prisma.prenotazione.update).toHaveBeenCalledTimes(1);
    const arg = mocks.prisma.prenotazione.update.mock.calls[0][0] as {
      data: { stato: string; checkInAt: Date };
    };
    expect(arg.data.stato).toBe("CHECK_IN");
    expect(arg.data.checkInAt).toBeInstanceOf(Date);
    expect(arg.data.checkInAt.toISOString()).toBe("2030-06-15T08:50:00.000Z");
  });

  it("[TC-M2-002] timestamp client nel futuro (slot scaduto) viene ignorato: check-in comunque OK", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2030-06-15T08:50:00.000Z"));

    // Se usato, "2030-06-15T09:30Z" ⇒ periodo scaduto (400).
    const response = await route.POST(
      request({ timestamp: "2030-06-15T09:30:00.000Z" }),
      params,
    );

    expect(response.status).toBe(200);
    const arg = mocks.prisma.prenotazione.update.mock.calls[0][0] as {
      data: { checkInAt: Date };
    };
    expect(arg.data.checkInAt.toISOString()).toBe("2030-06-15T08:50:00.000Z");
  });

  it("[TC-M2-003] la finestra resta applicata sull'ora del server: ora server troppo presto ⇒ 400 anche con timestamp client 'valido'", async () => {
    // Ora server: 08:30Z → PRIMA dell'apertura (08:45). Il client prova a
    // barare con un timestamp dentro la finestra: deve comunque fallire.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2030-06-15T08:30:00.000Z"));

    const response = await route.POST(
      request({ timestamp: "2030-06-15T08:50:00.000Z" }),
      params,
    );

    expect(response.status).toBe(400);
    expect(mocks.prisma.prenotazione.update).not.toHaveBeenCalled();
  });
});
