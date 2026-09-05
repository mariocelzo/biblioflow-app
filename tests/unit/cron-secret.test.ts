// Test della protezione di /api/cron/automations (finding A-2 e B-2).
//
// Prima c'era un fallback hardcoded ('dev-secret-change-in-production'): un
// deploy senza CRON_SECRET restava quindi apribile da chiunque conoscesse il
// repository. Ora l'endpoint e' fail-closed e il confronto e' a tempo costante.
//
// L'oggetto `env` mockato e' mutabile cosi' da poter esercitare sia il ramo
// produzione sia quello sviluppo nello stesso file.

import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  env: { CRON_SECRET: undefined as string | undefined, NODE_ENV: "production" as string },
  transaction: vi.fn(),
  runAllAutomations: vi.fn(),
}));

vi.mock("@/lib/env", () => ({ env: mocks.env }));
vi.mock("@/lib/prisma", () => ({ prisma: { $transaction: mocks.transaction } }));
vi.mock("@/lib/automation-service", () => ({
  runAllAutomations: mocks.runAllAutomations,
}));

import { GET } from "@/app/api/cron/automations/route";

function request(token?: string) {
  return new NextRequest("http://localhost/api/cron/automations", {
    headers: token ? { authorization: `Bearer ${token}` } : undefined,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  mocks.env.CRON_SECRET = undefined;
  mocks.env.NODE_ENV = "production";
  // Neutralizza un eventuale CRON_SECRET presente nell'ambiente di test:
  // la stringa vuota e' falsy, quindi il codice la tratta come "non configurato".
  vi.stubEnv("CRON_SECRET", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("cron automazioni: fail-closed senza secret (A-2)", () => {
  it("[TC-SEC-A2-001] in produzione senza CRON_SECRET risponde 500 e non esegue nulla", async () => {
    const response = await GET(request("qualsiasi-token"));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe("Cron non configurato");
    // Nessuna automazione eseguita: niente rilasci no-show o promozioni.
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.runAllAutomations).not.toHaveBeenCalled();
  });

  it("[TC-SEC-A2-002] in sviluppo senza CRON_SECRET nega l'accesso con 401", async () => {
    mocks.env.NODE_ENV = "development";

    const response = await GET(request("dev-secret-change-in-production"));

    // Il vecchio literal non apre piu' nulla.
    expect(response.status).toBe(401);
    expect(mocks.runAllAutomations).not.toHaveBeenCalled();
  });

  it("[TC-SEC-A2-003] rifiuta un token della stessa lunghezza ma diverso", async () => {
    mocks.env.CRON_SECRET = "0123456789abcdef";

    // Stessa lunghezza del secret: verifica il ramo timingSafeEqual vero e
    // proprio (con lunghezze diverse si esce prima, senza chiamarlo).
    const response = await GET(request("0123456789abcdee"));

    expect(response.status).toBe(401);
    expect(mocks.runAllAutomations).not.toHaveBeenCalled();
  });

  it("[TC-SEC-A2-004] rifiuta una richiesta priva di header Authorization", async () => {
    mocks.env.CRON_SECRET = "0123456789abcdef";

    const response = await GET(request());

    expect(response.status).toBe(401);
  });
});

describe("cron automazioni: nessun dettaglio interno negli errori (B-2)", () => {
  it("[TC-SEC-B2-001] il 500 non espone il messaggio dell'eccezione", async () => {
    mocks.env.CRON_SECRET = "0123456789abcdef";
    mocks.transaction.mockRejectedValue(
      new Error('relation "Prenotazione" does not exist su db-interno:5432'),
    );

    const response = await GET(request("0123456789abcdef"));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe("Errore durante l'esecuzione delle automazioni");
    // Il dettaglio resta nei log, non nella risposta HTTP.
    expect(body.message).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain("db-interno");
    // Il runId permette comunque di correlare con i log.
    expect(body.runId).toEqual(expect.any(String));
  });
});
