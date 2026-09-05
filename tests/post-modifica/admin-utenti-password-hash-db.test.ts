/**
 * 🧪 TEST DI INTEGRAZIONE (DB) — `passwordHash` NON esce dagli endpoint admin utente
 * (Jira BIB-57 · fix(security) A-3)
 *
 * CONTESTO — A-3: gli handler `GET /api/admin/utenti/[id]` e
 * `GET /api/admin/utenti/[id]/profilo` leggono l'utente con `db.user.findUnique`
 * SENZA un `select` esplicito. Prima della correzione questo serializzava
 * `passwordHash` (l'hash bcrypt della password) direttamente nel JSON di
 * risposta: information disclosure delle credenziali.
 *
 * CORREZIONE: `src/lib/prisma.ts` dichiara un `omit` globale
 * (`omit: { user: { passwordHash: true } }`) sul client Prisma condiviso. Questo
 * test verifica il comportamento end-to-end contro un DB reale:
 *   1. i due endpoint admin NON includono più `passwordHash` nella risposta;
 *   2. il percorso di login NON è regredito: una query con `select` esplicito
 *      (come quella di `authorize()` in `src/lib/auth.ts`) continua a ricevere
 *      l'hash — è la prova che l'`omit` globale è "sicuro".
 *
 * STRATEGIA: l'unico mock è `@/lib/auth` (sessione ADMIN simulata); `@/lib/prisma`
 * è quello reale. La fixture inserisce un solo utente (con hash) via `pg`.
 * `assertTestDatabaseUrl` impedisce di puntare a un DB non "di test".
 *
 * 🆔 ID STABILI: `TC-BIB57-A3-06x`.
 */

import pg from "pg";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  assertTestDatabaseUrl,
  DEFAULT_TEST_DATABASE_URL,
} from "../fixtures/database";

// `@/lib/prisma` legge `process.env.DATABASE_URL` al momento dell'import e lancia
// se non è configurata: la fissiamo (con fallback al DB di test locale) PRIMA di
// qualunque import dinamico del client.
process.env.DATABASE_URL = process.env.DATABASE_URL ?? DEFAULT_TEST_DATABASE_URL;
assertTestDatabaseUrl(process.env.DATABASE_URL);

// ─── Mock di `@/lib/auth` ────────────────────────────────────────────────────
// Gli handler admin fanno solo `import { auth }`; esponiamo comunque
// `requireUser`/`AuthError` per non rompere altri moduli nel grafo di import.
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

// Import dinamici DOPO il mock (stesso schema di coda-promozione/concorrenza):
// così il mock di `@/lib/auth` è già registrato quando gli handler vengono caricati.
const { prisma } = await import("@/lib/prisma");
const utenteRoute = await import("@/app/api/admin/utenti/[id]/route");
const profiloRoute = await import("@/app/api/admin/utenti/[id]/profilo/route");

// ─── Fixture ────────────────────────────────────────────────────────────────
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const USER_ID = "bib57-a3-user";
const USER_EMAIL = "bib57-a3@biblioflow.test";
// Hash bcrypt fittizio ma di forma valida: è ESATTAMENTE il valore che non deve
// trapelare nelle risposte HTTP.
const PASSWORD_HASH =
  "$2b$10$abcdefghijklmnopqrstuvABCDEFGHIJKLMNOPQRSTUVWX0123456";

async function pulisciFixture(): Promise<void> {
  await pool.query('DELETE FROM "User" WHERE id = $1', [USER_ID]);
}

beforeAll(async () => {
  await pulisciFixture();
  await pool.query(
    `INSERT INTO "User"
       (id, email, "passwordHash", nome, cognome, ruolo, "createdAt", "updatedAt")
     VALUES ($1, $2, $3, 'A3', 'Test', 'STUDENTE', now(), now())`,
    [USER_ID, USER_EMAIL, PASSWORD_HASH],
  );
});

afterAll(async () => {
  await pulisciFixture();
  await pool.end();
});

beforeEach(() => {
  // Sessione ADMIN valida: supera la guardia "sessione + ruolo staff" di
  // entrambi gli handler. `mockReset` prima di `mockResolvedValue` per essere
  // indipendenti da `clearMocks`/`restoreMocks` della config di vitest.
  authMocks.auth.mockReset();
  authMocks.auth.mockResolvedValue({
    user: {
      id: "bib57-a3-admin",
      email: "bib57-a3-admin@biblioflow.test",
      nome: "Anna",
      cognome: "Admin",
      ruolo: "ADMIN" as const,
      matricola: null,
      isPendolare: false,
      necessitaAccessibilita: false,
    },
  });
});

// Secondo argomento dei route handler dinamici (`[id]`): `params` è una Promise.
function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

/**
 * Cerca ricorsivamente la chiave `passwordHash` in un valore JSON (oggetto o
 * array). Serve a garantire che l'hash non compaia a NESSUN livello di
 * annidamento della risposta, non solo sull'oggetto `utente` di primo livello.
 */
function contienePasswordHash(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(contienePasswordHash);
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).some(
      ([chiave, valore]) =>
        chiave === "passwordHash" || contienePasswordHash(valore),
    );
  }
  return false;
}

describe("BIB-57 · A-3 — passwordHash escluso dalle risposte admin utente (fix(security))", () => {
  it("TC-BIB57-A3-060: GET /api/admin/utenti/[id] non espone passwordHash", async () => {
    const response = await utenteRoute.GET(
      new NextRequest(`http://localhost/api/admin/utenti/${USER_ID}`),
      ctx(USER_ID),
    );

    expect(response.status).toBe(200);
    const body = await response.json();

    // Sanity: l'endpoint sta davvero restituendo i dati di QUELL'utente.
    expect(body.utente?.id).toBe(USER_ID);
    expect(body.utente?.email).toBe(USER_EMAIL);

    // Il campo sensibile non deve comparire, né sull'oggetto utente né altrove.
    expect(body.utente).not.toHaveProperty("passwordHash");
    expect(contienePasswordHash(body)).toBe(false);
  });

  it("TC-BIB57-A3-061: GET /api/admin/utenti/[id]/profilo non espone passwordHash", async () => {
    const response = await profiloRoute.GET(
      new NextRequest(`http://localhost/api/admin/utenti/${USER_ID}/profilo`),
      ctx(USER_ID),
    );

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.utente?.id).toBe(USER_ID);
    expect(body.utente).not.toHaveProperty("passwordHash");
    expect(contienePasswordHash(body)).toBe(false);
  });

  it("TC-BIB57-A3-062: il percorso di login NON è regredito — un select esplicito riceve ancora l'hash", async () => {
    // `authorize()` in `src/lib/auth.ts` usa `select: { ..., passwordHash: true }`:
    // un `select` esplicito scavalca l'`omit` globale. È la ragione per cui la
    // correzione A-3 (omit globale) è sicura per l'autenticazione.
    const conSelect = await prisma.user.findUnique({
      where: { id: USER_ID },
      select: { id: true, passwordHash: true },
    });
    expect(conSelect?.passwordHash).toBe(PASSWORD_HASH);

    // Senza `select` esplicito, invece, l'hash è omesso di default: è la stessa
    // query "nuda" usata dagli handler admin.
    const senzaSelect = await prisma.user.findUnique({ where: { id: USER_ID } });
    expect(senzaSelect).not.toBeNull();
    expect(senzaSelect).not.toHaveProperty("passwordHash");
  });
});
