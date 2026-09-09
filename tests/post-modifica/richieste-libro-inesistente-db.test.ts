/**
 * 🧪 TEST DI INTEGRAZIONE (DB) — POST /api/richieste con `libroId` inesistente
 *
 * COSA VERIFICA: che una richiesta di preparazione riferita a un libro che non
 * esiste riceva 404 ("risorsa non trovata") e non un 500 generico.
 *
 * PERCHE': l'handler controllava solo che `libroId` fosse PRESENTE, non che il
 * libro esistesse. La `create` finiva quindi contro il vincolo di chiave
 * esterna `RichiestaPreparazione.libroId -> Libro.id`, PostgreSQL rifiutava con
 * un errore di integrita' (Prisma `P2003`) e il `catch` lo traduceva in 500.
 * Per il client 500 significa "il server e' rotto, riprova": un'interfaccia che
 * rispetta quella semantica riprova all'infinito una richiesta che non potra'
 * mai riuscire, mentre un 404 le dice che il riferimento e' sbagliato. Sul lato
 * server ogni ID inesistente generava un errore di integrita' nei log,
 * rendendo indistinguibili gli input sbagliati dai guasti veri.
 *
 * STRATEGIA: handler reale contro il DB di test; l'unico mock e' `@/lib/auth`
 * (la sessione), perche' l'intestatario della richiesta deriva dalla sessione e
 * non dal body. La fixture crea un utente e un libro reali via `pg`.
 *
 * 🆔 ID STABILI: `TC-SEC-REQ-0xx`.
 */

import pg from "pg";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  assertTestDatabaseUrl,
  DEFAULT_TEST_DATABASE_URL,
} from "../fixtures/database";

process.env.DATABASE_URL = process.env.DATABASE_URL ?? DEFAULT_TEST_DATABASE_URL;
assertTestDatabaseUrl(process.env.DATABASE_URL);

const authMocks = vi.hoisted(() => {
  class AuthError extends Error {
    constructor(
      public readonly status: 401 | 403 | 404,
      public readonly code: string,
      message: string,
    ) {
      super(message);
      this.name = "AuthError";
    }
  }
  return { AuthError, auth: vi.fn(), requireUser: vi.fn() };
});

vi.mock("@/lib/auth", () => ({
  AuthError: authMocks.AuthError,
  auth: authMocks.auth,
  requireUser: authMocks.requireUser,
}));

const richiesteRoute = await import("@/app/api/richieste/route");

// ─── Fixture ────────────────────────────────────────────────────────────────
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const USER_ID = "tc-sec-req-user";
const USER_EMAIL = "tc-sec-req@biblioflow.test";
const LIBRO_ID = "tc-sec-req-libro";
const LIBRO_ISBN = "9990000000001";

async function pulisciFixture(): Promise<void> {
  // Ordine: prima le righe figlie, poi le padri (vincoli di chiave esterna).
  await pool.query('DELETE FROM "RichiestaPreparazione" WHERE "userId" = $1', [USER_ID]);
  await pool.query('DELETE FROM "Libro" WHERE id = $1', [LIBRO_ID]);
  await pool.query('DELETE FROM "User" WHERE id = $1', [USER_ID]);
}

beforeAll(async () => {
  await pulisciFixture();
  await pool.query(
    `INSERT INTO "User" (id, email, nome, cognome, ruolo, "createdAt", "updatedAt")
     VALUES ($1, $2, 'Req', 'Test', 'STUDENTE', now(), now())`,
    [USER_ID, USER_EMAIL],
  );
  await pool.query(
    `INSERT INTO "Libro" (id, isbn, titolo, autore, "createdAt", "updatedAt")
     VALUES ($1, $2, 'Libro di prova', 'Autore di prova', now(), now())`,
    [LIBRO_ID, LIBRO_ISBN],
  );
});

afterAll(async () => {
  await pulisciFixture();
  await pool.end();
});

beforeEach(async () => {
  authMocks.requireUser.mockReset();
  authMocks.requireUser.mockResolvedValue({
    id: USER_ID,
    email: USER_EMAIL,
    nome: "Req",
    cognome: "Test",
    ruolo: "STUDENTE" as const,
    matricola: null,
    isPendolare: false,
    necessitaAccessibilita: false,
  });

  // Ogni test parte senza richieste pregresse dell'utente di fixture.
  await pool.query('DELETE FROM "RichiestaPreparazione" WHERE "userId" = $1', [USER_ID]);
});

function post(body: unknown) {
  return new NextRequest("http://localhost/api/richieste", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/richieste — riferimento a un libro inesistente", () => {
  it("[TC-SEC-REQ-001] risponde 404 (non 500) se il libro non esiste", async () => {
    const response = await richiesteRoute.POST(
      post({ libroId: "libro-che-non-esiste-mai" }),
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(String(body.error)).toMatch(/libro/i);
  });

  it("[TC-SEC-REQ-002] nessuna richiesta viene scritta quando il libro non esiste", async () => {
    // PERCHE': il 404 deve arrivare PRIMA della scrittura. Se l'handler
    // tentasse comunque la `create` e si limitasse a riscrivere lo status,
    // il DB registrerebbe errori di integrita' a ogni tentativo.
    await richiesteRoute.POST(post({ libroId: "un-altro-id-inesistente" }));

    const { rows } = await pool.query(
      'SELECT count(*)::int AS n FROM "RichiestaPreparazione" WHERE "userId" = $1',
      [USER_ID],
    );
    expect(rows[0].n).toBe(0);
  });

  it("[TC-SEC-REQ-003] `libroId` di tipo errato viene rifiutato con 400, non con un 500", async () => {
    // Un valore non stringa (qui un oggetto) non arriva nemmeno alla `where`
    // di Prisma: verrebbe rifiutato come errore di validazione → 500.
    const response = await richiesteRoute.POST(post({ libroId: { $ne: null } }));

    expect(response.status).toBe(400);
  });

  it("[TC-SEC-REQ-004] non-regressione: con un libro esistente la richiesta viene creata (201)", async () => {
    const response = await richiesteRoute.POST(
      post({ libroId: LIBRO_ID, note: "Ritiro nel pomeriggio" }),
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.success).toBe(true);
    // L'intestatario deriva SEMPRE dalla sessione, mai dal body (rilievo C-6).
    expect(body.data.userId).toBe(USER_ID);
    expect(body.data.libroId).toBe(LIBRO_ID);
  });
});
