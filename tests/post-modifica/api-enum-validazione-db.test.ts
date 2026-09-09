/**
 * 🧪 TEST DI INTEGRAZIONE (DB) — parametri enum non validati sulle GET
 *
 * COSA VERIFICA: che un valore di query string che NON appartiene all'enum
 * Prisma corrispondente produca una risposta 422 ("valore non ammesso") e non
 * un 500 generico.
 *
 * PERCHE': in `/api/prenotazioni`, `/api/posti` e `/api/admin/richieste` il
 * valore grezzo di `?stato=` finiva direttamente dentro la clausola `where` su
 * una colonna enum. Prisma valida gli enum lato client e lancia una
 * `PrismaClientValidationError`, che il `catch` degli handler traduceva nel
 * generico 500 "errore del server". Conseguenze:
 *   1. il client non riesce a distinguere un proprio input sbagliato da un
 *      guasto reale del backend (nessuna possibilita' di correggersi);
 *   2. i 500 spuri inquinano il monitoraggio (Sentry) e nascondono i guasti
 *      veri;
 *   3. il messaggio di errore Prisma, se un domani venisse propagato al client
 *      da una modifica distratta del catch, elencherebbe i valori ammessi e i
 *      nomi delle colonne.
 * Il pattern corretto e' gia' applicato nella PATCH di `/api/admin/richieste`
 * (validazione contro `Object.values(StatoRichiesta)` → 422): questi test
 * estendono lo stesso contratto alle GET.
 *
 * STRATEGIA: gli handler girano contro il DB di test reale; l'unico mock e'
 * `@/lib/auth` (sessione simulata), perche' e' l'identita' a decidere cosa si
 * puo' leggere, non l'oggetto della verifica qui. `assertTestDatabaseUrl`
 * impedisce di puntare per errore a un database non di test.
 *
 * 🆔 ID STABILI: `TC-SEC-ENUM-0xx`.
 */

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  assertTestDatabaseUrl,
  DEFAULT_TEST_DATABASE_URL,
} from "../fixtures/database";

// `@/lib/prisma` legge `DATABASE_URL` all'import e lancia se manca: va fissata
// PRIMA di qualunque import dinamico del client.
process.env.DATABASE_URL = process.env.DATABASE_URL ?? DEFAULT_TEST_DATABASE_URL;
assertTestDatabaseUrl(process.env.DATABASE_URL);

// ─── Mock di `@/lib/auth` ────────────────────────────────────────────────────
// Le tre route usano helper diversi (`requireUser` per l'area utente, `auth`
// per l'area admin): il modulo mock li espone entrambi, piu' `AuthError` che
// gli handler usano per mappare gli status.
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

// Import dinamici DOPO il mock, cosi' gli handler lo vedono gia' registrato.
const prenotazioniRoute = await import("@/app/api/prenotazioni/route");
const postiRoute = await import("@/app/api/posti/route");
const adminRichiesteRoute = await import("@/app/api/admin/richieste/route");

// Utente di sessione "finto": non deve esistere sul DB, perche' le GET sotto
// esame falliscono (o devono fallire) PRIMA di qualunque risultato utile.
const UTENTE_SESSIONE = {
  id: "tc-sec-enum-user",
  email: "tc-sec-enum@biblioflow.test",
  nome: "Enum",
  cognome: "Test",
  ruolo: "STUDENTE" as const,
  matricola: null,
  isPendolare: false,
  necessitaAccessibilita: false,
};

beforeEach(() => {
  authMocks.requireUser.mockReset();
  authMocks.requireUser.mockResolvedValue(UTENTE_SESSIONE);

  authMocks.auth.mockReset();
  authMocks.auth.mockResolvedValue({
    user: { ...UTENTE_SESSIONE, ruolo: "ADMIN" as const },
  });
});

describe("GET /api/prenotazioni — filtro ?stato non validato", () => {
  it("[TC-SEC-ENUM-001] risponde 422 (non 500) se `stato` non e' un valore di StatoPrenotazione", async () => {
    const response = await prenotazioniRoute.GET(
      new NextRequest("http://localhost/api/prenotazioni?stato=PIPPO"),
    );

    expect(response.status).toBe(422);
    const body = await response.json();
    // Il messaggio deve elencare i valori ammessi: e' l'informazione che
    // permette al client di correggere la richiesta da solo.
    expect(String(body.error)).toContain("CONFERMATA");
  });

  it("[TC-SEC-ENUM-002] continua ad accettare un valore legittimo dell'enum", async () => {
    // Test di non-regressione: la validazione non deve chiudere la porta ai
    // filtri validi. L'utente di sessione non ha prenotazioni, quindi ci si
    // aspetta 200 con lista vuota.
    const response = await prenotazioniRoute.GET(
      new NextRequest("http://localhost/api/prenotazioni?stato=CONFERMATA"),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
  });
});

describe("GET /api/posti — filtro ?stato non validato", () => {
  it("[TC-SEC-ENUM-003] risponde 422 (non 500) se `stato` non e' un valore di StatoPosto", async () => {
    const response = await postiRoute.GET(
      new NextRequest("http://localhost/api/posti?stato=NON_ESISTE"),
    );

    expect(response.status).toBe(422);
    const body = await response.json();
    expect(String(body.error)).toContain("DISPONIBILE");
  });

  it("[TC-SEC-ENUM-004] continua ad accettare un valore legittimo dell'enum", async () => {
    const response = await postiRoute.GET(
      new NextRequest("http://localhost/api/posti?stato=DISPONIBILE"),
    );

    expect(response.status).toBe(200);
  });
});

describe("GET /api/admin/richieste — filtro ?stato non validato", () => {
  it("[TC-SEC-ENUM-005] risponde 422 (non 500) se `stato` non e' un valore di StatoRichiesta", async () => {
    const response = await adminRichiesteRoute.GET(
      new NextRequest("http://localhost/api/admin/richieste?stato=QUALSIASI"),
    );

    expect(response.status).toBe(422);
    const body = await response.json();
    expect(String(body.error)).toContain("PENDENTE");
  });

  it("[TC-SEC-ENUM-006] continua ad accettare un valore legittimo dell'enum", async () => {
    const response = await adminRichiesteRoute.GET(
      new NextRequest("http://localhost/api/admin/richieste?stato=PENDENTE"),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
  });

  it("[TC-SEC-ENUM-007] la validazione NON precede il controllo di autorizzazione", async () => {
    // PERCHE': un 422 restituito prima della verifica del ruolo direbbe a un
    // anonimo che l'endpoint esiste e quali valori accetta. L'ordine corretto
    // e' sempre "prima chi sei, poi cosa chiedi".
    authMocks.auth.mockResolvedValue(null);

    const response = await adminRichiesteRoute.GET(
      new NextRequest("http://localhost/api/admin/richieste?stato=QUALSIASI"),
    );

    expect(response.status).toBe(401);
  });
});
