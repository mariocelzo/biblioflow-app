// ============================================================================
// Ogni voce di PRECACHE_URLS deve corrispondere a un file o a una rotta che
// esiste davvero
// ============================================================================
// PERCHE' ESISTE QUESTO TEST (difetto reale, verificato in produzione su
// https://biblioflow-app.vercel.app): `navigator.serviceWorker.getRegistrations()`
// restituiva `[]` nonostante `/sw.js` rispondesse 200 e `register('/sw.js')`
// risolvesse con successo. Causa: `cache.addAll(PRECACHE_URLS)` in
// public/sw.js e' ATOMICO — basta che UNA sola voce risponda con un errore
// perche' l'intero evento `install` fallisca e il service worker venga
// scartato silenziosamente. L'elenco conteneva `/icons/icon-192x192.png` e
// `/icons/icon-512x512.png` (mai esistiti: in public/icons/ ci sono solo le
// .svg) e `/offline` (non e' una rotta Next.js, solo public/offline.html).
//
// Questo test lega ogni voce dell'elenco a un controllo statico — esistenza
// del file sotto public/, oppure esistenza della rotta nell'App Router — in
// modo che se in futuro qualcuno aggiunge di nuovo un percorso inesistente,
// il test fallisca PRIMA del prossimo giro di "il service worker non si
// installa piu' in produzione".

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const RADICE = path.resolve(__dirname, "../..");
const SW_PATH = path.join(RADICE, "public/sw.js");
const PUBLIC_DIR = path.join(RADICE, "public");
const APP_DIR = path.join(RADICE, "src/app");

/** Estrae l'array letterale `const PRECACHE_URLS = [...]` da sw.js senza
 * eseguire il file (e' un service worker, non un modulo Node importabile). */
function leggiPrecacheUrls(): string[] {
  const sorgente = readFileSync(SW_PATH, "utf8");
  const match = sorgente.match(/const PRECACHE_URLS = \[([^\]]*)\]/);
  if (!match) {
    throw new Error("PRECACHE_URLS non trovato in public/sw.js");
  }
  return [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

/** Stesso approccio di tests/unit/link-interni-esistono.test.ts: ogni
 * `page.tsx` sotto src/app diventa la sua cartella relativa. */
function rotteEsistenti(): string[] {
  function fileSorgente(cartella: string): string[] {
    return readdirSync(cartella).flatMap((voce) => {
      const completo = path.join(cartella, voce);
      if (statSync(completo).isDirectory()) return fileSorgente(completo);
      return /\.tsx?$/.test(voce) ? [completo] : [];
    });
  }
  return fileSorgente(APP_DIR)
    .filter((file) => /[\\/]page\.tsx$/.test(file))
    .map((file) => {
      const relativo = path
        .relative(APP_DIR, path.dirname(file))
        .split(path.sep)
        .filter(Boolean);
      return "/" + relativo.join("/");
    })
    .map((rotta) => (rotta === "/" ? "/" : rotta.replace(/\/$/, "")));
}

/** Una voce con estensione (.svg, .png, .json, ...) e' un file statico:
 * deve esistere sotto public/. Una voce senza estensione e' una rotta
 * Next.js: deve esistere nell'App Router. I segmenti dinamici non sono
 * rilevanti qui: il precache elenca solo percorsi fissi. */
function voceValida(voce: string, rotte: string[]): boolean {
  const haEstensione = /\.[a-z0-9]+$/i.test(voce);
  if (haEstensione) {
    return existsSync(path.join(PUBLIC_DIR, voce));
  }
  return rotte.includes(voce);
}

describe("PRECACHE_URLS del service worker", () => {
  const precache = leggiPrecacheUrls();
  const rotte = rotteEsistenti();

  it("l'elenco viene letto correttamente da public/sw.js (altrimenti il test e' vacuo)", () => {
    expect(precache.length).toBeGreaterThan(0);
    expect(precache).toContain("/");
  });

  it.each(precache)("'%s' corrisponde a un file in public/ o a una rotta esistente", (voce) => {
    expect(voceValida(voce, rotte)).toBe(true);
  });

  it("non contiene le PNG mai esistite (icon-192x192.png / icon-512x512.png)", () => {
    // Regressione esplicita del difetto originale, oltre al controllo
    // generico sopra: se qualcuno le reintroducesse per errore (es. copiando
    // un esempio trovato online) il messaggio qui e' piu' diretto di un
    // generico "voce non valida".
    expect(precache).not.toContain("/icons/icon-192x192.png");
    expect(precache).not.toContain("/icons/icon-512x512.png");
  });

  it("non contiene '/offline' (non e' una rotta Next.js, solo public/offline.html esiste)", () => {
    expect(precache).not.toContain("/offline");
  });

  it("OFFLINE_URL punta al file statico reale", () => {
    const sorgente = readFileSync(SW_PATH, "utf8");
    const match = sorgente.match(/const OFFLINE_URL = '([^']+)'/);
    expect(match).not.toBeNull();
    const offlineUrl = match![1];
    expect(existsSync(path.join(PUBLIC_DIR, offlineUrl))).toBe(true);
  });
});
