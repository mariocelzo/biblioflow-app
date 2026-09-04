// Test della chiave usata per firmare i QR code (finding A-1).
//
// Prima: `process.env.QR_SECRET || 'biblioflow-qr-secret-2026-unisa'`. Il
// fallback stava nel repository, quindi chiunque poteva forgiare QR validi e
// fare check-in su prenotazioni altrui. Ora, se QR_SECRET non e' configurato,
// la chiave viene derivata da NEXTAUTH_SECRET (obbligatorio e mai versionato).

import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// vi.hoisted: la costante serve dentro la factory di vi.mock, che viene
// sollevata in cima al file prima delle normali dichiarazioni.
const costanti = vi.hoisted(() => ({ nextAuthSecret: "n".repeat(48) }));

const NEXTAUTH_SECRET_DI_TEST = costanti.nextAuthSecret;
const VECCHIO_LITERAL = "biblioflow-qr-secret-2026-unisa";
const ETICHETTA_DERIVAZIONE = "biblioflow-qr-signature-v1";

vi.mock("@/lib/env", () => ({
  env: { NEXTAUTH_SECRET: costanti.nextAuthSecret },
}));

import { signQRCode, verifyQRCode, type QRPayload } from "@/lib/qr-signature";

const payload: QRPayload = {
  prenotazioneId: "pren-qr-001",
  userId: "usr-qr-001",
  timestamp: 1_800_000_000_000,
};

/** Firma di riferimento calcolata con una chiave arbitraria. */
function firmaCon(chiave: crypto.BinaryLike | crypto.KeyObject): string {
  return crypto
    .createHmac("sha256", chiave)
    .update(`${payload.prenotazioneId}:${payload.userId}:${payload.timestamp}`)
    .digest("hex");
}

beforeEach(() => {
  // Stringa vuota = falsy: il codice la tratta come "QR_SECRET non configurato".
  vi.stubEnv("QR_SECRET", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("qr-signature: chiave derivata da NEXTAUTH_SECRET (A-1)", () => {
  it("[TC-SEC-A1-001] senza QR_SECRET firma con la chiave derivata da NEXTAUTH_SECRET", () => {
    const chiaveAttesa = crypto
      .createHmac("sha256", NEXTAUTH_SECRET_DI_TEST)
      .update(ETICHETTA_DERIVAZIONE)
      .digest();

    expect(signQRCode(payload)).toBe(firmaCon(chiaveAttesa));
  });

  it("[TC-SEC-A1-002] non accetta piu' firme prodotte con il vecchio secret hardcoded", () => {
    // Chi conosceva il literal nel repository non riesce piu' a forgiare QR.
    expect(verifyQRCode(payload, firmaCon(VECCHIO_LITERAL))).toBe(false);
  });

  it("[TC-SEC-A1-003] verifica correttamente una firma generata dal sistema stesso", () => {
    expect(verifyQRCode(payload, signQRCode(payload))).toBe(true);
  });

  it("[TC-SEC-A1-004] se QR_SECRET e' configurato ha la precedenza sulla derivazione", () => {
    vi.stubEnv("QR_SECRET", "q".repeat(44));

    expect(signQRCode(payload)).toBe(firmaCon("q".repeat(44)));
  });
});
