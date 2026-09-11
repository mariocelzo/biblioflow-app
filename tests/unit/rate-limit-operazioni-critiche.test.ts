/**
 * Test end-to-end del rate limiting sulle operazioni critiche.
 *
 * COSA: verifica che `criticalApiRateLimiter` / `staffCriticalApiRateLimiter`
 * scattino DAVVERO quando collegati alle route reali (non solo che la
 * funzione `createRateLimiter` funzioni in isolamento: quello è già coperto
 * da `rate-limit-modi.test.ts`).
 *
 * PERCHÉ: prima di questa remediation `criticalApiRateLimiter` e
 * `staffCriticalApiRateLimiter` (quest'ultimo introdotto qui) erano dichiarati
 * in `src/lib/rate-limit.ts` ma non collegati a nessuna route: le operazioni
 * di modifica/cancellazione (admin e utente) non avevano alcun limite. Questi
 * test chiamano gli handler reali, SENZA mockare `@/lib/rate-limit`, e
 * dimostrano che oltre la soglia dichiarata la route risponde 429 invece di
 * eseguire l'operazione.
 *
 * NOTA SUI CORPI DELLE RICHIESTE: ogni test invia deliberatamente un corpo che
 * fa fallire la validazione applicativa (400/404/422) PRIMA di toccare il
 * database. Lo scopo qui non è testare la logica di dominio (già coperta
 * altrove) ma isolare il comportamento del rate limiter: le prime N richieste
 * devono restituire l'esito applicativo atteso, la (N+1)-esima deve essere
 * bloccata dal limitatore con 429 — a prescindere dal corpo inviato, perché il
 * controllo avviene PRIMA della logica di dominio.
 *
 * NOTA SU IP E CHIAVE DEL CONTATORE: la chiave è `${ip}:${pathname}`. Ogni
 * test usa un IP dedicato (via `x-forwarded-for`) così i contatori restano
 * isolati fra un test e l'altro anche se condividono lo stesso file (e quindi
 * la stessa `rateLimitStore` in memoria per tutta la sua durata).
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
  class MockPrenotazioneError extends Error {
    status = 400;
    toResponseBody() {
      return { error: this.message };
    }
  }
  return {
    MockAuthError,
    MockPrenotazioneError,
    auth: vi.fn(),
    requireUser: vi.fn(),
    assertOwnership: vi.fn(),
    prisma: {
      prenotazione: { findUnique: vi.fn() },
    },
  };
});

// Auth: le route admin usano `auth()`, quelle utente `requireUser()` +
// `assertOwnership()`. Un solo mock condiviso copre entrambe le famiglie.
vi.mock("@/lib/auth", () => ({
  auth: mocks.auth,
  requireUser: mocks.requireUser,
  assertOwnership: mocks.assertOwnership,
  AuthError: mocks.MockAuthError,
}));

// Prisma: alcune route importano il default export (`db`/`prisma`), altre il
// named export (`{ prisma }`). Stesso oggetto per entrambi, come nelle altre
// suite che esercitano queste route.
vi.mock("@/lib/prisma", () => ({ default: mocks.prisma, prisma: mocks.prisma }));

// `prenotazioni/coda/route.ts` importa questi moduli, ma il percorso di
// validazione che questi test esercitano (corpo incompleto -> 422) ritorna
// PRIMA di chiamarli: bastano stub inerti per soddisfare l'import.
vi.mock("@/lib/automation-service", () => ({
  notificaEventoCoda: vi.fn(),
}));
vi.mock("@/lib/prenotazioni-service", () => ({
  annullaRichiestaCoda: vi.fn(),
  entraInCoda: vi.fn(),
  posizioneInCoda: vi.fn(),
  validaPostoPrenotabile: vi.fn(),
  PrenotazioneError: mocks.MockPrenotazioneError,
}));

// IMPORTANTE: qui NON si mocka "@/lib/rate-limit". Questi test devono
// esercitare l'implementazione vera per dimostrare che il 429 scatta.

type AdminPostiRoute = typeof import("@/app/api/admin/posti/[id]/route");
type AdminRichiesteRoute = typeof import("@/app/api/admin/richieste/route");
type AdminPrenotazioniRoute = typeof import("@/app/api/admin/prenotazioni/route");
type AdminPrestitiRoute = typeof import("@/app/api/admin/prestiti/route");
type AdminUtentiRoute = typeof import("@/app/api/admin/utenti/[id]/route");
type PrenotazioniIdRoute = typeof import("@/app/api/prenotazioni/[id]/route");
type PrenotazioniCodaRoute = typeof import("@/app/api/prenotazioni/coda/route");

let adminPosti: AdminPostiRoute;
let adminRichieste: AdminRichiesteRoute;
let adminPrenotazioni: AdminPrenotazioniRoute;
let adminPrestiti: AdminPrestitiRoute;
let adminUtenti: AdminUtentiRoute;
let prenotazioniId: PrenotazioniIdRoute;
let prenotazioniCoda: PrenotazioniCodaRoute;

const staff = { id: "staff-1", email: "staff@biblioflow.test", ruolo: "ADMIN" as const };
const studente = { id: "studente-1", ruolo: "STUDENTE" as const };

/** Costruisce una richiesta con un IP dedicato, per isolare il contatore. */
function richiesta(
  ip: string,
  url: string,
  init: { method: string; body?: unknown } = { method: "GET" },
): NextRequest {
  const headers: Record<string, string> = { "x-forwarded-for": ip };
  let body: string | undefined;
  if (init.body !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(init.body);
  }
  return new NextRequest(`http://localhost${url}`, {
    method: init.method,
    headers,
    body,
  });
}

beforeEach(async () => {
  vi.resetAllMocks();
  adminPosti = await import("@/app/api/admin/posti/[id]/route");
  adminRichieste = await import("@/app/api/admin/richieste/route");
  adminPrenotazioni = await import("@/app/api/admin/prenotazioni/route");
  adminPrestiti = await import("@/app/api/admin/prestiti/route");
  adminUtenti = await import("@/app/api/admin/utenti/[id]/route");
  prenotazioniId = await import("@/app/api/prenotazioni/[id]/route");
  prenotazioniCoda = await import("@/app/api/prenotazioni/coda/route");

  mocks.auth.mockResolvedValue({ user: staff });
  mocks.requireUser.mockResolvedValue(studente);
  mocks.prisma.prenotazione.findUnique.mockResolvedValue(null);
});

describe("staffCriticalApiRateLimiter collegato alle route admin (soglia 60/min)", () => {
  it("[TC-RL-CRIT-001] PATCH /api/admin/posti/[id]: consente 60 richieste e blocca la 61esima", async () => {
    const ip = "10.20.0.1";
    const params = { params: Promise.resolve({ id: "posto-1" }) };

    for (let i = 0; i < 60; i += 1) {
      const res = await adminPosti.PATCH(
        richiesta(ip, "/api/admin/posti/posto-1", {
          method: "PATCH",
          body: { stato: "STATO_INESISTENTE" },
        }),
        params,
      );
      // Validazione applicativa (stato non tra quelli ammessi): 400, non 429.
      expect(res.status).toBe(400);
    }

    const bloccata = await adminPosti.PATCH(
      richiesta(ip, "/api/admin/posti/posto-1", {
        method: "PATCH",
        body: { stato: "STATO_INESISTENTE" },
      }),
      params,
    );
    expect(bloccata.status).toBe(429);
  });

  it("[TC-RL-CRIT-002] PATCH /api/admin/richieste: consente 60 richieste e blocca la 61esima", async () => {
    const ip = "10.20.0.2";

    for (let i = 0; i < 60; i += 1) {
      const res = await adminRichieste.PATCH(
        richiesta(ip, "/api/admin/richieste", { method: "PATCH", body: {} }),
      );
      // Corpo incompleto (manca id/stato): 400, non 429.
      expect(res.status).toBe(400);
    }

    const bloccata = await adminRichieste.PATCH(
      richiesta(ip, "/api/admin/richieste", { method: "PATCH", body: {} }),
    );
    expect(bloccata.status).toBe(429);
  });

  it("[TC-RL-CRIT-003] POST /api/admin/prenotazioni: consente 60 richieste e blocca la 61esima", async () => {
    const ip = "10.20.0.3";

    for (let i = 0; i < 60; i += 1) {
      const res = await adminPrenotazioni.POST(
        richiesta(ip, "/api/admin/prenotazioni", {
          method: "POST",
          body: { azione: "AZIONE_INESISTENTE" },
        }),
      );
      // Azione non riconosciuta: 400, non 429.
      expect(res.status).toBe(400);
    }

    const bloccata = await adminPrenotazioni.POST(
      richiesta(ip, "/api/admin/prenotazioni", {
        method: "POST",
        body: { azione: "AZIONE_INESISTENTE" },
      }),
    );
    expect(bloccata.status).toBe(429);
  });

  it("[TC-RL-CRIT-004] POST /api/admin/prestiti: consente 60 richieste e blocca la 61esima", async () => {
    const ip = "10.20.0.4";

    for (let i = 0; i < 60; i += 1) {
      const res = await adminPrestiti.POST(
        richiesta(ip, "/api/admin/prestiti", {
          method: "POST",
          body: { azione: "AZIONE_INESISTENTE" },
        }),
      );
      expect(res.status).toBe(400);
    }

    const bloccata = await adminPrestiti.POST(
      richiesta(ip, "/api/admin/prestiti", {
        method: "POST",
        body: { azione: "AZIONE_INESISTENTE" },
      }),
    );
    expect(bloccata.status).toBe(429);
  });

  it("[TC-RL-CRIT-005] PATCH /api/admin/utenti/[id]: consente 60 richieste e blocca la 61esima", async () => {
    const ip = "10.20.0.5";
    const params = { params: Promise.resolve({ id: "utente-1" }) };

    for (let i = 0; i < 60; i += 1) {
      const res = await adminUtenti.PATCH(
        richiesta(ip, "/api/admin/utenti/utente-1", { method: "PATCH", body: {} }),
        params,
      );
      // `attivo` mancante/non booleano: 422, non 429.
      expect(res.status).toBe(422);
    }

    const bloccata = await adminUtenti.PATCH(
      richiesta(ip, "/api/admin/utenti/utente-1", { method: "PATCH", body: {} }),
      params,
    );
    expect(bloccata.status).toBe(429);
  });
});

describe("criticalApiRateLimiter collegato alle route utente (soglia 10/min)", () => {
  it("[TC-RL-CRIT-006] PATCH /api/prenotazioni/[id]: consente 10 richieste e blocca l'11esima", async () => {
    const ip = "10.20.0.6";
    const params = { params: Promise.resolve({ id: "pren-1" }) };

    for (let i = 0; i < 10; i += 1) {
      const res = await prenotazioniId.PATCH(
        richiesta(ip, "/api/prenotazioni/pren-1", {
          method: "PATCH",
          body: { azione: "check-in" },
        }),
        params,
      );
      // Prenotazione inesistente (mock restituisce null): 404, non 429.
      expect(res.status).toBe(404);
    }

    const bloccata = await prenotazioniId.PATCH(
      richiesta(ip, "/api/prenotazioni/pren-1", {
        method: "PATCH",
        body: { azione: "check-in" },
      }),
      params,
    );
    expect(bloccata.status).toBe(429);
  });

  it("[TC-RL-CRIT-007] DELETE /api/prenotazioni/[id]: consente 10 richieste e blocca l'11esima", async () => {
    const ip = "10.20.0.7";
    const params = { params: Promise.resolve({ id: "pren-2" }) };

    for (let i = 0; i < 10; i += 1) {
      const res = await prenotazioniId.DELETE(
        richiesta(ip, "/api/prenotazioni/pren-2", { method: "DELETE" }),
        params,
      );
      expect(res.status).toBe(404);
    }

    const bloccata = await prenotazioniId.DELETE(
      richiesta(ip, "/api/prenotazioni/pren-2", { method: "DELETE" }),
      params,
    );
    expect(bloccata.status).toBe(429);
  });

  it("[TC-RL-CRIT-008] POST /api/prenotazioni/coda: consente 10 richieste e blocca l'11esima", async () => {
    const ip = "10.20.0.8";

    for (let i = 0; i < 10; i += 1) {
      const res = await prenotazioniCoda.POST(
        richiesta(ip, "/api/prenotazioni/coda", { method: "POST", body: {} }),
      );
      // Campi obbligatori mancanti: 422, non 429.
      expect(res.status).toBe(422);
    }

    const bloccata = await prenotazioniCoda.POST(
      richiesta(ip, "/api/prenotazioni/coda", { method: "POST", body: {} }),
    );
    expect(bloccata.status).toBe(429);
  });

  it("[TC-RL-CRIT-009] DELETE /api/prenotazioni/coda: consente 10 richieste e blocca l'11esima", async () => {
    const ip = "10.20.0.9";

    for (let i = 0; i < 10; i += 1) {
      const res = await prenotazioniCoda.DELETE(
        richiesta(ip, "/api/prenotazioni/coda", { method: "DELETE" }),
      );
      // Nessun id specificato (né in query né nel corpo): 422, non 429.
      expect(res.status).toBe(422);
    }

    const bloccata = await prenotazioniCoda.DELETE(
      richiesta(ip, "/api/prenotazioni/coda", { method: "DELETE" }),
    );
    expect(bloccata.status).toBe(429);
  });
});
