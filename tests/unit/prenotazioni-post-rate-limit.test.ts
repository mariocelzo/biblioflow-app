/**
 * Test di collegamento del rate limiting su `POST /api/prenotazioni`
 * (creazione prenotazione).
 *
 * PERCHE': `bookingRateLimiter` (src/lib/rate-limit.ts) era dichiarato ma
 * importato da NESSUNA route: la creazione di una prenotazione non aveva
 * alcun limite di frequenza, a differenza di check-in/check-out/cancellazione
 * (che usano `criticalApiRateLimiter`). Questo file blinda il collegamento,
 * non la logica del limitatore stesso (già coperta da altri test: qui si
 * mocka `bookingRateLimiter`).
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  bookingRateLimiter: vi.fn(),
  readApiRateLimiter: vi.fn(),
  creaPrenotazioneAtomica: vi.fn(),
  prisma: {
    posto: { findUnique: vi.fn() },
    prenotazione: { findMany: vi.fn() },
    logEvento: { create: vi.fn() },
    notifica: { create: vi.fn() },
  },
}));

vi.mock("@/lib/auth", () => ({
  AuthError: class AuthError extends Error {
    constructor(
      public readonly status: number,
      public readonly code: string,
      message: string,
    ) {
      super(message);
      this.name = "AuthError";
    }
  },
  requireUser: mocks.requireUser,
}));
vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/prenotazioni-service", () => ({
  creaPrenotazioneAtomica: mocks.creaPrenotazioneAtomica,
  PrenotazioneError: class PrenotazioneError extends Error {},
}));
vi.mock("@/lib/rate-limit", () => ({
  bookingRateLimiter: mocks.bookingRateLimiter,
  readApiRateLimiter: mocks.readApiRateLimiter,
}));

const user = { id: "studente-1", ruolo: "STUDENTE" as const };

function request(body: unknown) {
  return new NextRequest("http://localhost/api/prenotazioni", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const corpoValido = {
  postoId: "posto-1",
  data: "2030-06-15",
  oraInizio: "09:00",
  oraFine: "11:00",
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireUser.mockResolvedValue(user);
  // `null` = "consentito" nel contratto dei rate limiter (vedi rate-limit.ts).
  mocks.bookingRateLimiter.mockResolvedValue(null);
  mocks.creaPrenotazioneAtomica.mockResolvedValue({
    id: "pren-1",
    postoId: "posto-1",
  });
  mocks.prisma.posto.findUnique.mockResolvedValue({ numero: "A1" });
  mocks.prisma.logEvento.create.mockResolvedValue({ id: "log-1" });
  mocks.prisma.notifica.create.mockResolvedValue({ id: "notifica-1" });
});

describe("POST /api/prenotazioni · rate limiting", () => {
  it("[TC-RL-BOOK-001] limite superato: 429 del limitatore, nessuna creazione", async () => {
    const { POST } = await import("@/app/api/prenotazioni/route");
    const rispostaLimite = new Response(null, { status: 429 });
    mocks.bookingRateLimiter.mockResolvedValue(rispostaLimite);

    const response = await POST(request(corpoValido));

    expect(response.status).toBe(429);
    // Il limite scatta DOPO requireUser() ma PRIMA della creazione: un
    // client che ha esaurito la quota non deve nemmeno arrivare al dominio.
    expect(mocks.requireUser).toHaveBeenCalledTimes(1);
    expect(mocks.creaPrenotazioneAtomica).not.toHaveBeenCalled();
  });

  it("[TC-RL-BOOK-002] limite libero: la creazione procede normalmente (201)", async () => {
    const { POST } = await import("@/app/api/prenotazioni/route");

    const response = await POST(request(corpoValido));

    expect(mocks.bookingRateLimiter).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(201);
    expect(mocks.creaPrenotazioneAtomica).toHaveBeenCalledTimes(1);
  });
});
