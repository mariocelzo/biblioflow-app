import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  assertTestDatabaseUrl,
  DEFAULT_TEST_DATABASE_URL,
} from "../fixtures/database";

const databaseUrl = process.env.DATABASE_URL ?? DEFAULT_TEST_DATABASE_URL;
const pool = new pg.Pool({ connectionString: databaseUrl });

const userId = "bib23-user";
const salaId = "bib23-sala";
const postoId = "bib23-posto";
const data = "2031-02-10";

async function pulisciFixture(): Promise<void> {
  await pool.query('DELETE FROM "ListaAttesa" WHERE "userId" = $1', [userId]);
  await pool.query('DELETE FROM "Posto" WHERE id = $1', [postoId]);
  await pool.query('DELETE FROM "Sala" WHERE id = $1', [salaId]);
  await pool.query('DELETE FROM "User" WHERE id = $1', [userId]);
}

async function inserisciRichiesta(
  id: string,
  oraFine = "11:00",
  createdAt = "2031-01-01T09:00:00.000Z",
): Promise<void> {
  await pool.query(
    `INSERT INTO "ListaAttesa"
      (id, "userId", "postoId", data, "oraInizio", "oraFine", stato, "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, '09:00', $5, 'IN_ATTESA', $6, $6)`,
    [id, userId, postoId, data, oraFine, createdAt],
  );
}

beforeAll(async () => {
  assertTestDatabaseUrl(databaseUrl);
  await pulisciFixture();
  await pool.query(
    `INSERT INTO "User"
      (id, email, nome, cognome, ruolo, "createdAt", "updatedAt")
     VALUES ($1, 'bib23@biblioflow.test', 'BIB23', 'Test', 'STUDENTE', now(), now())`,
    [userId],
  );
  await pool.query(
    `INSERT INTO "Sala"
      (id, nome, piano, "capienzaMax", "createdAt", "updatedAt")
     VALUES ($1, 'Sala BIB23', 1, 1, now(), now())`,
    [salaId],
  );
  await pool.query(
    `INSERT INTO "Posto"
      (id, numero, "salaId", "coordinataX", "coordinataY", "createdAt", "updatedAt")
     VALUES ($1, 'B23', $2, 0, 0, now(), now())`,
    [postoId, salaId],
  );
});

afterAll(async () => {
  await pulisciFixture();
  await pool.end();
});

describe("ListaAttesa a livello PostgreSQL (CA-03)", () => {
  it("[TC-BIB23-DB-001] rifiuta due richieste IN_ATTESA per lo stesso intervallo", async () => {
    await inserisciRichiesta("bib23-richiesta-001");

    await expect(
      inserisciRichiesta("bib23-richiesta-002"),
    ).rejects.toMatchObject({ code: "23505" });
  });

  it("[TC-BIB23-DB-002] consente il rientro dopo annullamento", async () => {
    await pool.query(
      'UPDATE "ListaAttesa" SET stato = \'ANNULLATA\' WHERE id = $1',
      ["bib23-richiesta-001"],
    );

    await expect(
      inserisciRichiesta("bib23-richiesta-003"),
    ).resolves.toBeUndefined();
  });

  it("[TC-BIB23-DB-003] considera oraFine parte dell'intervallo", async () => {
    await expect(
      inserisciRichiesta("bib23-richiesta-004", "12:00"),
    ).resolves.toBeUndefined();
  });

  it("[TC-BIB23-DB-004] usa id come tie-breaker FIFO", async () => {
    await pool.query('DELETE FROM "ListaAttesa" WHERE "userId" = $1', [userId]);
    await inserisciRichiesta("bib23-fifo-b");
    await inserisciRichiesta("bib23-fifo-a", "12:00");

    const result = await pool.query<{ id: string }>(
      `SELECT id FROM "ListaAttesa"
       WHERE "postoId" = $1 AND data = $2 AND stato = 'IN_ATTESA'
       ORDER BY "createdAt" ASC, id ASC`,
      [postoId, data],
    );

    expect(result.rows.map((row) => row.id)).toEqual([
      "bib23-fifo-a",
      "bib23-fifo-b",
    ]);
  });
});
