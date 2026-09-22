// ============================================================================
// "Le Mie Prenotazioni" non deve formattare un ORARIO come se fosse una DATA
// ============================================================================
// COSA: verifica che `interface Prenotazione` in src/app/prenotazioni/page.tsx
//       usi lo stesso nome di campo DATA del model `Prenotazione` in
//       prisma/schema.prisma (`data`), e che sia quello davvero passato alla
//       funzione che formatta la data - mai `oraInizio`/`oraFine`, che sono
//       ORARI (@db.Time), non date.
//
// PERCHE' ESISTE QUESTO TEST (bug reale, riprodotto in produzione):
// una prenotazione confermata dall'API come `data: "2026-09-23T00:00:00.000Z"`,
// `oraInizio: "1970-01-01T10:00:00.000Z"` (mercoledi' 23 settembre, 10:00)
// veniva mostrata come "gio 1 gen 11:00 - 13:00". Due difetti sovrapposti:
//   1) l'interfaccia dichiarava `dataPrenotazione`, un campo mai restituito
//      dall'API (che restituisce `data`, il nome del campo Prisma), quindi
//      `formatData` veniva chiamata su `prenotazione.oraInizio` - un ORARIO,
//      ancorato per costruzione al 1970-01-01 (un giovedi'), non alla data
//      reale della prenotazione;
//   2) `formatOra` convertiva nel fuso LOCALE un valore gia' in "orario da
//      parete" (vedi tests/unit/tempo-db.test.ts per quella parte).
//
// Questo test copre il difetto (1): e' invisibile leggendo un solo lato del
// codice (interfaccia e chiamata sembrano entrambe plausibili), si vede solo
// confrontando schema, interfaccia e punti d'uso reali - stessa tecnica di
// tests/unit/prestiti-contratto-data.test.ts.

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const RADICE = path.resolve(__dirname, "../..");

function leggi(relativo: string): string {
  return readFileSync(path.join(RADICE, relativo), "utf8");
}

const pagina = leggi("src/app/prenotazioni/page.tsx");
const schema = leggi("prisma/schema.prisma");

/** Il corpo di `model Prenotazione { ... }` dentro prisma/schema.prisma. */
function bloccoModelPrenotazione(): string {
  const blocco = schema.match(/model Prenotazione\s*\{([\s\S]*?)\n\}/);

  if (!blocco) {
    throw new Error("Non trovo `model Prenotazione` in prisma/schema.prisma");
  }

  return blocco[1];
}

/**
 * I nomi dei campi SCALARI dichiarati nel model Prenotazione.
 * Esclude le relazioni (`user User @relation(...)`, `posto Posto @relation(...)`):
 * il loro tipo non e' uno di quelli elencati, quindi la riga non combacia.
 */
function campiModelPrenotazione(): string[] {
  return [
    ...bloccoModelPrenotazione().matchAll(
      /^\s*(\w+)\s+(?:String|Int|Float|Boolean|DateTime)\b/gm,
    ),
  ].map((m) => m[1]);
}

/** Il corpo di `interface Prenotazione { ... }` dentro la pagina. */
function bloccoInterfacciaPrenotazione(): string {
  const blocco = pagina.match(/interface Prenotazione\s*\{([\s\S]*?)\n\}/);

  if (!blocco) {
    throw new Error(
      "Non trovo `interface Prenotazione` in src/app/prenotazioni/page.tsx",
    );
  }

  return blocco[1];
}

/**
 * I nomi dei campi dichiarati nell'interfaccia TypeScript `Prenotazione`.
 * Le righe di commento (`// ...`) non hanno una parola subito dopo
 * l'indentazione iniziale (iniziano con `/`), quindi non vengono catturate.
 */
function campiInterfacciaPrenotazione(): string[] {
  return [...bloccoInterfacciaPrenotazione().matchAll(/^\s*(\w+)\s*:/gm)].map(
    (m) => m[1],
  );
}

describe("prenotazioni: il campo DATA combacia fra schema Prisma e pagina", () => {
  const campiSchema = campiModelPrenotazione();
  const campiInterfaccia = campiInterfacciaPrenotazione();

  it("[TC-PREN-DATA-001] il test non gira a vuoto", () => {
    expect(campiSchema.length).toBeGreaterThan(0);
    expect(campiInterfaccia.length).toBeGreaterThan(0);
  });

  it("[TC-PREN-DATA-002] lo schema Prisma ha 'data', non 'dataPrenotazione'", () => {
    expect(campiSchema).toContain("data");
    expect(campiSchema).not.toContain("dataPrenotazione");
  });

  it("[TC-PREN-DATA-003] l'interfaccia della pagina usa lo stesso nome dello schema", () => {
    expect(
      campiInterfaccia,
      "L'interfaccia `Prenotazione` non dichiara 'data': se torna a " +
        "chiamarsi 'dataPrenotazione' (o qualsiasi nome diverso da quello " +
        "dello schema), l'unico campo-data mai popolato dall'API resta " +
        "`undefined`, e il codice torna a usare `oraInizio` al suo posto.",
    ).toContain("data");
    expect(campiInterfaccia).not.toContain("dataPrenotazione");
  });

  it("[TC-PREN-DATA-004] anche oraInizio e oraFine restano dichiarati (sono ORARI, non date)", () => {
    // Guardia di non-regressione sul nome: se sparissero dall'interfaccia,
    // `formatOra` non avrebbe piu' nulla da leggere.
    expect(campiInterfaccia).toContain("oraInizio");
    expect(campiInterfaccia).toContain("oraFine");
  });
});

describe("prenotazioni/page.tsx: formatData legge SEMPRE prenotazione.data, mai oraInizio/oraFine", () => {
  it("[TC-PREN-DATA-005] nessuna chiamata a formatData(prenotazione.oraInizio|oraFine)", () => {
    // E' esattamente il difetto riprodotto in produzione: formattare come
    // DATA il campo ORA, ancorato al 1970-01-01 (un giovedi').
    expect(pagina).not.toMatch(/formatData\(\s*prenotazione\.oraInizio\s*\)/);
    expect(pagina).not.toMatch(/formatData\(\s*prenotazione\.oraFine\s*\)/);
  });

  it("[TC-PREN-DATA-006] la card e il suo aria-label leggono entrambi prenotazione.data", () => {
    // Guardia diretta sui due punti d'uso reali: il testo a schermo (riga
    // ~289) e l'aria-label letto dagli screen reader (riga ~262). Se uno dei
    // due regredisse a `oraInizio`, la data mostrata l'utente vedente e
    // quella letta da uno screen reader tornerebbero a disallinearsi.
    const occorrenze = [...pagina.matchAll(/formatData\(\s*prenotazione\.data\s*\)/g)];

    expect(
      occorrenze.length,
      "Mi aspetto almeno due chiamate a `formatData(prenotazione.data)`: " +
        "il testo della card e l'aria-label.",
    ).toBeGreaterThanOrEqual(2);
  });

  it("[TC-PREN-DATA-007] formatOra e formatData delegano agli helper condivisi di tempo-db.ts", () => {
    // Cosi' facendo, entrambe le funzioni ereditano il fuso UTC forzato
    // invece di richiamare `toLocaleDateString`/`toLocaleTimeString` locali
    // (vedi tests/unit/tempo-db.test.ts) e restano in sync con l'area admin.
    expect(pagina).toMatch(/from ["']@\/lib\/tempo-db["']/);
    expect(pagina).toMatch(/formattaOraDb/);
    expect(pagina).toMatch(/formattaDataDb/);
  });
});
