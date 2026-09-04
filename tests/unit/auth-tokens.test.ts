// Test delle utility per i token monouso di autenticazione (finding C-2).
//
// Verificano le due proprieta' su cui si regge tutto il flusso:
// - il token generato e' casuale e abbastanza lungo (non predicibile);
// - l'hash e' deterministico, altrimenti la lookup per uguaglianza usata da
//   /api/auth/reset-password e /api/auth/verify non troverebbe mai il token.

import crypto from "node:crypto";
import { describe, expect, it } from "vitest";

import { generateRawToken, hashToken } from "@/lib/auth-tokens";

describe("auth-tokens: generazione e hashing dei token monouso (C-2)", () => {
  it("[TC-SEC-C2-001] hashToken e' deterministico e restituisce uno SHA-256 esadecimale", () => {
    const raw = "token-di-prova";

    const primo = hashToken(raw);
    const secondo = hashToken(raw);

    // Determinismo: due chiamate sullo stesso input danno lo stesso digest,
    // presupposto della ricerca `where: { token: hashToken(raw) }`.
    expect(primo).toBe(secondo);

    // 64 caratteri esadecimali = SHA-256, e ci sta nella colonna
    // AuthToken.token (String @unique).
    expect(primo).toMatch(/^[0-9a-f]{64}$/);
    expect(primo).toBe(crypto.createHash("sha256").update(raw).digest("hex"));
  });

  it("[TC-SEC-C2-002] hashToken non restituisce il token in chiaro e distingue input diversi", () => {
    const raw = generateRawToken();

    // Il valore salvato nel database non coincide con quello consegnato
    // all'utente: chi legge la tabella non puo' riusare i token.
    expect(hashToken(raw)).not.toBe(raw);
    expect(hashToken(raw)).not.toBe(hashToken(`${raw}x`));
  });

  it("[TC-SEC-C2-003] generateRawToken produce 256 bit casuali sempre diversi", () => {
    const token = generateRawToken();

    // 32 byte -> 64 caratteri esadecimali.
    expect(token).toMatch(/^[0-9a-f]{64}$/);

    // Nessuna collisione su un campione ampio: e' il contrario di quanto
    // accadeva con Math.random().toString(36).slice(2, 22).
    const campione = new Set(Array.from({ length: 500 }, () => generateRawToken()));
    expect(campione.size).toBe(500);
  });
});
