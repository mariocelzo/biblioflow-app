// ============================================================================
// Test unit per isSafeInternalPath (B-8)
// ============================================================================
// COSA: verifica la guardia anti open-redirect usata sia lato API (validazione
//       di `actionUrl` nelle notifiche) sia lato client (router.push).
// PERCHE': e' l'unico punto di verita' della policy "solo path interni assoluti";
//       una regressione qui riaprirebbe un open-redirect / XSS.

import { describe, expect, it } from "vitest";

import { isSafeInternalPath } from "@/lib/safe-redirect";

describe("isSafeInternalPath (B-8)", () => {
  it("[TC-SEC-B8-001] accetta un percorso interno assoluto semplice", () => {
    expect(isSafeInternalPath("/ok")).toBe(true);
  });

  it("[TC-SEC-B8-002] accetta un percorso interno con segmenti e query", () => {
    // Nessuno schema (":"), nessun "//" iniziale, nessun "\": e' sicuro.
    expect(isSafeInternalPath("/prenotazioni/123?tab=coda")).toBe(true);
  });

  it("[TC-SEC-B8-003] rifiuta un URL protocol-relative //evil", () => {
    expect(isSafeInternalPath("//evil")).toBe(false);
    expect(isSafeInternalPath("//evil.com/path")).toBe(false);
  });

  it("[TC-SEC-B8-004] rifiuta un URL assoluto https://x", () => {
    expect(isSafeInternalPath("https://x")).toBe(false);
  });

  it("[TC-SEC-B8-005] rifiuta lo schema javascript:", () => {
    expect(isSafeInternalPath("javascript:alert(1)")).toBe(false);
  });

  it("[TC-SEC-B8-006] rifiuta un path che contiene un backslash", () => {
    // I browser normalizzano "\" in "/": "/a\b" potrebbe aggirare i controlli.
    expect(isSafeInternalPath("/a\\b")).toBe(false);
  });

  it("[TC-SEC-B8-007] rifiuta un path assoluto che nasconde uno schema", () => {
    // Inizia con "/" ma contiene ":" -> rifiutato (regola "nessuno schema").
    expect(isSafeInternalPath("/redirect?to=http://evil.com")).toBe(false);
  });

  it("[TC-SEC-B8-008] rifiuta stringhe non-path e valori non stringa", () => {
    expect(isSafeInternalPath("")).toBe(false);
    expect(isSafeInternalPath("relative/path")).toBe(false);
    expect(isSafeInternalPath(undefined)).toBe(false);
    expect(isSafeInternalPath(null)).toBe(false);
    expect(isSafeInternalPath(42)).toBe(false);
    expect(isSafeInternalPath({ toString: () => "/ok" })).toBe(false);
  });
});
