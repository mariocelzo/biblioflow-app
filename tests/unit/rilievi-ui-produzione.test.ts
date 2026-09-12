// ============================================================================
// Rilievi di interfaccia osservati sul sito in produzione
// ============================================================================
// COSA: presidia quattro difetti visti dal vivo e corretti insieme. Sono tutti
//       verificabili leggendo i sorgenti, perche' riguardano testo mostrato e
//       classi di stile: non serve un browser per accorgersi che sono tornati.
//
//  - "(mock)" in /recupera-password: residuo di sviluppo rimasto visibile agli
//    utenti e per giunta falso, visto che l'email di reset viene spedita;
//  - barra di navigazione inferiore fissa anche su desktop, sovrapposta al
//    contenuto e ridondante rispetto all'header;
//  - /login con gradiente solo chiaro: con il tema scuro lo sfondo restava
//    bianco sotto una card scura;
//  - 404 predefinita di Next, in inglese e senza alcuno stile BiblioFlow.

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const RADICE = path.resolve(__dirname, "../..");

function leggi(relativo: string): string {
  return readFileSync(path.join(RADICE, relativo), "utf8");
}

/**
 * Toglie i commenti dal sorgente.
 *
 * PERCHE': qui si controlla che certe parole NON siano piu' mostrate
 * all'utente. I commenti pero' le citano di proposito, per spiegare cosa e'
 * stato corretto e perche': senza questo filtro il test boccerebbe proprio la
 * documentazione della correzione.
 */
function senzaCommenti(sorgente: string): string {
  return sorgente
    .replace(/\/\*[\s\S]*?\*\//g, "") // blocchi /* … */, inclusi i {/* … */}
    .replace(/^\s*\/\/.*$/gm, ""); // righe intere di commento //
}

describe("/recupera-password", () => {
  const sorgente = leggi("src/app/recupera-password/page.tsx");

  it("non mostra piu' la parola '(mock)' all'utente", () => {
    const visibile = senzaCommenti(sorgente);
    expect(visibile).not.toContain("(mock)");
    expect(visibile).not.toContain("Link mock generato");
  });

  it("spiega comunque che il link in chiaro appare solo in sviluppo", () => {
    // Il campo esiste ancora, ma l'API lo restituisce solo fuori produzione:
    // il testo deve dirlo, invece di chiamarlo genericamente "mock".
    expect(sorgente).toMatch(/solo ambiente di sviluppo/i);
  });
});

describe("barra di navigazione inferiore", () => {
  const sorgente = leggi("src/app/page.tsx");

  it("e' nascosta da `md` in su: su desktop duplicava l'header", () => {
    const barra = sorgente.match(/<nav[\s\S]*?className="([^"]*fixed bottom-0[^"]*)"/);
    expect(barra, "barra di navigazione inferiore non trovata").not.toBeNull();
    expect(barra?.[1]).toContain("md:hidden");
  });

  it("lo spazio riservato in fondo alla pagina sparisce con la barra", () => {
    expect(sorgente).toMatch(/pb-24 md:pb-8/);
  });
});

describe("/login", () => {
  const sorgente = leggi("src/app/login/page.tsx");

  it("lo sfondo rispetta il tema scuro come le altre pagine di accesso", () => {
    const sfondi = [...sorgente.matchAll(/className="min-h-screen[^"]*"/g)].map(
      (m) => m[0],
    );

    expect(sfondi.length).toBeGreaterThan(0);
    for (const sfondo of sfondi) {
      if (sfondo.includes("bg-gradient-to-br")) {
        expect(sfondo).toMatch(/dark:from-/);
      }
    }
  });
});

describe("pagina 404", () => {
  it("esiste una not-found.tsx dell'applicazione", () => {
    expect(existsSync(path.join(RADICE, "src/app/not-found.tsx"))).toBe(true);
  });

  it("e' in italiano e offre una via d'uscita", () => {
    const sorgente = leggi("src/app/not-found.tsx");
    expect(sorgente).toContain("Pagina non trovata");
    expect(senzaCommenti(sorgente)).not.toMatch(/could not be found/);
    // Senza almeno un link la 404 sarebbe un vicolo cieco.
    expect(sorgente).toMatch(/href="\/"/);
  });

  it("ha un'intestazione di primo livello vera", () => {
    // `CardTitle` rende un <div>: usandolo, la pagina sarebbe rimasta senza
    // <h1> e chi naviga per titoli non avrebbe avuto un punto di partenza.
    expect(leggi("src/app/not-found.tsx")).toMatch(/<h1[\s\S]*?Pagina non trovata/);
  });
});
