/**
 * Test di collegamento del rate limiting su
 * `POST /api/admin/utenti/[id]/notifica` (invio di una notifica/sollecito a
 * un utente da parte dello staff).
 *
 * PERCHE': la route era una delle scritture critiche rimaste senza alcun
 * limitatore (trovata con `grep -L "RateLimiter("` sulle route POST/PATCH/
 * DELETE). Senza limite, un account BIBLIOTECARIO/ADMIN compromesso (o uno
 * script che ne riusi la sessione) poteva inondare di notifiche la casella di
 * uno studente, con una riga di `LogEvento` per ogni invio. E' un'azione
 * dello STAFF: usa `staffCriticalApiRateLimiter` come le altre route admin.
 *
 * Questo file blinda il collegamento, non la logica del limitatore (gia'
 * coperta da rate-limit-modi.test.ts): qui `@/lib/rate-limit` e' mockato.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  staffCriticalApiRateLimiter: vi.fn(),
  prisma: {
    user: { findUnique: vi.fn() },
    notifica: { create: vi.fn() },
    logEvento: { create: vi.fn() },
  },
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/prisma", () => ({ default: mocks.prisma }));
vi.mock("@/lib/rate-limit", () => ({
  staffCriticalApiRateLimiter: mocks.staffCriticalApiRateLimiter,
}));

const staff = { id: "staff-notif-rl-1", ruolo: "ADMIN" as const };
const destinatario = { id: "studente-notif-rl-1", nome: "Mario", cognome: "Rossi" };

function request(body: unknown) {
  return new NextRequest(
    `http://localhost/api/admin/utenti/${destinatario.id}/notifica`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}
const params = { params: Promise.resolve({ id: destinatario.id }) };

const corpoValido = {
  tipo: "SISTEMA",
  titolo: "Sollecito",
  messaggio: "Ricordati di restituire il libro.",
  actionUrl: "/prestiti",
  actionLabel: "Vedi prestiti",
};

/** Asserzione comune: nessuna lettura del destinatario, nessuna scrittura. */
function expectNessunaScrittura() {
  expect(mocks.prisma.user.findUnique).not.toHaveBeenCalled();
  expect(mocks.prisma.notifica.create).not.toHaveBeenCalled();
  expect(mocks.prisma.logEvento.create).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ user: staff });
  // `null` = "consentito" nel contratto dei rate limiter (vedi rate-limit.ts).
  mocks.staffCriticalApiRateLimiter.mockResolvedValue(null);
  mocks.prisma.user.findUnique.mockResolvedValue(destinatario);
  mocks.prisma.notifica.create.mockResolvedValue({ id: "notifica-notif-rl-1" });
  mocks.prisma.logEvento.create.mockResolvedValue({ id: "log-notif-rl-1" });
});

describe("POST /api/admin/utenti/[id]/notifica · rate limiting", () => {
  it("[TC-RL-NOTIF-001] limite superato: 429 del limitatore, nessuna notifica e nessun log", async () => {
    const { POST } = await import("@/app/api/admin/utenti/[id]/notifica/route");
    mocks.staffCriticalApiRateLimiter.mockResolvedValue(
      new Response(null, { status: 429 }),
    );

    const response = await POST(request(corpoValido), params);

    expect(response.status).toBe(429);
    // Il limite scatta DOPO auth() ma PRIMA di leggere il destinatario e di
    // creare notifica/log.
    expect(mocks.auth).toHaveBeenCalledTimes(1);
    expectNessunaScrittura();
  });

  it("[TC-RL-NOTIF-002] limite libero: l'invio procede normalmente (200), limitatore invocato dopo l'autorizzazione", async () => {
    const { POST } = await import("@/app/api/admin/utenti/[id]/notifica/route");

    const response = await POST(request(corpoValido), params);

    expect(response.status).toBe(200);
    expect(mocks.staffCriticalApiRateLimiter).toHaveBeenCalledTimes(1);
    // Ordine: sessione/ruolo PRIMA, limitatore DOPO.
    expect(mocks.auth.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.staffCriticalApiRateLimiter.mock.invocationCallOrder[0],
    );
    expect(mocks.prisma.notifica.create).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.logEvento.create).toHaveBeenCalledTimes(1);
  });

  it("[TC-RL-NOTIF-003] la chiave del limitatore e' l'account staff, non l'IP", async () => {
    // PERCHE': piu' membri dello staff sulla stessa rete della biblioteca non
    // devono dividersi un'unica quota; il limite protegge dall'abuso di UN
    // account, quindi il contatore va per account.
    const { POST } = await import("@/app/api/admin/utenti/[id]/notifica/route");

    await POST(request(corpoValido), params);

    expect(mocks.staffCriticalApiRateLimiter).toHaveBeenCalledWith(
      expect.anything(),
      "verifica-e-conta",
      staff.id,
    );
  });

  it("[TC-RL-NOTIF-004] anonimo (401) e studente (403): il limitatore non viene nemmeno raggiunto", async () => {
    const { POST } = await import("@/app/api/admin/utenti/[id]/notifica/route");

    mocks.auth.mockResolvedValueOnce(null);
    const anonimo = await POST(request(corpoValido), params);

    mocks.auth.mockResolvedValueOnce({
      user: { id: "studente-notif-rl-2", ruolo: "STUDENTE" },
    });
    const studente = await POST(request(corpoValido), params);

    expect(anonimo.status).toBe(401);
    expect(studente.status).toBe(403);
    expect(mocks.staffCriticalApiRateLimiter).not.toHaveBeenCalled();
    expectNessunaScrittura();
  });
});
