// ============================================================================
// Ogni link interno deve puntare a una rotta che esiste davvero
// ============================================================================
// PERCHE' ESISTE QUESTO TEST (difetto reale, osservato in produzione):
// il footer di /login offriva "Opzioni di accessibilita'" verso /accessibilita,
// ma quella cartella non era mai stata creata. Risultato: 404 per chi clicca e,
// su OGNI pagina che mostra il link, un errore in console per il prefetch di
// Next (`GET /accessibilita?_rsc=… 404`). Il difetto era sopravvissuto perche'
// nulla lega un `href` alla presenza del file corrispondente.
//
// Il test percorre i sorgenti, raccoglie gli `href` interni scritti come
// stringhe letterali e verifica che a ognuno corrisponda una pagina nell'App
// Router. I percorsi dinamici (`/libri/${id}`) non sono valutabili in modo
// statico e vengono saltati: qui si punta ai link fissi, che sono quelli che
// marciscono in silenzio.

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const RADICE = path.resolve(__dirname, "../..");
const SORGENTI = path.join(RADICE, "src");
const APP = path.join(SORGENTI, "app");

/** Tutti i file .ts/.tsx sotto src/. */
function fileSorgente(cartella: string): string[] {
  return readdirSync(cartella).flatMap((voce) => {
    const completo = path.join(cartella, voce);
    if (statSync(completo).isDirectory()) return fileSorgente(completo);
    return /\.tsx?$/.test(voce) ? [completo] : [];
  });
}

/**
 * Percorsi serviti dall'App Router: ogni `page.tsx` diventa la sua cartella
 * relativa a src/app. I segmenti dinamici ([id]) restano tali e vengono
 * confrontati a parte.
 */
function rotteEsistenti(): string[] {
  return fileSorgente(APP)
    .filter((file) => /[\\/]page\.tsx$/.test(file))
    .map((file) => {
      const relativo = path
        .relative(APP, path.dirname(file))
        .split(path.sep)
        .filter(Boolean);
      return "/" + relativo.join("/");
    })
    .map((rotta) => (rotta === "/" ? "/" : rotta.replace(/\/$/, "")));
}

/**
 * Raccoglie gli href interni letterali, in entrambe le forme che il progetto
 * usa davvero:
 *   - come attributo JSX:        href="/qualcosa"
 *   - come voce di un elenco:    { title: "…", href: "/qualcosa" }
 *
 * La seconda forma non e' un dettaglio: il link morto "Impostazioni" della
 * barra laterale di amministrazione stava proprio in un array di voci di menu,
 * e cercando solo gli attributi JSX sarebbe passato inosservato.
 */
function linkInterni(): { file: string; href: string }[] {
  return fileSorgente(SORGENTI).flatMap((file) => {
    const sorgente = readFileSync(file, "utf8");
    return [...sorgente.matchAll(/href[=:]\s*"(\/[^"#?]*)"/g)].map((m) => ({
      file: path.relative(RADICE, file),
      href: m[1],
    }));
  });
}

/** Una rotta e' coperta se combacia esattamente o tramite segmento dinamico. */
function rottaCoperta(href: string, rotte: string[]): boolean {
  const percorso = href.length > 1 ? href.replace(/\/$/, "") : href;

  return rotte.some((rotta) => {
    if (rotta === percorso) return true;

    const attesi = rotta.split("/").filter(Boolean);
    const forniti = percorso.split("/").filter(Boolean);
    if (attesi.length !== forniti.length) return false;

    return attesi.every(
      (segmento, i) => segmento.startsWith("[") || segmento === forniti[i],
    );
  });
}

describe("link interni", () => {
  const rotte = rotteEsistenti();

  it("l'App Router viene letto correttamente", () => {
    // Se questa asserzione cade, il test sopra diventerebbe vacuo.
    expect(rotte).toContain("/login");
    expect(rotte.length).toBeGreaterThan(5);
  });

  it("/accessibilita esiste: era il link morto nel footer di /login", () => {
    expect(rotte).toContain("/accessibilita");
  });

  it("nessun href interno punta a una rotta inesistente", () => {
    const morti = linkInterni().filter(
      ({ href }) =>
        // Le API e i file statici (manifest, icone) non sono pagine.
        !href.startsWith("/api/") &&
        !/\.[a-z0-9]+$/i.test(href) &&
        !rottaCoperta(href, rotte),
    );

    expect(morti).toEqual([]);
  });
});
