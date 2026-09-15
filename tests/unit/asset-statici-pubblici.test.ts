// ============================================================================
// Gli asset statici serviti da /public devono restare raggiungibili SENZA
// sessione — e le API non devono MAI riuscire a intrufolarsi nell'esclusione
// ============================================================================
// COSA: verifica, leggendo il `matcher` direttamente dal sorgente di
//       `src/middleware.ts` (stesso approccio di
//       `tests/unit/pagine-da-email-pubbliche.test.ts`), che:
//        1. il manifest della PWA e gli altri asset statici noti restino
//           esclusi dal middleware (quindi raggiungibili senza cookie di
//           sessione);
//        2. le rotte `/api/...` continuino SEMPRE ad attraversare il
//           middleware, anche quando il loro path termina con
//           un'estensione riconosciuta come "statica" (hardening M-5).
//
// PERCHE' ESISTE QUESTO TEST (bug reale, riprodotto in produzione):
// `document.querySelector('link[rel="manifest"]').href` puntava a
// `/manifest.json`, ma quella richiesta veniva rediretta a `/login` (307,
// corpo HTML) invece di restituire JSON. Causa: il `matcher` escludeva le
// estensioni statiche (`svg|png|jpg|jpeg|gif|webp|ico|css|js`) MA NON
// `.json`, quindi `/manifest.json` attraversava il middleware come una
// pagina qualsiasi, non era fra le `publicRoutes`, e finiva rediretta. La
// PWA risultava di fatto non installabile.
//
// Questo test lega la lista delle estensioni escluse ai file REALMENTE
// presenti in `public/`: se domani qualcuno restringe di nuovo il matcher
// (o toglie un'estensione) la suite si ferma, invece di scoprirlo di nuovo
// dal vivo su produzione.

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const RADICE = path.resolve(__dirname, "../..");

function leggi(relativo: string): string {
  return readFileSync(path.join(RADICE, relativo), "utf8");
}

/**
 * Estrae dal sorgente di `src/middleware.ts` il pattern del secondo elemento
 * di `matcher` (l'esclusione generale) e lo trasforma in una RegExp vera,
 * cosi' da testarlo con lo stesso comportamento che ha in produzione, invece
 * di duplicarne una copia a mano che potrebbe disallinearsi.
 */
function matcherEsclusioneGenerale(): RegExp {
  const sorgente = leggi("src/middleware.ts");

  // Il matcher e' un array di stringhe; il pattern che ci interessa è quello
  // che contiene il lookahead `(?!api/)` usato per l'hardening M-5.
  const blocco = sorgente.match(
    /"(\/\(\(\?![^"]*api\/[^"]*)"/,
  );

  if (!blocco) {
    throw new Error(
      "Pattern di esclusione generale non trovato in `config.matcher` " +
        "dentro src/middleware.ts: il test non puo' verificare nulla.",
    );
  }

  // `readFileSync` restituisce il TESTO GREZZO del file: dentro un literal
  // TypeScript `"...\\.(...)..."` il doppio backslash sono DUE caratteri
  // letterali sul disco (serve il primo per produrre, una volta che il
  // compilatore interpreta la stringa, un singolo backslash che nella regex
  // "sfugge" il punto). Qui il compilatore non interviene: bisogna
  // ricreare a mano la stessa interpretazione, altrimenti `new RegExp`
  // riceverebbe "\\." cosi' com'e' (backslash letterale seguito da
  // "qualsiasi carattere") invece di "\." (punto letterale) — pattern
  // completamente diverso e silenziosamente sbagliato.
  const patternRuntime = blocco[1].replace(/\\\\/g, "\\");

  return new RegExp(`^${patternRuntime}$`);
}

/**
 * True se `pathname` attraverserebbe il middleware (cioe' e' "matchato" dal
 * matcher generale, quindi richiede sessione salvo essere fra le
 * `publicRoutes`/`publicApiPrefixes`). False se il matcher lo esclude a
 * priori — come dovrebbe succedere per un asset statico di /public.
 */
function attraversaIlMiddleware(pathname: string): boolean {
  return matcherEsclusioneGenerale().test(pathname);
}

/** Elenca ricorsivamente i file sotto /public, come path assoluti da root ("/manifest.json", "/icons/icon-192.svg", ...). */
function fileStaticiConEstensioneNota(): string[] {
  const estensioni = ["svg", "png", "jpg", "jpeg", "gif", "webp", "ico", "css", "js", "json"];
  const radicePublic = path.join(RADICE, "public");
  const risultato: string[] = [];

  function esplora(dir: string) {
    for (const voce of readdirSync(dir)) {
      const assoluto = path.join(dir, voce);
      if (statSync(assoluto).isDirectory()) {
        esplora(assoluto);
        continue;
      }
      const estensione = voce.split(".").pop() ?? "";
      if (estensioni.includes(estensione)) {
        const relativo = path.relative(radicePublic, assoluto).split(path.sep).join("/");
        risultato.push(`/${relativo}`);
      }
    }
  }

  esplora(radicePublic);
  return risultato;
}

describe("asset statici di /public raggiungibili senza sessione", () => {
  it("[TC-ASSET-PUB-001] il manifest della PWA e' escluso dal middleware", () => {
    expect(
      attraversaIlMiddleware("/manifest.json"),
      "/manifest.json attraversa il middleware: senza sessione verrebbe " +
        "rediretto a /login e il browser riceverebbe HTML invece di JSON, " +
        "rendendo la PWA non installabile (bug riprodotto in produzione).",
    ).toBe(false);
  });

  it.each(fileStaticiConEstensioneNota())(
    "[TC-ASSET-PUB-002] %s (file reale sotto public/) e' escluso dal middleware",
    (pathname) => {
      expect(
        attraversaIlMiddleware(pathname),
        `${pathname} attraversa il middleware: un file statico servito da ` +
          "/public non dovrebbe richiedere una sessione per essere letto.",
      ).toBe(false);
    },
  );

  it("[TC-ASSET-PUB-003] il test non gira a vuoto (ci sono davvero file statici da controllare)", () => {
    // Difesa contro un falso verde: se readdir smettesse di trovare file
    // (es. cartella spostata) il ciclo qui sopra non verificherebbe nulla.
    expect(fileStaticiConEstensioneNota().length).toBeGreaterThan(0);
  });
});

describe("hardening M-5: le API restano protette anche con suffisso statico", () => {
  it("[TC-ASSET-PUB-004] /api/sale attraversa sempre il middleware", () => {
    expect(
      attraversaIlMiddleware("/api/sale"),
      "/api/sale NON attraversa piu' il middleware: un'API senza sessione " +
        "non verrebbe piu' controllata.",
    ).toBe(true);
  });

  it.each([
    "/api/libri/x.js",
    "/api/prenotazioni/id.css",
    "/api/qualcosa.json",
  ])(
    "[TC-ASSET-PUB-005] %s attraversa il middleware nonostante il suffisso statico (M-5)",
    (pathname) => {
      expect(
        attraversaIlMiddleware(pathname),
        `${pathname} e' stato escluso dal middleware per via del suo ` +
          "suffisso: e' esattamente la regressione M-5 che il lookahead " +
          "`(?!api/)` deve impedire, anche dopo l'aggiunta di \"json\" fra " +
          "le estensioni statiche escluse.",
      ).toBe(true);
    },
  );
});
