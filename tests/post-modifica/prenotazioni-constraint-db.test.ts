import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  assertTestDatabaseUrl,
  DEFAULT_TEST_DATABASE_URL,
} from "../fixtures/database";

const databaseUrl = process.env.DATABASE_URL ?? DEFAULT_TEST_DATABASE_URL;
const pool = new pg.Pool({ connectionString: databaseUrl });

const userId = "bib24-user";
const salaId = "bib24-sala";
const postoId = "bib24-posto";
const data = "2031-02-11";

async function pulisciFixture(): Promise<void> {
  await pool.query('DELETE FROM "Prenotazione" WHERE "userId" = $1', [userId]);
  await pool.query('DELETE FROM "Posto" WHERE id = $1', [postoId]);
  await pool.query('DELETE FROM "Sala" WHERE id = $1', [salaId]);
  await pool.query('DELETE FROM "User" WHERE id = $1', [userId]);
}

async function inserisciPrenotazione(input: {
  id: string;
  oraInizio: string;
  oraFine: string;
  stato: "CONFERMATA" | "CHECK_IN" | "CANCELLATA" | "NO_SHOW";
}): Promise<void> {
  await pool.query(
    `INSERT INTO "Prenotazione"
      (id, "userId", "postoId", data, "oraInizio", "oraFine", stato, "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, $5, $6, $7, now(), now())`,
    [
      input.id,
      userId,
      postoId,
      data,
      input.oraInizio,
      input.oraFine,
      input.stato,
    ],
  );
}

beforeAll(async () => {
  assertTestDatabaseUrl(databaseUrl);
  await pulisciFixture();
  await pool.query(
    `INSERT INTO "User"
      (id, email, nome, cognome, ruolo, "createdAt", "updatedAt")
     VALUES ($1, 'bib24@biblioflow.test', 'BIB24', 'Test', 'STUDENTE', now(), now())`,
    [userId],
  );
  await pool.query(
    `INSERT INTO "Sala"
      (id, nome, piano, "capienzaMax", "createdAt", "updatedAt")
     VALUES ($1, 'Sala BIB24', 1, 1, now(), now())`,
    [salaId],
  );
  await pool.query(
    `INSERT INTO "Posto"
      (id, numero, "salaId", "coordinataX", "coordinataY", "createdAt", "updatedAt")
     VALUES ($1, 'B24', $2, 0, 0, now(), now())`,
    [postoId, salaId],
  );
});

afterAll(async () => {
  await pulisciFixture();
  await pool.end();
});

describe("vincolo DB anti-sovrapposizione (CA-02)", () => {
  it("[TC-BIB24-DB-001] CHECK_IN continua a occupare lo slot", async () => {
    await inserisciPrenotazione({
      id: "bib24-check-in",
      oraInizio: "09:00",
      oraFine: "11:00",
      stato: "CHECK_IN",
    });

    await expect(
      inserisciPrenotazione({
        id: "bib24-overlap",
        oraInizio: "10:00",
        oraFine: "12:00",
        stato: "CONFERMATA",
      }),
    ).rejects.toMatchObject({ code: "23P01" });
  });

  it("[TC-BIB24-DB-002] ammette intervalli adiacenti", async () => {
    await expect(
      inserisciPrenotazione({
        id: "bib24-adjacent",
        oraInizio: "11:00",
        oraFine: "12:00",
        stato: "CONFERMATA",
      }),
    ).resolves.toBeUndefined();
  });

  it("[TC-BIB24-DB-003] ignora gli stati terminali", async () => {
    await expect(
      inserisciPrenotazione({
        id: "bib24-cancelled",
        oraInizio: "09:30",
        oraFine: "10:30",
        stato: "CANCELLATA",
      }),
    ).resolves.toBeUndefined();

    await expect(
      inserisciPrenotazione({
        id: "bib24-no-show",
        oraInizio: "09:30",
        oraFine: "10:30",
        stato: "NO_SHOW",
      }),
    ).resolves.toBeUndefined();
  });
});
