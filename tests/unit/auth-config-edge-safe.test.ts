/**
 * 🧪 TEST — `src/lib/auth.config.ts` deve restare eseguibile su Edge Runtime
 *
 * PERCHE' ESISTE: `src/middleware.ts` gira nell'Edge Runtime di Next.js, dove
 * Prisma, bcrypt e le API di Node (`fs`, `process.exit`, ...) non esistono. Da
 * quando il middleware istanzia `auth()` a partire da `auth.config.ts`, quel
 * file e tutta la sua catena di import sono vincolati a restare "edge-safe".
 *
 * IL PUNTO DOLENTE: un import proibito NON fa fallire i test — girano su Node,
 * dove Prisma e bcrypt funzionano benissimo. Fallirebbe il DEPLOY, cioe' il
 * momento peggiore possibile, e il sintomo sarebbe un'applicazione che non
 * risponde piu' su nessuna pagina protetta. Un import di rimbalzo (`auth.config`
 * → un helper innocuo → `@/lib/env` → `process.exit`) e' anche facilissimo da
 * introdurre senza accorgersene.
 *
 * COSA FA: attraversa staticamente il grafo degli import a partire da
 * `auth.config.ts`, seguendo i moduli interni al progetto, e verifica che non
 * compaia nessun modulo che richieda Node. Gli `import type` sono ignorati,
 * perche' il compilatore li cancella e non producono codice a runtime.
 *
 * 🆔 ID STABILI: `TC-EDGE-0xx`.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const RADICE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const SRC = path.join(RADICE, "src");
const PARTENZA = path.join(SRC, "lib/auth.config.ts");

/**
 * Moduli che portano con se' codice Node e che quindi non possono comparire
 * nella catena. `@/lib/env` e' il caso piu' insidioso: chiama `process.exit(1)`
 * quando la validazione Zod fallisce.
 */
const MODULI_VIETATI = [
  "@prisma/client",
  "@/lib/prisma",
  "@/lib/env",
  "@/lib/mailer",
  "bcryptjs",
  "pg",
  "nodemailer",
];

/** Prefissi dei moduli built-in di Node. */
const PREFISSI_NODE = ["node:", "fs", "path", "crypto", "child_process", "os"];

/**
 * Toglie commenti di blocco e di riga.
 *
 * PERCHE': i file di questo progetto sono molto commentati e le spiegazioni
 * citano i nomi dei moduli (`import type`, `@prisma/client`, ...). Senza
 * questa ripulitura la scansione leggerebbe la prosa come se fosse codice e
 * segnalerebbe violazioni inesistenti.
 */
function senzaCommenti(sorgente: string): string {
  return sorgente
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/**
 * Estrae gli specificatori degli import di VALORE (gli `import type` e i
 * `type { ... }` vengono ignorati: spariscono in compilazione).
 */
function importDiValore(sorgenteGrezza: string): string[] {
  const sorgente = senzaCommenti(sorgenteGrezza);
  const specificatori: string[] = [];
  const regex = /import\s+([\s\S]*?)\s*from\s*["']([^"']+)["']/g;

  for (const match of sorgente.matchAll(regex)) {
    const clausola = match[1];
    const modulo = match[2];

    // `import type { X } from "..."` → nessun codice a runtime.
    if (/^type\s/.test(clausola.trim())) continue;

    specificatori.push(modulo);
  }

  // Anche `import "modulo"` (solo effetti collaterali) e gli import dinamici.
  for (const match of sorgente.matchAll(/import\s*\(\s*["']([^"']+)["']\s*\)/g)) {
    specificatori.push(match[1]);
  }

  return specificatori;
}

/** Risolve uno specificatore interno al progetto in un file su disco. */
function risolviInterno(daFile: string, modulo: string): string | null {
  let base: string;

  if (modulo.startsWith("@/")) {
    base = path.join(SRC, modulo.slice(2));
  } else if (modulo.startsWith(".")) {
    base = path.resolve(path.dirname(daFile), modulo);
  } else {
    // Dipendenza esterna: non si scende nel node_modules.
    return null;
  }

  for (const candidato of [`${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")]) {
    try {
      readFileSync(candidato, "utf8");
      return candidato;
    } catch {
      // provo il prossimo
    }
  }

  return null;
}

/** Percorre il grafo e restituisce ogni modulo raggiunto, con la sua origine. */
function catenaDiImport(): Map<string, string[]> {
  const raggiunti = new Map<string, string[]>();
  const daVisitare = [PARTENZA];
  const visitati = new Set<string>();

  while (daVisitare.length > 0) {
    const file = daVisitare.pop() as string;
    if (visitati.has(file)) continue;
    visitati.add(file);

    const moduli = importDiValore(readFileSync(file, "utf8"));
    const relativo = path.relative(RADICE, file);

    for (const modulo of moduli) {
      const origini = raggiunti.get(modulo) ?? [];
      origini.push(relativo);
      raggiunti.set(modulo, origini);

      const interno = risolviInterno(file, modulo);
      if (interno) daVisitare.push(interno);
    }
  }

  return raggiunti;
}

describe("la configurazione condivisa di Auth.js resta edge-safe", () => {
  const raggiunti = catenaDiImport();

  it("[TC-EDGE-001] la scansione legge davvero il file (non gira a vuoto)", () => {
    // Difesa contro il falso verde: se la lettura o la regex smettessero di
    // funzionare, [TC-EDGE-002] passerebbe su un insieme vuoto. Si ancora il
    // controllo a un import che deve esserci per forza.
    expect([...raggiunti.keys()]).toContain("next-auth/providers/google");
    expect([...raggiunti.keys()]).toContain("next/server");
    // ...e che gli `import type` vengano invece ignorati, altrimenti
    // `@prisma/client` (importato SOLO come tipo) darebbe un falso allarme.
    expect([...raggiunti.keys()]).not.toContain("@prisma/client");
  });

  it("[TC-EDGE-002] nessun modulo che richiede Node nella catena di import", () => {
    const violazioni = [...raggiunti.entries()]
      .filter(([modulo]) => {
        if (MODULI_VIETATI.includes(modulo)) return true;
        return PREFISSI_NODE.some(
          (p) => modulo === p || modulo.startsWith(`${p}:`) || modulo.startsWith(`${p}/`),
        );
      })
      .map(([modulo, origini]) => `${modulo} (importato da ${origini.join(", ")})`);

    expect(
      violazioni,
      "src/lib/auth.config.ts viene caricato dal middleware, che gira su Edge " +
        "Runtime: questi moduli non esistono li' e romperebbero l'applicazione " +
        "al primo deploy, non nei test.\n" +
        violazioni.join("\n"),
    ).toEqual([]);
  });

  it("[TC-EDGE-003] `auth.config.ts` non importa `src/lib/auth.ts` (sarebbe un ciclo con Prisma)", () => {
    expect([...raggiunti.keys()]).not.toContain("./auth");
    expect([...raggiunti.keys()]).not.toContain("@/lib/auth");
  });
});
