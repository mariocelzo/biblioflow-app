/**
 * Test di sicurezza per l'endpoint SSE della mappa posti (finding M-3).
 *
 * COSA verifica:
 *  - senza sessione valida `GET /api/sse/posti` risponde 401 e NON apre lo
 *    stream (`createSSEStream` non viene mai chiamato);
 *  - con sessione valida risponde 200 con gli header SSE attesi.
 *
 * PERCHÉ: prima della modifica l'handler non chiamava `auth()`, quindi
 * chiunque — anche anonimo — poteva restare in ascolto del broadcast del
 * canale pubblico `posti`.
 *
 * Solo `@/lib/auth` e `@/lib/sse-emitter` sono mockati: qui interessa il gate
 * di autenticazione, non il trasporto reale.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  // Replica minimale di `AuthError` (status + code) per far scattare il ramo 401.
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
    createSSEStream: vi.fn(() => new ReadableStream()),
  };
});

vi.mock("@/lib/auth", () => ({
  AuthError: mocks.MockAuthError,
  requireUser: mocks.requireUser,
}));

vi.mock("@/lib/sse-emitter", () => ({
  createSSEStream: mocks.createSSEStream,
}));

type SseRoute = typeof import("@/app/api/sse/posti/route");
let route: SseRoute;

beforeAll(async () => {
  route = await import("@/app/api/sse/posti/route");
});

beforeEach(() => {
  vi.resetAllMocks();
  mocks.createSSEStream.mockReturnValue(new ReadableStream());
});

describe("M-3 · GET /api/sse/posti richiede autenticazione", () => {
  it("[TC-M3-001] senza sessione risponde 401 e non apre lo stream", async () => {
    mocks.requireUser.mockRejectedValue(
      new mocks.MockAuthError(
        401,
        "NON_AUTENTICATO",
        "E' richiesta una sessione autenticata",
      ),
    );

    const response = await route.GET();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      code: "NON_AUTENTICATO",
    });
    // Il gate scatta PRIMA della creazione dello stream.
    expect(mocks.createSSEStream).not.toHaveBeenCalled();
  });

  it("[TC-M3-002] con sessione valida risponde 200 con gli header SSE", async () => {
    mocks.requireUser.mockResolvedValue({ id: "studente-1", ruolo: "STUDENTE" });

    const response = await route.GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/event-stream");
    expect(response.headers.get("cache-control")).toBe(
      "no-cache, no-store, must-revalidate",
    );
    expect(response.headers.get("x-accel-buffering")).toBe("no");
    expect(mocks.createSSEStream).toHaveBeenCalledWith("posti");
  });
});
