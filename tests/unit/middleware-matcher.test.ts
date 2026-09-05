/**
 * Test di hardening per il `matcher` del middleware (finding M-5).
 *
 * COSA verifica: l'esclusione dei file statici è ancorata alla fine del path,
 * quindi una rotta API con suffisso a estensione statica — es.
 * `/api/libri/x.js`, `/api/prenotazioni/<id>.css` (il segmento dinamico accetta
 * qualsiasi stringa) — deve comunque ATTRAVERSARE il middleware, mentre i
 * veri asset statici di `/public` restano esclusi.
 *
 * PERCHÉ: prima `.*\.(svg|png|...|css|js)$` escludeva QUALSIASI path che
 * terminasse con quelle estensioni, `/api/...` compreso → bypass del gate di
 * sessione del middleware.
 */
import { describe, expect, it } from "vitest";

import { config } from "@/middleware";

/**
 * Ricostruisce la regex del matcher generale (la seconda voce di `config.matcher`)
 * come la userebbe Next.js: match sull'intero pathname.
 */
function matcherRegex(): RegExp {
  const generale = (config.matcher as string[]).find((m) =>
    m.startsWith("/((?!"),
  );
  if (!generale) throw new Error("matcher generale non trovato");
  return new RegExp(`^${generale}$`);
}

describe("M-5 · il matcher non è aggirabile con un suffisso a estensione statica", () => {
  const re = matcherRegex();

  it("[TC-M5-001] mantiene la voce esplicita per la coda", () => {
    expect(config.matcher).toContain("/api/prenotazioni/coda/:path*");
  });

  it.each([
    "/api/libri/x.js",
    "/api/prenotazioni/abc123.css",
    "/api/notifiche.js",
    "/api/sse/posti",
    "/dashboard",
  ])("[TC-M5-002] il middleware processa %s", (path) => {
    expect(re.test(path)).toBe(true);
  });

  it.each([
    "/next.svg",
    "/icons/icon-192.svg",
    "/_next/static/chunk-abc.js",
    "/favicon.ico",
  ])("[TC-M5-003] resta escluso l'asset statico %s", (path) => {
    expect(re.test(path)).toBe(false);
  });
});
