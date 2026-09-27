/**
 * Test di collegamento del rate limiting su `POST /api/prenotazioni/[id]/estendi`
 * (estensione di una prenotazione esistente).
 *
 * PERCHE': la route era una delle scritture critiche rimaste senza alcun
 * limitatore (trovata con `grep -L "RateLimiter("` sulle route POST/PATCH/
 * DELETE), mentre le operazioni gemelle su una prenotazione propria
 * (check-in, check-out, cancellazione) usano gia' `criticalApiRateLimiter`.
 * Questo file blinda il collegamento, non la logica del limitatore stesso
 * (gia' coperta da rate-limit-modi.test.ts): qui `@/lib/rate-limit` e'
 * mockato.
 *
 * COSA SI VERIFICA:
 *  - il limitatore scatta DOPO `requireUser()` (mai prima: un anonimo non
 *    deve consumare quota) e un anonimo non lo raggiunge affatto;
 *  - con il limite superato la risposta e' il 429 del limitatore e NESSUNA
 *    scrittura parte (nessuna transazione, nessun update/log/notifica);
 *  - con il limite libero l'estensione procede normalmente;
 *  - la chiave del contatore e' l'utente autenticato, non l'IP.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
  // Client transazionale: sono le scritture che la route esegue DENTRO
  // `prisma.$transaction`. Tenerle qui permette di verificare che, a limite
  // superato, non ne parta nessuna.
  const tx = {
    prenotazione: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    logEvento: { create: vi.fn() },
    notifica: { create: vi.fn() },
  };
  return {
    MockAuthError,
    requireUser: vi.fn(),
    assertOwnership: vi.fn(),
    criticalApiRateLimiter: vi.fn(),
    validaPrenotazione: vi.fn(),
    tx,
    prisma: { $transaction: vi.fn() },
  };
});

vi.mock("@/lib/auth", () => ({
  AuthError: mocks.MockAuthError,
  requireUser: mocks.requireUser,
  assertOwnership: mocks.assertOwnership,
}));
vi.mock("@/lib/prisma", () => ({ default: mocks.prisma, prisma: mocks.prisma }));
// La validazione di dominio e' mockata: qui interessa solo il collegamento
// del limitatore (la validazione reale e' coperta da
// prenotazioni-estendi-orario-passato.test.ts).
vi.mock("@/lib/prenotazioni-service", () => ({
  isConflittoConcorrenza: vi.fn(() => false),
  PrenotazioneError: class PrenotazioneError extends Error {},
  validaPrenotazione: mocks.validaPrenotazione,
}));
vi.mock("@/lib/rate-limit", () => ({
  criticalApiRateLimiter: mocks.criticalApiRateLimiter,
}));

const user = { id: "studente-est-rl-1", ruolo: "STUDENTE" as const };

const prenotazione = {
  id: "pren-est-rl-1",
  userId: user.id,
  postoId: "posto-est-rl-1",
  data: new Date("2030-06-11T00:00:00.000Z"),
  oraInizio: new Date("1970-01-01T10:00:00.000Z"),
  oraFine: new Date("1970-01-01T13:00:00.000Z"),
  stato: "CHECK_IN",
  posto: { numero: "B12", sala: { nome: "Sala Studio" } },
};

function request(body: unknown) {
  return new NextRequest(
    "http://localhost/api/prenotazioni/pren-est-rl-1/estendi",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}
const params = { params: Promise.resolve({ id: prenotazione.id }) };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireUser.mockResolvedValue(user);
  // `null` = "consentito" nel contratto dei rate limiter (vedi rate-limit.ts).
  mocks.criticalApiRateLimiter.mockResolvedValue(null);
  mocks.validaPrenotazione.mockReturnValue({
    oraFineMinuti: 15 * 60,
    durataMinuti: 5 * 60,
  });
  mocks.tx.prenotazione.findUnique.mockResolvedValue(prenotazione);
  mocks.tx.prenotazione.findMany.mockResolvedValue([]);
  mocks.tx.prenotazione.update.mockResolvedValue({
    ...prenotazione,
    oraFine: new Date("1970-01-01T15:00:00.000Z"),
  });
  mocks.tx.logEvento.create.mockResolvedValue({ id: "log-est-rl-1" });
  mocks.tx.notifica.create.mockResolvedValue({ id: "notifica-est-rl-1" });
  // La transazione esegue davvero la callback della route sul client `tx`.
  mocks.prisma.$transaction.mockImplementation(
    async (callback: (tx: unknown) => Promise<unknown>) => callback(mocks.tx),
  );
});

describe("POST /api/prenotazioni/[id]/estendi · rate limiting", () => {
  it("[TC-RL-EST-001] limite superato: 429 del limitatore, nessuna scrittura", async () => {
    const { POST } = await import("@/app/api/prenotazioni/[id]/estendi/route");
    mocks.criticalApiRateLimiter.mockResolvedValue(
      new Response(null, { status: 429 }),
    );

    const response = await POST(request({ nuovaOraFine: "15:00" }), params);

    expect(response.status).toBe(429);
    // Il limite scatta DOPO requireUser() ma PRIMA di qualunque accesso al
    // DB: un client che ha esaurito la quota non apre nemmeno la
    // transazione Serializable, quindi nessun update/log/notifica.
    expect(mocks.requireUser).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
    expect(mocks.tx.prenotazione.update).not.toHaveBeenCalled();
    expect(mocks.tx.logEvento.create).not.toHaveBeenCalled();
    expect(mocks.tx.notifica.create).not.toHaveBeenCalled();
  });

  it("[TC-RL-EST-002] limite libero: l'estensione procede normalmente (200), limitatore invocato dopo l'autenticazione", async () => {
    const { POST } = await import("@/app/api/prenotazioni/[id]/estendi/route");

    const response = await POST(request({ nuovaOraFine: "15:00" }), params);

    expect(response.status).toBe(200);
    expect(mocks.criticalApiRateLimiter).toHaveBeenCalledTimes(1);
    // Ordine: autenticazione PRIMA, limitatore DOPO (un anonimo non deve
    // consumare quota).
    expect(mocks.requireUser.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.criticalApiRateLimiter.mock.invocationCallOrder[0],
    );
    expect(mocks.tx.prenotazione.update).toHaveBeenCalledTimes(1);
  });

  it("[TC-RL-EST-003] la chiave del limitatore e' l'utente autenticato, non l'IP", async () => {
    // PERCHE': con la chiave storica per IP, una rete universitaria dietro un
    // NAT di ateneo condividerebbe lo stesso contatore fra studenti diversi.
    // Passando `user.id` come terzo argomento (vedi `chiaveUtente` in
    // src/lib/rate-limit.ts) il contatore torna per-persona.
    const { POST } = await import("@/app/api/prenotazioni/[id]/estendi/route");

    await POST(request({ nuovaOraFine: "15:00" }), params);

    expect(mocks.criticalApiRateLimiter).toHaveBeenCalledWith(
      expect.anything(),
      "verifica-e-conta",
      user.id,
    );
  });

  it("[TC-RL-EST-004] anonimo: 401 dall'autenticazione, il limitatore non viene nemmeno raggiunto", async () => {
    const { POST } = await import("@/app/api/prenotazioni/[id]/estendi/route");
    mocks.requireUser.mockRejectedValue(
      new mocks.MockAuthError(401, "NON_AUTENTICATO", "Autenticazione richiesta"),
    );

    const response = await POST(request({ nuovaOraFine: "15:00" }), params);

    expect(response.status).toBe(401);
    expect(mocks.criticalApiRateLimiter).not.toHaveBeenCalled();
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });
});
