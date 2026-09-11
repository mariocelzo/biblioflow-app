/**
 * 🧪 TEST DI INTEGRAZIONE (DB) — le route admin utente espongono SOLO i campi
 * dichiarati esplicitamente
 *
 * COSA VERIFICA: che `GET /api/admin/utenti/[id]`, `GET /api/admin/utenti/[id]/profilo`
 * e la `PATCH /api/admin/utenti/[id]` restituiscano un insieme CHIUSO di
 * colonne della tabella `User`, senza i campi di accessibilita' e di preferenza
 * personale.
 *
 * PERCHE': gli handler leggevano l'utente senza `select`, cioe' "tutte le
 * colonne". Oggi l'hash della password non trapela grazie all'`omit` globale in
 * `src/lib/prisma.ts` (verificato da `admin-utenti-password-hash-db.test.ts`),
 * ma restano due problemi concreti:
 *   1. al personale di biblioteca finivano comunque `necessitaAccessibilita`,
 *      `preferenzeAccessibilita` e `tragittoPendolare` — dati su disabilita' e
 *      spostamenti abituali della persona, che non servono a nessuna delle
 *      funzioni admin esistenti (l'interfaccia non li mostra) e che appartengono
 *      a categorie da trattare secondo minimizzazione;
 *   2. e' un difetto "a orologeria": qualunque colonna aggiunta domani a `User`
 *      (un numero di telefono, un documento, un token) finirebbe in risposta da
 *      sola, senza che nessuno debba deciderlo.
 * La correzione replica il pattern gia' adottato in `/api/profilo`
 * (costante `PROFILO_SELECT`): un elenco esplicito, che e' anche l'unico modo
 * per cui un test come questo possa fallire quando lo si viola.
 *
 * NOTA SULLA FORMA DELLA RISPOSTA: questi test fissano anche la struttura
 * (`utente` con `prenotazioni`/`prestiti`/`_count` annidati), perche' passare
 * da `include` a `select` e' proprio il punto in cui si rischia di cambiarla
 * per sbaglio e rompere i consumatori.
 *
 * 🆔 ID STABILI: `TC-SEC-USR-0xx`.
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

const utenteRoute = await import("@/app/api/admin/utenti/[id]/route");
const profiloRoute = await import("@/app/api/admin/utenti/[id]/profilo/route");

// ─── Fixture ────────────────────────────────────────────────────────────────
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const USER_ID = "tc-sec-usr-target";
const USER_EMAIL = "tc-sec-usr@biblioflow.test";
const ADMIN_ID = "tc-sec-usr-admin";

async function pulisciFixture(): Promise<void> {
  await pool.query('DELETE FROM "Notifica" WHERE "userId" = $1', [USER_ID]);
  await pool.query(
    'DELETE FROM "LogEvento" WHERE "userId" = ANY($1) OR "targetUserId" = ANY($1)',
    [[USER_ID, ADMIN_ID]],
  );
  await pool.query('DELETE FROM "User" WHERE id = ANY($1)', [[USER_ID, ADMIN_ID]]);
}

beforeAll(async () => {
  await pulisciFixture();
  // L'utente di fixture ha i campi "sensibili" VALORIZZATI: se trapelassero,
  // il test li troverebbe davvero, non solo come chiave vuota.
  await pool.query(
    `INSERT INTO "User"
       (id, email, nome, cognome, ruolo, "necessitaAccessibilita",
        "preferenzeAccessibilita", "isPendolare", "tragittoPendolare",
        "createdAt", "updatedAt")
     VALUES ($1, $2, 'Utente', 'Sensibile', 'STUDENTE', true,
             '{"lettoreSchermo":true}', true, '{"partenza":"Via Roma 1, Salerno"}',
             now(), now())`,
    [USER_ID, USER_EMAIL],
  );
  await pool.query(
    `INSERT INTO "User" (id, email, nome, cognome, ruolo, "createdAt", "updatedAt")
     VALUES ($1, 'tc-sec-usr-admin@biblioflow.test', 'Anna', 'Admin', 'ADMIN', now(), now())`,
    [ADMIN_ID],
  );
});

afterAll(async () => {
  await pulisciFixture();
  await pool.end();
});

beforeEach(() => {
  authMocks.auth.mockReset();
  authMocks.auth.mockResolvedValue({
    user: {
      id: ADMIN_ID,
      email: "tc-sec-usr-admin@biblioflow.test",
      nome: "Anna",
      cognome: "Admin",
      ruolo: "ADMIN" as const,
      matricola: null,
      isPendolare: false,
      necessitaAccessibilita: false,
    },
  });
});

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

/**
 * Colonne di `User` che il personale di biblioteca ha davvero bisogno di
 * vedere: identita', stato dell'account, anzianita'. E' l'insieme CHIUSO
 * atteso in risposta; qualunque chiave in piu' fa fallire il test.
 */
const CAMPI_AMMESSI = [
  "id",
  "nome",
  "cognome",
  "email",
  "matricola",
  "ruolo",
  "attivo",
  "emailVerificata",
  "isPendolare",
  "ultimoAccesso",
  "createdAt",
];

/**
 * Colonne che NON devono uscire: dati su disabilita', preferenze personali di
 * interfaccia e tragitto casa-biblioteca. Elencate una per una (e non solo
 * "tutto cio' che non e' ammesso") perche' il messaggio di fallimento dica
 * subito QUALE dato e' trapelato.
 */
const CAMPI_VIETATI = [
  "passwordHash",
  "necessitaAccessibilita",
  "preferenzeAccessibilita",
  "tragittoPendolare",
  "altoContrasto",
  "riduzioneMovimento",
  "darkMode",
  "dimensioneTesto",
  "notifichePush",
  "notificheEmail",
  "postoPreferito",
  "salaPreferita",
];

/**
 * Chiavi "scalari" dell'oggetto utente: si escludono le relazioni annidate
 * (`prenotazioni`, `prestiti`, `notifiche`, `_count`), che non sono colonne di
 * `User` e non rientrano in questo rilievo.
 */
function chiaviScalari(utente: Record<string, unknown>): string[] {
  const relazioni = ["prenotazioni", "prestiti", "notifiche", "_count"];
  return Object.keys(utente).filter((chiave) => !relazioni.includes(chiave));
}

describe("GET /api/admin/utenti/[id] — select esplicito", () => {
  it("[TC-SEC-USR-001] non espone i campi di accessibilita' e le preferenze personali", async () => {
    const response = await utenteRoute.GET(
      new NextRequest(`http://localhost/api/admin/utenti/${USER_ID}`),
      ctx(USER_ID),
    );

    expect(response.status).toBe(200);
    const body = await response.json();

    for (const campo of CAMPI_VIETATI) {
      expect(body.utente).not.toHaveProperty(campo);
    }
  });

  it("[TC-SEC-USR-002] restituisce esattamente l'insieme chiuso di campi previsto", async () => {
    const response = await utenteRoute.GET(
      new NextRequest(`http://localhost/api/admin/utenti/${USER_ID}`),
      ctx(USER_ID),
    );
    const body = await response.json();

    expect(chiaviScalari(body.utente).sort()).toEqual([...CAMPI_AMMESSI].sort());
  });

  it("[TC-SEC-USR-003] non-regressione: forma della risposta e statistiche invariate", async () => {
    const response = await utenteRoute.GET(
      new NextRequest(`http://localhost/api/admin/utenti/${USER_ID}`),
      ctx(USER_ID),
    );
    const body = await response.json();

    expect(body.utente.id).toBe(USER_ID);
    expect(body.utente.email).toBe(USER_EMAIL);
    expect(Array.isArray(body.utente.prenotazioni)).toBe(true);
    expect(Array.isArray(body.utente.prestiti)).toBe(true);
    expect(body.statistiche).toMatchObject({
      totalePrenotazioni: 0,
      totalePrestiti: 0,
      noShow: 0,
    });
  });
});

describe("GET /api/admin/utenti/[id]/profilo — select esplicito", () => {
  it("[TC-SEC-USR-004] non espone i campi di accessibilita' e le preferenze personali", async () => {
    const response = await profiloRoute.GET(
      new NextRequest(`http://localhost/api/admin/utenti/${USER_ID}/profilo`),
      ctx(USER_ID),
    );

    expect(response.status).toBe(200);
    const body = await response.json();

    for (const campo of CAMPI_VIETATI) {
      expect(body.utente).not.toHaveProperty(campo);
    }
  });

  it("[TC-SEC-USR-005] restituisce esattamente l'insieme chiuso di campi previsto", async () => {
    const response = await profiloRoute.GET(
      new NextRequest(`http://localhost/api/admin/utenti/${USER_ID}/profilo`),
      ctx(USER_ID),
    );
    const body = await response.json();

    expect(chiaviScalari(body.utente).sort()).toEqual([...CAMPI_AMMESSI].sort());
  });

  it("[TC-SEC-USR-006] non-regressione: relazioni e statistiche restano nella risposta", async () => {
    const response = await profiloRoute.GET(
      new NextRequest(`http://localhost/api/admin/utenti/${USER_ID}/profilo`),
      ctx(USER_ID),
    );
    const body = await response.json();

    expect(Array.isArray(body.utente.prenotazioni)).toBe(true);
    expect(Array.isArray(body.utente.prestiti)).toBe(true);
    expect(Array.isArray(body.utente.notifiche)).toBe(true);
    expect(body.utente._count).toMatchObject({
      prenotazioni: 0,
      prestiti: 0,
      notifiche: 0,
    });
    expect(body.statistiche).toMatchObject({
      prenotazioniCompletate: 0,
      prestitiCompletati: 0,
      noShowCount: 0,
    });
  });
});

describe("PATCH /api/admin/utenti/[id] — select esplicito sull'utente aggiornato", () => {
  it("[TC-SEC-USR-007] l'utente restituito dopo l'aggiornamento non contiene campi sensibili", async () => {
    const response = await utenteRoute.PATCH(
      new NextRequest(`http://localhost/api/admin/utenti/${USER_ID}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ attivo: false }),
      }),
      ctx(USER_ID),
    );

    expect(response.status).toBe(200);
    const body = await response.json();

    // Non-regressione sull'effetto dell'operazione.
    expect(body.success).toBe(true);
    expect(body.utente.attivo).toBe(false);

    for (const campo of CAMPI_VIETATI) {
      expect(body.utente).not.toHaveProperty(campo);
    }
    expect(chiaviScalari(body.utente).sort()).toEqual([...CAMPI_AMMESSI].sort());
  });
});
