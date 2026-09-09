// ============================================================================
// Gli avvisi all'utente devono restare VISIBILI
// ============================================================================
// COSA: verifica che il foglio di stile globale non nasconda gli elementi in
//       base agli attributi ARIA usati dagli avvisi.
//
// PERCHE' ESISTE QUESTO TEST (bug reale, trovato in produzione):
// in globals.css c'era questa regola:
//
//   [aria-live="polite"], [aria-live="assertive"] {
//     position: absolute; left: -10000px; width: 1px; height: 1px;
//     overflow: hidden;
//   }
//
// L'intento era creare una live region invisibile per gli screen reader, ma
// `aria-live` non significa "invisibile": e' l'attributo che si mette sugli
// avvisi VISIBILI che cambiano dinamicamente. La regola spediva quindi a
// -10000px ogni banner di errore o conferma dell'app — login, registrazione,
// verifica email, reset password. Il messaggio finiva nel DOM ma nessun utente
// vedente poteva leggerlo: sbagliando la password non compariva nulla, e il
// sito sembrava semplicemente non rispondere.
//
// Una live region che deve restare nascosta usa la classe `.sr-only`, che si
// applica solo dove serve (vedi components/accessibility/live-announcer.tsx).

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const RADICE = path.resolve(__dirname, "../..");

function leggi(relativo: string): string {
  return readFileSync(path.join(RADICE, relativo), "utf8");
}

/** Rimuove i commenti /* ... *\/ per non trovare riscontri nella spiegazione. */
function senzaCommenti(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

describe("globals.css: nessuna regola nasconde gli avvisi", () => {
  const css = senzaCommenti(leggi("src/app/globals.css"));

  it("[TC-A11Y-001] non esiste un selettore che nasconde per attributo aria-live", () => {
    // Cerca un blocco il cui selettore contenga [aria-live...]: qualunque
    // regola di questo tipo colpirebbe a tappeto tutti i banner dell'app.
    const selettoriAriaLive = css.match(/[^{}]*\[aria-live[^{}]*\{[^}]*\}/g);

    expect(
      selettoriAriaLive,
      "Un selettore [aria-live] applica stili a TUTTI gli avvisi visibili " +
        "dell'app. Se serve nascondere una live region, usa la classe .sr-only " +
        "sul singolo componente.",
    ).toBeNull();
  });

  it("[TC-A11Y-002] non esiste un selettore che nasconde per attributo role=alert/status", () => {
    const selettoriRuolo = css.match(
      /[^{}]*\[role=["']?(alert|status)["']?\][^{}]*\{[^}]*\}/g,
    );

    expect(selettoriRuolo).toBeNull();
  });

  it("[TC-A11Y-003] la classe .sr-only resta disponibile per le live region nascoste", () => {
    // E' l'alternativa corretta: esplicita e circoscritta al singolo elemento.
    expect(css).toMatch(/\.sr-only\s*\{/);
  });
});

describe("i componenti che annunciano usano lo strumento giusto", () => {
  it("[TC-A11Y-004] LiveAnnouncer si nasconde da solo con .sr-only", () => {
    // Se un giorno perdesse la classe, tornerebbe visibile a meta' schermo:
    // e' l'unico elemento dell'app che deve davvero restare invisibile.
    const sorgente = leggi("src/components/accessibility/live-announcer.tsx");

    expect(sorgente).toContain('className="sr-only"');
    expect(sorgente).toContain("aria-live");
  });

  it("[TC-A11Y-005] i banner di login e registrazione non sono marcati sr-only", () => {
    // Difesa dal rimedio sbagliato: nascondere il banner invece di togliere
    // la regola CSS avrebbe riprodotto lo stesso difetto.
    for (const pagina of [
      "src/app/login/page.tsx",
      "src/app/registrazione/page.tsx",
    ]) {
      const sorgente = leggi(pagina);
      const righeAvviso = sorgente
        .split("\n")
        .filter((riga) => riga.includes('role="alert"'));

      expect(righeAvviso.length).toBeGreaterThan(0);
      for (const riga of righeAvviso) {
        expect(riga).not.toContain("sr-only");
      }
    }
  });
});
