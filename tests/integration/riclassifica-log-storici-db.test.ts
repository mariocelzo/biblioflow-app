// ============================================================================
// Test integrazione — migrazione che riclassifica i LogEvento storici
// ============================================================================
// COSA: esegue su PostgreSQL reale lo SQL di
//       `prisma/migrations/20261015090100_riclassifica_log_storici` su righe
//       scritte con i tipi sbagliati del codice precedente (D-01, D-05).
// PERCHE': una migrazione di dati in produzione non si prova a mano. Il test
//       dimostra che vengono spostate SOLO le righe riconoscibili dai criteri
//       con cui il codice le scriveva, che le altre restano intatte e che
//       rieseguire lo script non cambia nulla.

import { readFileSync } from "node:fs";
import path from "node:path";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  assertTestDatabaseUrl,
  createTestDatabaseClient,
  DEFAULT_TEST_DATABASE_URL,
} from "../fixtures/database";

const databaseUrl = process.env.DATABASE_URL ?? DEFAULT_TEST_DATABASE_URL;
assertTestDatabaseUrl(databaseUrl);
const { prisma, pool } = createTestDatabaseClient(databaseUrl);

const PREFISSO = "cov-mig-";
const UTENTE = `${PREFISSO}utente`;

const sql = readFileSync(
  path.resolve(process.cwd(), "prisma/migrations/20261015090100_riclassifica_log_storici/migration.sql"),
  "utf8",
);
const istruzioni = sql
  .split("\n")
  .filter((riga) => !riga.trimStart().startsWith("--"))
  .join("\n")
  .split(";")
  .map((istruzione) => istruzione.trim())
  .filter(Boolean);

async function eseguiMigrazione() {
  for (const istruzione of istruzioni) {
    await prisma.$executeRawUnsafe(istruzione);
  }
}

async function pulisci() {
  await prisma.logEvento.deleteMany({ where: { id: { startsWith: PREFISSO } } });
  await prisma.user.deleteMany({ where: { id: UTENTE } });
}

async function tipoDi(id: string) {
  return (await prisma.logEvento.findUniqueOrThrow({ where: { id: `${PREFISSO}${id}` } })).tipo;
}

beforeAll(pulisci);
afterAll(async () => {
  await pulisci();
  await prisma.$disconnect();
  await pool.end();
});

beforeEach(async () => {
  await pulisci();
  await prisma.user.create({
    data: { id: UTENTE, email: `${UTENTE}@biblioflow.test`, nome: "Storico", cognome: "Log", ruolo: "STUDENTE" },
  });
  const righe = [
    // Da riclassificare.
    { id: "registrazione", tipo: "PRENOTAZIONE_CREATA", descrizione: `Nuovo utente registrato: ${UTENTE}@biblioflow.test` },
    { id: "estensione", tipo: "PRENOTAZIONE_CREATA", descrizione: "Prenotazione estesa fino alle 15:00 per posto A1" },
    { id: "sollecito", tipo: "PRESTITO_RESTITUITO", dettagli: { prestitoId: "p1", azione: "sollecito" } },
    { id: "sollecito-batch", tipo: "PRESTITO_RESTITUITO", dettagli: { prestitoId: "p2", azione: "sollecito_batch" } },
    { id: "rinnovo", tipo: "PRESTITO_CREATO", dettagli: { prestitoId: "p3", azione: "rinnovo" } },
    // Da lasciare intatte: eventi veri dello stesso tipo.
    { id: "prenotazione-vera", tipo: "PRENOTAZIONE_CREATA", descrizione: "Prenotazione creata per posto A1" },
    { id: "restituzione-vera", tipo: "PRESTITO_RESTITUITO", descrizione: "Libro restituito", dettagli: { prestitoId: "p4" } },
    { id: "prestito-vero", tipo: "PRESTITO_CREATO", descrizione: 'Prestito libro "Dune"' },
  ] as const;
  for (const riga of righe) {
    await prisma.logEvento.create({
      data: {
        id: `${PREFISSO}${riga.id}`,
        tipo: riga.tipo,
        userId: UTENTE,
        descrizione: "descrizione" in riga ? riga.descrizione : null,
        dettagli: "dettagli" in riga ? riga.dettagli : undefined,
      },
    });
  }
});

describe("migrazione 20261015090100_riclassifica_log_storici", () => {
  it("[TC-MIG-001] sposta registrazioni, estensioni, solleciti e rinnovi sui tipi dedicati", async () => {
    await eseguiMigrazione();
    await expect(tipoDi("registrazione")).resolves.toBe("UTENTE_REGISTRATO");
    await expect(tipoDi("estensione")).resolves.toBe("PRENOTAZIONE_ESTESA");
    await expect(tipoDi("sollecito")).resolves.toBe("PRESTITO_SOLLECITATO");
    await expect(tipoDi("sollecito-batch")).resolves.toBe("PRESTITO_SOLLECITATO");
    await expect(tipoDi("rinnovo")).resolves.toBe("PRESTITO_RINNOVATO");
  });

  it("[TC-MIG-002] non tocca gli eventi autentici degli stessi tipi", async () => {
    await eseguiMigrazione();
    await expect(tipoDi("prenotazione-vera")).resolves.toBe("PRENOTAZIONE_CREATA");
    await expect(tipoDi("restituzione-vera")).resolves.toBe("PRESTITO_RESTITUITO");
    await expect(tipoDi("prestito-vero")).resolves.toBe("PRESTITO_CREATO");
  });

  it("[TC-MIG-003] rieseguita una seconda volta non cambia nulla", async () => {
    await eseguiMigrazione();
    const dopoPrima = await prisma.logEvento.findMany({
      where: { id: { startsWith: PREFISSO } },
      orderBy: { id: "asc" },
      select: { id: true, tipo: true },
    });
    await eseguiMigrazione();
    const dopoSeconda = await prisma.logEvento.findMany({
      where: { id: { startsWith: PREFISSO } },
      orderBy: { id: "asc" },
      select: { id: true, tipo: true },
    });
    expect(dopoSeconda).toEqual(dopoPrima);
  });
});
