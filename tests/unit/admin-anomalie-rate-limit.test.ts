/**
 * Test di collegamento del rate limiting su `POST /api/admin/anomalie`
 * (azioni batch dello staff su anomalie, prenotazioni e prestiti).
 *
 * PERCHE': la route era una delle scritture critiche rimaste senza alcun
 * limitatore (trovata con `grep -L "RateLimiter("` sulle route POST/PATCH/
 * DELETE). Ogni sua azione agisce IN BLOCCO — annulla le prenotazioni senza
 * check-in, notifica tutti gli utenti con prestiti scaduti o TUTTI gli utenti
 * attivi (`INVIA_ALERT_BROADCAST`) — quindi una chiamata ripetuta a raffica
 * moltiplica l'effetto su tutta l'utenza. E' un'azione dello STAFF: usa
 * `staffCriticalApiRateLimiter` come le altre route admin.
 *
 * NOTA: l'handler esporta `POST`, non `PATCH` (nel commento di
 * src/lib/rate-limit.ts era indicato come PATCH, corretto insieme a questo
 * collegamento).
 *
 * Questo file blinda il collegamento, non la logica del limitatore (gia'
 * coperta da rate-limit-modi.test.ts): qui `@/lib/rate-limit` e' mockato.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  releaseNoShowReservations: vi.fn(),
  staffCriticalApiRateLimiter: vi.fn(),
  prisma: {
    user: { findMany: vi.fn() },
    notifica: { create: vi.fn() },
    logEvento: { create: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    prestito: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/prisma", () => ({ default: mocks.prisma }));
// `ANNULLA_PRENOTAZIONI_SENZA_CHECKIN` delega a questa funzione di dominio:
// mockarla permette di verificare che l'annullamento in blocco non parta.
vi.mock("@/lib/automation-service", () => ({
  releaseNoShowReservations: mocks.releaseNoShowReservations,
}));
vi.mock("@/lib/rate-limit", () => ({
  staffCriticalApiRateLimiter: mocks.staffCriticalApiRateLimiter,
}));

const staff = { id: "staff-anom-rl-1", ruolo: "BIBLIOTECARIO" as const };

function request(body: unknown) {
  return new NextRequest("http://localhost/api/admin/anomalie", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Asserzione comune: nessuna azione batch eseguita, nessuna scrittura. */
function expectNessunaScrittura() {
  expect(mocks.releaseNoShowReservations).not.toHaveBeenCalled();
  expect(mocks.prisma.user.findMany).not.toHaveBeenCalled();
  expect(mocks.prisma.prestito.findMany).not.toHaveBeenCalled();
  expect(mocks.prisma.notifica.create).not.toHaveBeenCalled();
  expect(mocks.prisma.logEvento.create).not.toHaveBeenCalled();
  expect(mocks.prisma.logEvento.update).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ user: staff });
  // `null` = "consentito" nel contratto dei rate limiter (vedi rate-limit.ts).
  mocks.staffCriticalApiRateLimiter.mockResolvedValue(null);
  mocks.releaseNoShowReservations.mockResolvedValue({ released: 3 });
  mocks.prisma.user.findMany.mockResolvedValue([{ id: "u-1" }, { id: "u-2" }]);
  mocks.prisma.notifica.create.mockResolvedValue({ id: "notifica-anom-rl" });
  mocks.prisma.logEvento.create.mockResolvedValue({ id: "log-anom-rl" });
});

describe("POST /api/admin/anomalie · rate limiting", () => {
  it.each(["ANNULLA_PRENOTAZIONI_SENZA_CHECKIN", "INVIA_ALERT_BROADCAST"])(
    "[TC-RL-ANOM-001] limite superato su %s: 429 del limitatore, nessuna azione in blocco",
    async (azione) => {
      const { POST } = await import("@/app/api/admin/anomalie/route");
      mocks.staffCriticalApiRateLimiter.mockResolvedValue(
        new Response(null, { status: 429 }),
      );

      const response = await POST(request({ azione }));

      expect(response.status).toBe(429);
      // Il limite scatta DOPO auth() ma PRIMA dello switch sulle azioni:
      // nessun annullamento, nessuna notifica, nessun log OVERRIDE.
      expect(mocks.auth).toHaveBeenCalledTimes(1);
      expectNessunaScrittura();
    },
  );

  it("[TC-RL-ANOM-002] limite libero: l'azione procede normalmente (200), limitatore invocato dopo l'autorizzazione", async () => {
    const { POST } = await import("@/app/api/admin/anomalie/route");

    const response = await POST(
      request({ azione: "INVIA_ALERT_BROADCAST", titolo: "Avviso", messaggio: "Test" }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.count).toBe(2);
    expect(mocks.staffCriticalApiRateLimiter).toHaveBeenCalledTimes(1);
    // Ordine: sessione/ruolo PRIMA, limitatore DOPO.
    expect(mocks.auth.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.staffCriticalApiRateLimiter.mock.invocationCallOrder[0],
    );
    expect(mocks.prisma.notifica.create).toHaveBeenCalledTimes(2);
  });

  it("[TC-RL-ANOM-003] la chiave del limitatore e' l'account staff, non l'IP", async () => {
    // PERCHE': piu' membri dello staff sulla stessa rete della biblioteca non
    // devono dividersi un'unica quota; il limite protegge dall'abuso di UN
    // account, quindi il contatore va per account.
    const { POST } = await import("@/app/api/admin/anomalie/route");

    await POST(request({ azione: "ANNULLA_PRENOTAZIONI_SENZA_CHECKIN" }));

    expect(mocks.staffCriticalApiRateLimiter).toHaveBeenCalledWith(
      expect.anything(),
      "verifica-e-conta",
      staff.id,
    );
  });

  it("[TC-RL-ANOM-004] anonimo (401) e studente (403): il limitatore non viene nemmeno raggiunto", async () => {
    const { POST } = await import("@/app/api/admin/anomalie/route");

    mocks.auth.mockResolvedValueOnce(null);
    const anonimo = await POST(request({ azione: "INVIA_ALERT_BROADCAST" }));

    mocks.auth.mockResolvedValueOnce({
      user: { id: "studente-anom-rl-1", ruolo: "STUDENTE" },
    });
    const studente = await POST(request({ azione: "INVIA_ALERT_BROADCAST" }));

    expect(anonimo.status).toBe(401);
    expect(studente.status).toBe(403);
    expect(mocks.staffCriticalApiRateLimiter).not.toHaveBeenCalled();
    expectNessunaScrittura();
  });
});
