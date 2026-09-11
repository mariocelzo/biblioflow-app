/**
 * Test di integrita' dei dati per `DELETE /api/prenotazioni/[id]`.
 *
 * COSA verifica:
 *  - la cancellazione NON elimina i `LogEvento` collegati alla prenotazione;
 *  - la cancellazione e' "soft" (stato -> CANCELLATA) e non una hard-delete;
 *  - una prenotazione gia' conclusa non puo' essere riscritta come cancellata;
 *  - il posto viene liberato se era in CHECK_IN e l'evento viene tracciato.
 *
 * PERCHE': l'endpoint eseguiva `logEvento.deleteMany({ prenotazioneId })` prima
 * della `delete`. I LogEvento sono pero' la base su cui l'area amministrativa
 * conta i NO_SHOW (src/app/api/admin/utenti/[id]/route.ts e
 * src/app/api/admin/anomalie/route.ts): uno studente che accumulava assenze
 * poteva cancellare le proprie prenotazioni e azzerare le prove a proprio
 * carico. La hard-delete, inoltre, rendeva impossibile qualsiasi statistica
 * storica ed era gia' incoerente con la UI, che dopo una DELETE riuscita marca
 * la prenotazione come CANCELLATA e la mostra nello storico
 * (src/app/prenotazioni/page.tsx).
 */
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
  return {
    MockAuthError,
    requireUser: vi.fn(),
    assertOwnership: vi.fn(),
    prisma: {
      prenotazione: { findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
      posto: { update: vi.fn() },
      logEvento: { create: vi.fn(), deleteMany: vi.fn() },
    },
  };
});

vi.mock("@/lib/auth", () => ({
  AuthError: mocks.MockAuthError,
  requireUser: mocks.requireUser,
  assertOwnership: mocks.assertOwnership,
}));
vi.mock("@/lib/prisma", () => ({ default: mocks.prisma, prisma: mocks.prisma }));
// Il rate limiting sulle route critiche non è oggetto di questo file: viene
// mockato per non far scattare 429 con le ripetute chiamate a route.DELETE
// nei test qui sotto (stesso pattern di prestiti-stato-rinnovato.test.ts).
vi.mock("@/lib/rate-limit", () => ({
  criticalApiRateLimiter: vi.fn(async () => null),
}));

type Route = typeof import("@/app/api/prenotazioni/[id]/route");
let route: Route;

const user = { id: "studente-1", ruolo: "STUDENTE" as const };

function prenotazioneConStato(stato: string) {
  return {
    id: "pren-1",
    userId: user.id,
    postoId: "posto-1",
    data: new Date("2030-06-14T00:00:00.000Z"),
    oraInizio: new Date("1970-01-01T09:00:00.000Z"),
    oraFine: new Date("1970-01-01T11:00:00.000Z"),
    stato,
    posto: { id: "posto-1", numero: "A1" },
  };
}

function request() {
  return new NextRequest("http://localhost/api/prenotazioni/pren-1", { method: "DELETE" });
}
const params = { params: Promise.resolve({ id: "pren-1" }) };

beforeAll(async () => {
  route = await import("@/app/api/prenotazioni/[id]/route");
});

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireUser.mockResolvedValue(user);
  mocks.prisma.prenotazione.findUnique.mockResolvedValue(prenotazioneConStato("CONFERMATA"));
  mocks.prisma.prenotazione.update.mockImplementation(
    async ({ data }: { data: Record<string, unknown> }) => ({
      ...prenotazioneConStato("CONFERMATA"),
      ...data,
    }),
  );
  mocks.prisma.prenotazione.delete.mockResolvedValue(prenotazioneConStato("CONFERMATA"));
  mocks.prisma.posto.update.mockResolvedValue({ id: "posto-1", stato: "DISPONIBILE" });
  mocks.prisma.logEvento.create.mockResolvedValue({ id: "log-1" });
  mocks.prisma.logEvento.deleteMany.mockResolvedValue({ count: 0 });
});

describe("Integrita' dati - la cancellazione utente non distrugge l'audit trail", () => {
  it("[TC-INT-DEL-001] la DELETE non cancella i LogEvento della prenotazione", async () => {
    // Scenario del difetto: lo studente con NO_SHOW a carico cancella la
    // prenotazione e con essa le prove usate dall'area amministrativa.
    const response = await route.DELETE(request(), params);

    expect(response.status).toBe(200);
    expect(mocks.prisma.logEvento.deleteMany).not.toHaveBeenCalled();
  });

  it("[TC-INT-DEL-002] la DELETE e' un soft-delete: stato CANCELLATA, nessuna hard-delete", async () => {
    const response = await route.DELETE(request(), params);

    expect(response.status).toBe(200);
    expect(mocks.prisma.prenotazione.delete).not.toHaveBeenCalled();
    expect(mocks.prisma.prenotazione.update).toHaveBeenCalledTimes(1);
    const arg = mocks.prisma.prenotazione.update.mock.calls[0][0] as {
      where: { id: string };
      data: { stato: string };
    };
    expect(arg.where.id).toBe("pren-1");
    expect(arg.data.stato).toBe("CANCELLATA");
  });

  it("[TC-INT-DEL-003] la cancellazione traccia un evento PRENOTAZIONE_CANCELLATA", async () => {
    await route.DELETE(request(), params);

    expect(mocks.prisma.logEvento.create).toHaveBeenCalledTimes(1);
    const arg = mocks.prisma.logEvento.create.mock.calls[0][0] as {
      data: { tipo: string; prenotazioneId: string; userId: string };
    };
    expect(arg.data.tipo).toBe("PRENOTAZIONE_CANCELLATA");
    expect(arg.data.prenotazioneId).toBe("pren-1");
    expect(arg.data.userId).toBe(user.id);
  });

  it("[TC-INT-DEL-004] cancellando una prenotazione in CHECK_IN il posto torna DISPONIBILE", async () => {
    mocks.prisma.prenotazione.findUnique.mockResolvedValue(prenotazioneConStato("CHECK_IN"));

    const response = await route.DELETE(request(), params);

    expect(response.status).toBe(200);
    expect(mocks.prisma.posto.update).toHaveBeenCalledWith({
      where: { id: "posto-1" },
      data: { stato: "DISPONIBILE" },
    });
  });

  it("[TC-INT-DEL-005] una prenotazione gia' conclusa non puo' essere riscritta come cancellata", async () => {
    // Senza questo vincolo il soft-delete riscriverebbe la storia di una
    // prenotazione COMPLETATA, falsando le statistiche di frequenza.
    mocks.prisma.prenotazione.findUnique.mockResolvedValue(prenotazioneConStato("COMPLETATA"));

    const response = await route.DELETE(request(), params);

    expect(response.status).toBe(400);
    expect(mocks.prisma.prenotazione.update).not.toHaveBeenCalled();
    expect(mocks.prisma.prenotazione.delete).not.toHaveBeenCalled();
    expect(mocks.prisma.logEvento.deleteMany).not.toHaveBeenCalled();
  });
});
