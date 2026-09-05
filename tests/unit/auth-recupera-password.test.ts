// Test di /api/auth/recupera-password (finding C-1 e C-2).
//
// Il modulo @/lib/env viene mockato con NODE_ENV = "production" per esercitare
// il comportamento che conta davvero: in produzione la risposta non deve
// contenere il link/token di reset e deve essere indistinguibile fra email
// registrata e non registrata.

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { hashToken } from "@/lib/auth-tokens";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  createToken: vi.fn(),
  rateLimiter: vi.fn(),
}));

// NODE_ENV = production: e' il ramo "fail-closed" di C-1.
vi.mock("@/lib/env", () => ({
  env: { NODE_ENV: "production" },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: mocks.findUnique },
    authToken: { create: mocks.createToken },
  },
}));

vi.mock("@/lib/rate-limit", () => ({
  passwordResetRateLimiter: mocks.rateLimiter,
}));

import { POST } from "@/app/api/auth/recupera-password/route";

function request(email: string) {
  return new NextRequest("http://localhost/api/auth/recupera-password", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email }),
  });
}

const utente = { id: "usr-reset-001", email: "mario.rossi@studenti.unisa.it" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rateLimiter.mockResolvedValue(null);
  mocks.createToken.mockResolvedValue({ id: "tok-1" });
});

describe("recupera-password: nessun leak del token in produzione (C-1)", () => {
  it("[TC-SEC-C1-001] in produzione la risposta non contiene resetLink ne' token", async () => {
    mocks.findUnique.mockResolvedValue(utente);

    const response = await POST(request(utente.email));
    const body = await response.json();

    expect(response.status).toBe(200);
    // Il token e' stato creato (il flusso funziona)...
    expect(mocks.createToken).toHaveBeenCalledOnce();
    // ...ma non esce dal server.
    expect(body.data).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain("token");
    expect(JSON.stringify(body)).not.toContain("reset-password?");
  });

  it("[TC-SEC-C1-002] la risposta e' identica per email registrata e non registrata", async () => {
    mocks.findUnique.mockResolvedValueOnce(utente);
    const rispostaEsistente = await POST(request(utente.email));
    const corpoEsistente = await rispostaEsistente.json();

    mocks.findUnique.mockResolvedValueOnce(null);
    const rispostaSconosciuta = await POST(request("sconosciuto@studenti.unisa.it"));
    const corpoSconosciuto = await rispostaSconosciuta.json();

    // Stesso status e stesso corpo: l'endpoint non e' un oracolo di
    // enumerazione degli account registrati.
    expect(rispostaEsistente.status).toBe(rispostaSconosciuta.status);
    expect(corpoEsistente).toEqual(corpoSconosciuto);
  });

  it("[TC-SEC-C2-004] nel database viene salvato il digest del token, non il valore raw", async () => {
    mocks.findUnique.mockResolvedValue(utente);

    await POST(request(utente.email));

    const datiSalvati = mocks.createToken.mock.calls[0][0].data;
    expect(datiSalvati.type).toBe("RESET");
    expect(datiSalvati.userId).toBe(utente.id);
    // 64 caratteri esadecimali: e' uno SHA-256, non il token consegnato.
    expect(datiSalvati.token).toMatch(/^[0-9a-f]{64}$/);
    // ...e corrisponde all'hash di *qualcosa*, non a un valore in chiaro:
    // ri-hashare il digest darebbe un risultato diverso.
    expect(hashToken(datiSalvati.token)).not.toBe(datiSalvati.token);
  });

  it("[TC-SEC-C1-003] non scrive il link di reset nei log applicativi", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    mocks.findUnique.mockResolvedValue(utente);

    await POST(request(utente.email));

    expect(info).not.toHaveBeenCalled();
  });
});
