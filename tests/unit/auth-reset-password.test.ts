// Test di /api/auth/reset-password (finding M-7 e C-2).
//
// Coprono i tre buchi chiusi sull'endpoint:
// - la nuova password non veniva validata (si poteva aggirare la policy);
// - il token veniva cercato in chiaro (ora si cerca il digest);
// - restavano validi gli altri token di reset dello stesso utente.

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { hashToken } from "@/lib/auth-tokens";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  userUpdate: vi.fn(),
  tokenUpdate: vi.fn(),
  tokenUpdateMany: vi.fn(),
  transaction: vi.fn(),
  hashPassword: vi.fn(),
  rateLimiter: vi.fn(),
  validatePassword: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: mocks.transaction,
    user: { update: mocks.userUpdate },
    authToken: {
      findUnique: mocks.findUnique,
      update: mocks.tokenUpdate,
      updateMany: mocks.tokenUpdateMany,
    },
  },
}));

// validatePassword resta l'implementazione reale ma passa da una spia, cosi'
// si puo' verificare che l'endpoint la invochi davvero (l'implementazione e'
// reinstallata nel beforeEach perche' la config vitest azzera i mock).
vi.mock("@/lib/password", async (importOriginal) => {
  const originale = await importOriginal<typeof import("@/lib/password")>();
  return {
    ...originale,
    hashPassword: mocks.hashPassword,
    validatePassword: mocks.validatePassword,
  };
});

vi.mock("@/lib/rate-limit", () => ({
  passwordResetRateLimiter: mocks.rateLimiter,
}));

import { POST } from "@/app/api/auth/reset-password/route";

const RAW_TOKEN = "a".repeat(64);
const USER_ID = "usr-reset-002";

function request(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/auth/reset-password", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function tokenValido() {
  return {
    id: "tok-reset-1",
    userId: USER_ID,
    type: "RESET",
    used: false,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  };
}

beforeEach(async () => {
  vi.clearAllMocks();
  const passwordReale = await vi.importActual<typeof import("@/lib/password")>(
    "@/lib/password",
  );
  mocks.validatePassword.mockImplementation(passwordReale.validatePassword);
  mocks.rateLimiter.mockResolvedValue(null);
  mocks.hashPassword.mockResolvedValue("$2a$12$hash-nuovo");
  mocks.transaction.mockResolvedValue([]);
  mocks.findUnique.mockResolvedValue(tokenValido());
});

describe("reset-password: policy password e invalidazione token (M-7)", () => {
  it("[TC-SEC-M7-001] rifiuta con 422 una password debole invocando validatePassword", async () => {
    const response = await POST(
      request({ userId: USER_ID, token: RAW_TOKEN, newPassword: "debole" }),
    );
    const body = await response.json();

    expect(mocks.validatePassword).toHaveBeenCalledWith("debole");
    expect(response.status).toBe(422);
    expect(body.success).toBe(false);
    // L'elenco degli errori aiuta l'utente a correggere (trasparenza HCI).
    expect(body.details.password.length).toBeGreaterThan(0);
    // Nessuna scrittura: la password non e' stata cambiata.
    expect(mocks.hashPassword).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("[TC-SEC-C2-005] cerca il token per digest e non per valore in chiaro", async () => {
    await POST(request({ userId: USER_ID, token: RAW_TOKEN, newPassword: "PasswordSicura1" }));

    expect(mocks.findUnique).toHaveBeenCalledWith({
      where: { token: hashToken(RAW_TOKEN) },
    });
  });

  it("[TC-SEC-M7-002] consuma il token e invalida gli altri RESET aperti in transazione", async () => {
    const response = await POST(
      request({ userId: USER_ID, token: RAW_TOKEN, newPassword: "PasswordSicura1" }),
    );

    expect(response.status).toBe(200);
    // Le tre operazioni sono state passate a $transaction insieme.
    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(mocks.transaction.mock.calls[0][0]).toHaveLength(3);

    expect(mocks.userUpdate).toHaveBeenCalledWith({
      where: { id: USER_ID },
      data: { passwordHash: "$2a$12$hash-nuovo" },
    });
    expect(mocks.tokenUpdate).toHaveBeenCalledWith({
      where: { id: "tok-reset-1" },
      data: { used: true },
    });
    expect(mocks.tokenUpdateMany).toHaveBeenCalledWith({
      where: { userId: USER_ID, type: "RESET", used: false, id: { not: "tok-reset-1" } },
      data: { used: true },
    });
  });

  it("[TC-SEC-M7-003] applica il rate limiter prima di toccare il database", async () => {
    mocks.rateLimiter.mockResolvedValue(
      new Response(JSON.stringify({ error: "Troppi tentativi" }), { status: 429 }),
    );

    const response = await POST(
      request({ userId: USER_ID, token: RAW_TOKEN, newPassword: "PasswordSicura1" }),
    );

    expect(response.status).toBe(429);
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });
});
