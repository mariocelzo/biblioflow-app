// ============================================================================
// Il campo "quando e' iniziato il prestito" deve chiamarsi allo stesso modo
// in schema Prisma, API e pagina
// ============================================================================
// COSA: verifica che `interface Prestito` in src/app/prestiti/page.tsx usi lo
//       stesso nome di campo del model `Prestito` in prisma/schema.prisma
//       (`dataPrestito`), e che sia quello letto davvero a schermo/aria-label.
//
// PERCHE' ESISTE QUESTO TEST (bug reale, riprodotto localmente):
// l'interfaccia dichiarava `dataInizio: string`, campo MAI esistito ne' nello
// schema Prisma ne' nella risposta di GET /api/prestiti (che ordina proprio
// per `dataPrestito`). `prestito.dataInizio` era quindi sempre `undefined`,
// `new Date(undefined)` produce "Invalid Date", e quel valore finiva sia nel
// testo "Preso: ..." sia nell'aria-label letta dagli screen reader.
//
// Verificato empiricamente (non solo leggendo il codice): con un utente e un
// prestito reali su Postgres locale, GET /api/prestiti restituisce la chiave
// `dataPrestito` (mai `dataInizio`), e dopo la correzione la pagina mostra
// "Preso: 15/09/2026" invece di "Preso: Invalid Date".
//
// E' lo stesso tipo di difetto — e la stessa tecnica di test — di
// `tests/unit/reset-password-contratto.test.ts`: due lati che, letti da soli,
// sembrano entrambi corretti, e che si vedono disallineati solo mettendoli a
// confronto.

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const RADICE = path.resolve(__dirname, "../..");

function leggi(relativo: string): string {
  return readFileSync(path.join(RADICE, relativo), "utf8");
}

const pagina = leggi("src/app/prestiti/page.tsx");
const schema = leggi("prisma/schema.prisma");
const apiPrestiti = leggi("src/app/api/prestiti/route.ts");

/** Il corpo di `model Prestito { ... }` dentro prisma/schema.prisma. */
function bloccoModelPrestito(): string {
  const blocco = schema.match(/model Prestito\s*\{([\s\S]*?)\n\}/);

  if (!blocco) {
    throw new Error("Non trovo `model Prestito` in prisma/schema.prisma");
  }

  return blocco[1];
}

/**
 * I nomi dei campi SCALARI dichiarati nel model Prestito.
 * Esclude le relazioni (`user User @relation(...)`, `libro Libro @relation(...)`):
 * il loro tipo non e' uno di quelli elencati, quindi la riga non combacia.
 */
function campiModelPrestito(): string[] {
  return [
    ...bloccoModelPrestito().matchAll(
      /^\s*(\w+)\s+(?:String|Int|Float|Boolean|DateTime)\b/gm,
    ),
  ].map((m) => m[1]);
}

/** Il corpo di `interface Prestito { ... }` dentro src/app/prestiti/page.tsx. */
function bloccoInterfacciaPrestito(): string {
  const blocco = pagina.match(/interface Prestito\s*\{([\s\S]*?)\n\}/);

  if (!blocco) {
    throw new Error(
      "Non trovo `interface Prestito` in src/app/prestiti/page.tsx",
    );
  }

  return blocco[1];
}

/**
 * I nomi dei campi dichiarati nell'interfaccia TypeScript `Prestito`.
 * Le righe di commento (`// ...`) non hanno una parola subito dopo
 * l'indentazione iniziale (iniziano con `/`), quindi non vengono catturate.
 */
function campiInterfacciaPrestito(): string[] {
  return [...bloccoInterfacciaPrestito().matchAll(/^\s*(\w+)\s*:/gm)].map(
    (m) => m[1],
  );
}

describe("prestiti: il campo data-inizio combacia fra schema, pagina e API", () => {
  const campiSchema = campiModelPrestito();
  const campiInterfaccia = campiInterfacciaPrestito();

  it("[TC-PREST-DATA-001] il test non gira a vuoto", () => {
    // Se una delle due estrazioni smettesse di trovare riscontro, il
    // confronto sotto passerebbe in silenzio senza verificare nulla.
    expect(campiSchema.length).toBeGreaterThan(0);
    expect(campiInterfaccia.length).toBeGreaterThan(0);
  });

  it("[TC-PREST-DATA-002] lo schema Prisma ha 'dataPrestito', non 'dataInizio'", () => {
    expect(campiSchema).toContain("dataPrestito");
    expect(campiSchema).not.toContain("dataInizio");
  });

  it("[TC-PREST-DATA-003] l'interfaccia della pagina usa lo stesso nome dello schema", () => {
    expect(
      campiInterfaccia,
      "L'interfaccia `Prestito` non dichiara 'dataPrestito': se torna a " +
        "chiamarsi 'dataInizio' (o qualsiasi altro nome diverso da quello " +
        "dello schema), `new Date(prestito.<campo>)` produce di nuovo " +
        "'Invalid Date' a schermo e nell'aria-label.",
    ).toContain("dataPrestito");
    expect(campiInterfaccia).not.toContain("dataInizio");
  });

  it("[TC-PREST-DATA-004] GET /api/prestiti legge/ordina per lo stesso campo", () => {
    // Se l'API smettesse di usare `dataPrestito` (es. rinominato altrove nello
    // schema senza aggiornare la query), il contratto si romperebbe anche se
    // la pagina restasse invariata: si verifica anche questo lato.
    expect(apiPrestiti).toMatch(/dataPrestito/);
  });

  it("[TC-PREST-DATA-005] il testo 'Preso: ...' e l'aria-label leggono 'prestito.dataPrestito'", () => {
    // Guardia diretta sui due punti d'uso reali (schermo + screen reader).
    const occorrenze = [...pagina.matchAll(/prestito\.dataPrestito\b/g)];

    expect(
      occorrenze.length,
      "Mi aspetto almeno due usi di `prestito.dataPrestito` nella pagina: " +
        "il testo 'Preso: ...' e l'aria-label della card del prestito.",
    ).toBeGreaterThanOrEqual(2);

    expect(pagina).not.toMatch(/prestito\.dataInizio\b/);
  });
});
