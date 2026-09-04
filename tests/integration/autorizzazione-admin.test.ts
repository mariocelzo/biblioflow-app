/**
 * 🧪 TEST DI INTEGRAZIONE — AUTORIZZAZIONE SU ROTTE ADMIN E LISTA D'ATTESA (Jira BIB-57)
 *
 * Trello "Test di autorizzazione su admin e coda" — criterio di accettazione CA-01
 * ("identità e autorizzazione derivano SOLO dalla sessione").
 *
 * Obiettivo: dopo le modifiche al middleware della Fase 3 (BIB-51: il matcher
 * dichiara esplicitamente `/api/prenotazioni/coda/:path*` e le API senza cookie di
 * sessione ricevono 401) verificare che la protezione delle rotte amministrative e
 * dei nuovi endpoint della coda non abbia falle, e che il comportamento COINCIDA
 * con la matrice di Fase 1: `docs/analisi/matrice-ruoli-operazioni-as-is.md`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 🎭 STRATEGIA — SUITE MOCK-BASED (nessun DB)
 * Stesso modello di `tests/integration/auth-prenotazioni.test.ts`:
 *   - `vi.hoisted` per creare i mock prima del sollevamento di `vi.mock`;
 *   - `vi.mock("@/lib/auth")` con una `MockAuthError` che replica la classe reale
 *     (campi `status` / `code`), più `auth()` e `requireUser()` come `vi.fn()`;
 *   - `vi.mock("@/lib/prisma")` con un client finto: i test si fermano SEMPRE su un
 *     ramo deterministico PRIMA di qualunque query pesante, oppure usano un mock che
 *     risolve un valore innocuo;
 *   - import diretto dei route handler, `new NextRequest(...)`, asserzioni su
 *     `response.status` (ed eventualmente sul body JSON).
 *
 * Le rotte admin usano `auth()` (helper NextAuth) e controllano il ruolo nel
 * handler; la rotta `coda` usa `requireUser()` di `@/lib/auth`, che lancia
 * `AuthError(401)` quando la sessione manca. Entrambi i percorsi sono coperti.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 🆔 ID STABILI — `TC-BIB57-NNN`
 * Raggruppati per scenario della card:
 *   00x  rotte admin senza sessione                → 401
 *   01x  STUDENTE su rotta admin                   → 403
 *   02x  BIBLIOTECARIO su rotta prevista           → accesso consentito (NON 401/403)
 *   03x  PATCH /api/admin/utenti/[id]              → solo ADMIN (BIBLIOTECARIO 403, ADMIN ok)
 *   04x  nuovi endpoint coda senza sessione        → 401 con body coerente
 *   05x  ex FALLE NOTE (GET posti/[id], GET+PATCH richieste) — CHIUSE in fix(security):
 *        401 senza sessione, 403 per lo STUDENTE (tripwire di regressione)
 */

import { NextRequest } from "next/server";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// ─────────────────────────────────────────────────────────────────────────────
// MOCK CONDIVISI — creati in `vi.hoisted` così da essere referenziabili dalle
// factory di `vi.mock` (che vengono sollevate in cima al modulo).
// ─────────────────────────────────────────────────────────────────────────────
const mocks = vi.hoisted(() => {
  /**
   * Replica minimale di `AuthError` (`src/lib/auth.ts`): il route handler della
   * coda fa `error instanceof AuthError`, quindi la classe usata nei test DEVE
   * essere la stessa esportata dal mock di `@/lib/auth`.
   */
  class MockAuthError extends Error {
    constructor(
      public readonly status: 401 | 403 | 404,
      public readonly code: string,
      message: string,
    ) {
      super(message);
      this.name = "AuthError";
    }
  }

  // Helper di sessione mockati: `auth()` per le rotte admin, `requireUser()` per la coda.
  const auth = vi.fn();
  const requireUser = vi.fn();

  /**
   * Client Prisma finto. Ogni test o si ferma su un ramo di validazione PRIMA di
   * toccare questi metodi, oppure imposta esplicitamente il valore risolto qui
   * sotto. `vi.resetAllMocks()` nel `beforeEach` azzera le implementazioni tra un
   * test e l'altro, perciò nessun valore "sporca" i test successivi.
   */
  const prisma = {
    $transaction: vi.fn(),
    prenotazione: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      groupBy: vi.fn(),
    },
    posto: { findUnique: vi.fn(), update: vi.fn() },
    user: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn(), count: vi.fn() },
    listaAttesa: { findMany: vi.fn() },
    logEvento: { create: vi.fn(), count: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    notifica: { create: vi.fn() },
    // Modello usato solo dalle FALLE NOTE su `/api/admin/richieste`.
    richiestaPreparazione: { findMany: vi.fn(), update: vi.fn() },
  };

  return { MockAuthError, auth, requireUser, prisma };
});

// `@/lib/auth`: sostituito integralmente. Espone SOLO ciò che i handler importano
// (`auth`, `requireUser`, `AuthError`). La `AuthError` esportata è la MockAuthError,
// così `instanceof` nel handler della coda funziona.
vi.mock("@/lib/auth", () => ({
  AuthError: mocks.MockAuthError,
  auth: mocks.auth,
  requireUser: mocks.requireUser,
}));

// `@/lib/prisma`: sia default che named export puntano allo stesso client finto
// (le rotte admin fanno `import db from "@/lib/prisma"`, la coda e `richieste`
// fanno `import { prisma } from "@/lib/prisma"`).
vi.mock("@/lib/prisma", () => ({ default: mocks.prisma, prisma: mocks.prisma }));

// ─────────────────────────────────────────────────────────────────────────────
// IMPORT DINAMICI DEI ROUTE HANDLER — dopo i mock (come in auth-prenotazioni.test.ts).
// ─────────────────────────────────────────────────────────────────────────────
type AdminPrenotazioniRoute = typeof import("@/app/api/admin/prenotazioni/route");
type AdminStatisticheRoute = typeof import("@/app/api/admin/statistiche/route");
type AdminAnomalieRoute = typeof import("@/app/api/admin/anomalie/route");
type AdminUtenteRoute = typeof import("@/app/api/admin/utenti/[id]/route");
type AdminPostoRoute = typeof import("@/app/api/admin/posti/[id]/route");
type AdminRichiesteRoute = typeof import("@/app/api/admin/richieste/route");
type CodaRoute = typeof import("@/app/api/prenotazioni/coda/route");

let adminPrenotazioni: AdminPrenotazioniRoute;
let adminStatistiche: AdminStatisticheRoute;
let adminAnomalie: AdminAnomalieRoute;
let adminUtente: AdminUtenteRoute;
let adminPosto: AdminPostoRoute;
let adminRichieste: AdminRichiesteRoute;
let coda: CodaRoute;

beforeAll(async () => {
  [
    adminPrenotazioni,
    adminStatistiche,
    adminAnomalie,
    adminUtente,
    adminPosto,
    adminRichieste,
    coda,
  ] = await Promise.all([
    import("@/app/api/admin/prenotazioni/route"),
    import("@/app/api/admin/statistiche/route"),
    import("@/app/api/admin/anomalie/route"),
    import("@/app/api/admin/utenti/[id]/route"),
    import("@/app/api/admin/posti/[id]/route"),
    import("@/app/api/admin/richieste/route"),
    import("@/app/api/prenotazioni/coda/route"),
  ]);
});

beforeEach(() => {
  // Azzera implementazioni e conteggi di TUTTI i mock (auth, requireUser, prisma.*).
  vi.resetAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
// FIXTURE DI SESSIONE — le tre identità della matrice.
// ─────────────────────────────────────────────────────────────────────────────
const sessioneStudente = {
  user: {
    id: "studente-1",
    email: "studente@biblioflow.test",
    nome: "Sara",
    cognome: "Studente",
    ruolo: "STUDENTE" as const,
    matricola: "S001",
    isPendolare: false,
    necessitaAccessibilita: false,
  },
};

const sessioneBibliotecario = {
  user: {
    id: "bibliotecario-1",
    email: "biblio@biblioflow.test",
    nome: "Bruno",
    cognome: "Bibliotecario",
    ruolo: "BIBLIOTECARIO" as const,
    matricola: null,
    isPendolare: false,
    necessitaAccessibilita: false,
  },
};

const sessioneAdmin = {
  user: {
    id: "admin-1",
    email: "admin@biblioflow.test",
    nome: "Anna",
    cognome: "Admin",
    ruolo: "ADMIN" as const,
    matricola: null,
    isPendolare: false,
    necessitaAccessibilita: false,
  },
};

// Costruttore compatto di NextRequest (stessa forma usata da auth-prenotazioni.test.ts).
function request(
  url: string,
  method: "GET" | "POST" | "PATCH" | "DELETE" = "GET",
  body?: object,
) {
  return new NextRequest(url, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
}

// Secondo argomento dei route handler dinamici (`[id]`): params è una Promise.
function ctx(id = "risorsa-1") {
  return { params: Promise.resolve({ id }) };
}

/**
 * Elenco delle rotte admin "regolari" — quelle che la matrice segna come
 * `❌ / ✅ / ✅` (STUDENTE respinto con 403, staff ammesso): stessa guardia
 * `auth()` + controllo ruolo staff nel handler. Ogni voce sa invocarsi da sola.
 *
 * NB: `GET /api/admin/posti/[id]` NON è in questo elenco per non rinumerare gli
 * ID `it.each` esistenti; dopo fix(security) verifica comunque sessione + ruolo
 * staff ed è coperto singolarmente in 00x (TC-BIB57-007) e 05x (TC-BIB57-050/051).
 */
function rotteAdminRegolari() {
  return [
    {
      // matrice riga: `/api/admin/prenotazioni` POST — `❌ / ✅ / ✅`
      // "auth() più controllo ruolo staff, uguale per tutte le azioni".
      nome: "POST /api/admin/prenotazioni",
      call: () =>
        adminPrenotazioni.POST(
          request("http://localhost/api/admin/prenotazioni", "POST", {}),
        ),
    },
    {
      // matrice riga: `/api/admin/statistiche` GET — `❌ / ✅ / ✅`
      // "auth() più controllo ruolo staff".
      nome: "GET /api/admin/statistiche",
      call: () =>
        adminStatistiche.GET(
          request("http://localhost/api/admin/statistiche?tipo=tasso-noshow"),
        ),
    },
    {
      // matrice riga: `/api/admin/anomalie` POST — `❌ / ✅ / ✅`
      // "auth() più controllo ruolo staff".
      nome: "POST /api/admin/anomalie",
      call: () =>
        adminAnomalie.POST(
          request("http://localhost/api/admin/anomalie", "POST", {}),
        ),
    },
    {
      // matrice riga: `/api/admin/utenti/[id]` GET — `❌ / ✅ / ✅`
      // "auth() più controllo ruolo staff".
      nome: "GET /api/admin/utenti/[id]",
      call: () =>
        adminUtente.GET(
          request("http://localhost/api/admin/utenti/utente-x"),
          ctx("utente-x"),
        ),
    },
    {
      // matrice riga: `/api/admin/utenti/[id]` PATCH — `❌ / ❌ / ✅`
      // Qui interessa solo che SENZA sessione e con STUDENTE risponda 401/403;
      // la distinzione BIBLIOTECARIO→403 è verificata nel blocco dedicato 03x.
      nome: "PATCH /api/admin/utenti/[id]",
      call: () =>
        adminUtente.PATCH(
          request("http://localhost/api/admin/utenti/utente-x", "PATCH", {
            attivo: false,
          }),
          ctx("utente-x"),
        ),
    },
    {
      // matrice riga: `/api/admin/posti/[id]` PATCH — `❌ / ✅ / ✅`
      // "auth() più controllo ruolo staff".
      nome: "PATCH /api/admin/posti/[id]",
      call: () =>
        adminPosto.PATCH(
          request("http://localhost/api/admin/posti/posto-x", "PATCH", {}),
          ctx("posto-x"),
        ),
    },
  ];
}

// ═════════════════════════════════════════════════════════════════════════════
// 00x — ROTTE ADMIN SENZA SESSIONE → 401
// Matrice: "Il middleware ... restituisce 401 quando non trova un cookie di
// sessione. ... se il handler non chiama auth() ...". Qui `auth()` risolve `null`
// (sessione assente) e ogni handler deve tornare 401 PRIMA di leggere il payload.
// ═════════════════════════════════════════════════════════════════════════════
describe("BIB-57 · 00x — rotte admin senza sessione → 401 (CA-01)", () => {
  beforeEach(() => {
    // Nessuna sessione: l'helper NextAuth restituisce null.
    mocks.auth.mockResolvedValue(null);
  });

  const casi = rotteAdminRegolari();

  // Un test per rotta, con ID stabile progressivo TC-BIB57-001..006.
  it.each(casi.map((c, i) => ({ id: 1 + i, ...c })))(
    "TC-BIB57-00$id: $nome senza sessione risponde 401",
    async ({ call }) => {
      const response = await call();
      expect(response.status).toBe(401);
    },
  );

  it("TC-BIB57-007: GET /api/admin/posti/[id] senza sessione risponde 401", async () => {
    // Matrice riga `/api/admin/posti/[id]` GET — `🔐`: "auth() senza controllo
    // ruolo". La sessione È comunque verificata, quindi senza sessione → 401.
    mocks.auth.mockResolvedValue(null);
    const response = await adminPosto.GET(
      request("http://localhost/api/admin/posti/posto-x"),
      ctx("posto-x"),
    );
    expect(response.status).toBe(401);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 01x — STUDENTE AUTENTICATO SU ROTTA ADMIN → 403
// Matrice area admin: colonna STUDENTE = `❌` ("Ruolo esplicitamente respinto
// dal route handler con HTTP 403") per tutte le rotte con guardia staff.
// ═════════════════════════════════════════════════════════════════════════════
describe("BIB-57 · 01x — STUDENTE su rotta admin → 403 (CA-01)", () => {
  beforeEach(() => {
    // Sessione valida ma con ruolo non autorizzato all'area admin.
    mocks.auth.mockResolvedValue(sessioneStudente);
  });

  const casi = rotteAdminRegolari();

  // TC-BIB57-010..015, uno per rotta.
  it.each(casi.map((c, i) => ({ id: 10 + i, ...c })))(
    "TC-BIB57-0$id: $nome come STUDENTE risponde 403",
    async ({ call }) => {
      const response = await call();
      expect(response.status).toBe(403);
    },
  );
});

// ═════════════════════════════════════════════════════════════════════════════
// 02x — BIBLIOTECARIO SULLE ROTTE PREVISTE DALLA MATRICE → ACCESSO CONSENTITO
// Matrice area admin: colonna BIBLIOTECARIO = `✅` ("Ruolo esplicitamente
// ammesso dopo auth() e controllo del ruolo"). Il criterio della card è
// "accesso consentito": la guardia NON deve produrre 401/403. Il mock di Prisma
// è impostato per far arrivare il handler a un esito applicativo deterministico
// (200, oppure 400/404 di validazione) — comunque MAI 401/403.
// ═════════════════════════════════════════════════════════════════════════════
describe("BIB-57 · 02x — BIBLIOTECARIO su rotta admin → accesso consentito (CA-01)", () => {
  beforeEach(() => {
    mocks.auth.mockResolvedValue(sessioneBibliotecario);
  });

  it("TC-BIB57-020: POST /api/admin/prenotazioni — guardia superata (NON 401/403)", async () => {
    // Matrice: `/api/admin/prenotazioni` POST `✅` per BIBLIOTECARIO.
    // Body senza `azione` → il handler, PASSATA la guardia, cade nel ramo
    // `default` e risponde 400 "Azione non valida": prova che il ruolo è ammesso.
    const response = await adminPrenotazioni.POST(
      request("http://localhost/api/admin/prenotazioni", "POST", {}),
    );
    expect(response.status).not.toBe(401);
    expect(response.status).not.toBe(403);
    expect(response.status).toBe(400);
  });

  it("TC-BIB57-021: GET /api/admin/statistiche — risponde 200", async () => {
    // Matrice: `/api/admin/statistiche` GET `✅` per BIBLIOTECARIO.
    // `groupBy` mockato a lista vuota → aggregazione degenerata ma valida → 200.
    mocks.prisma.prenotazione.groupBy.mockResolvedValue([]);
    const response = await adminStatistiche.GET(
      request("http://localhost/api/admin/statistiche?tipo=tasso-noshow"),
    );
    expect(response.status).toBe(200);
  });

  it("TC-BIB57-022: POST /api/admin/anomalie — guardia superata (NON 401/403)", async () => {
    // Matrice: `/api/admin/anomalie` POST `✅` per BIBLIOTECARIO.
    // Body senza `azione` → ramo `default` → 400 "Azione non valida".
    const response = await adminAnomalie.POST(
      request("http://localhost/api/admin/anomalie", "POST", {}),
    );
    expect(response.status).not.toBe(401);
    expect(response.status).not.toBe(403);
    expect(response.status).toBe(400);
  });

  it("TC-BIB57-023: GET /api/admin/utenti/[id] — guardia superata (NON 401/403)", async () => {
    // Matrice: `/api/admin/utenti/[id]` GET `✅` per BIBLIOTECARIO.
    // `user.findUnique` → null → il handler, PASSATA la guardia, risponde 404.
    mocks.prisma.user.findUnique.mockResolvedValue(null);
    const response = await adminUtente.GET(
      request("http://localhost/api/admin/utenti/utente-x"),
      ctx("utente-x"),
    );
    expect(response.status).not.toBe(401);
    expect(response.status).not.toBe(403);
    expect(response.status).toBe(404);
  });

  it("TC-BIB57-024: PATCH /api/admin/posti/[id] — guardia superata (NON 401/403)", async () => {
    // Matrice: `/api/admin/posti/[id]` PATCH `✅` per BIBLIOTECARIO.
    // Body senza `stato` → validazione stato → 400 "Stato non valido".
    const response = await adminPosto.PATCH(
      request("http://localhost/api/admin/posti/posto-x", "PATCH", {}),
      ctx("posto-x"),
    );
    expect(response.status).not.toBe(401);
    expect(response.status).not.toBe(403);
    expect(response.status).toBe(400);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 03x — PATCH /api/admin/utenti/[id] È RISERVATA AD ADMIN
// Matrice riga `/api/admin/utenti/[id]` PATCH — `❌ / ❌ / ✅`:
// "auth() più controllo esclusivo ADMIN; vietata l'auto-disattivazione".
// ═════════════════════════════════════════════════════════════════════════════
describe("BIB-57 · 03x — PATCH /api/admin/utenti/[id] solo ADMIN (CA-01)", () => {
  it("TC-BIB57-030: BIBLIOTECARIO NON può attivare/disattivare un utente → 403", async () => {
    // Matrice: colonna BIBLIOTECARIO = `❌` per questa sola riga (diversa da
    // GET utenti, dove lo staff è ammesso). Corrisponde a `AUTH-NEG-008`.
    mocks.auth.mockResolvedValue(sessioneBibliotecario);
    const response = await adminUtente.PATCH(
      request("http://localhost/api/admin/utenti/utente-x", "PATCH", {
        attivo: false,
      }),
      ctx("utente-x"),
    );
    expect(response.status).toBe(403);
    // La modifica non deve nemmeno essere tentata.
    expect(mocks.prisma.user.update).not.toHaveBeenCalled();
  });

  it("TC-BIB57-031: ADMIN è ammesso — guardia di ruolo superata (NON 401/403)", async () => {
    // Matrice: colonna ADMIN = `✅`. `user.findUnique` → null → 404: prova che
    // ADMIN ha superato il controllo esclusivo di ruolo ed è nella logica.
    mocks.auth.mockResolvedValue(sessioneAdmin);
    mocks.prisma.user.findUnique.mockResolvedValue(null);
    const response = await adminUtente.PATCH(
      request("http://localhost/api/admin/utenti/utente-x", "PATCH", {
        attivo: false,
      }),
      ctx("utente-x"),
    );
    expect(response.status).not.toBe(401);
    expect(response.status).not.toBe(403);
    expect(response.status).toBe(404);
  });

  it("TC-BIB57-032: ADMIN raggiunge la regola anti auto-disattivazione → 400", async () => {
    // Matrice: "vietata l'auto-disattivazione". Se l'ADMIN prova a disattivare
    // SE STESSO il handler risponde 400: ulteriore conferma che il ramo ADMIN
    // esegue la logica applicativa (nessun 401/403).
    mocks.auth.mockResolvedValue(sessioneAdmin);
    mocks.prisma.user.findUnique.mockResolvedValue({
      id: sessioneAdmin.user.id,
      email: sessioneAdmin.user.email,
      nome: sessioneAdmin.user.nome,
      cognome: sessioneAdmin.user.cognome,
    });
    const response = await adminUtente.PATCH(
      request(`http://localhost/api/admin/utenti/${sessioneAdmin.user.id}`, "PATCH", {
        attivo: false,
      }),
      ctx(sessioneAdmin.user.id),
    );
    expect(response.status).toBe(400);
    expect(mocks.prisma.user.update).not.toHaveBeenCalled();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 04x — NUOVI ENDPOINT CODA SENZA SESSIONE → 401
// `src/app/api/prenotazioni/coda/route.ts` usa `requireUser()` di `@/lib/auth`,
// che lancia `AuthError(401, "NON_AUTENTICATO", ...)`; `errorResponse()` la
// traduce in `NextResponse.json({ success:false, code, error }, { status:401 })`.
// Middleware BIB-51: il matcher dichiara esplicitamente `/api/prenotazioni/coda/:path*`.
// ═════════════════════════════════════════════════════════════════════════════
describe("BIB-57 · 04x — endpoint coda senza sessione → 401 (CA-01, BIB-51)", () => {
  beforeEach(() => {
    // `requireUser()` come nel percorso reale senza cookie di sessione.
    mocks.requireUser.mockRejectedValue(
      new mocks.MockAuthError(
        401,
        "NON_AUTENTICATO",
        "E' richiesta una sessione autenticata",
      ),
    );
  });

  it("TC-BIB57-040: GET /api/prenotazioni/coda senza sessione → 401 + body coerente", async () => {
    const response = await coda.GET();
    expect(response.status).toBe(401);
    const body = await response.json();
    // Body coerente col contratto di `errorResponse` (success:false + code).
    expect(body).toMatchObject({ success: false, code: "NON_AUTENTICATO" });
  });

  it("TC-BIB57-041: POST /api/prenotazioni/coda senza sessione → 401 + body coerente", async () => {
    const response = await coda.POST(
      request("http://localhost/api/prenotazioni/coda", "POST", {
        postoId: "posto-1",
        data: "2030-01-15",
        oraInizio: "09:00",
        oraFine: "11:00",
      }),
    );
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body).toMatchObject({ success: false, code: "NON_AUTENTICATO" });
    // `requireUser()` lancia PRIMA di leggere il corpo: nessun accesso ai dati.
    expect(mocks.prisma.listaAttesa.findMany).not.toHaveBeenCalled();
  });

  it("TC-BIB57-042: DELETE /api/prenotazioni/coda senza sessione → 401 + body coerente", async () => {
    // Anche l'annullamento della richiesta in coda è protetto allo stesso modo.
    const response = await coda.DELETE(
      request("http://localhost/api/prenotazioni/coda?id=req-1", "DELETE"),
    );
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body).toMatchObject({ success: false, code: "NON_AUTENTICATO" });
  });

  it("TC-BIB57-043: GET /api/prenotazioni/coda con STUDENTE autenticato → accesso consentito", async () => {
    // La coda è un endpoint "utente qualsiasi autenticato" (area CA-05): nessun
    // vincolo di ruolo. Con sessione STUDENTE valida `requireUser()` risolve e il
    // handler risponde 200 con la lista (vuota) delle proprie richieste.
    mocks.requireUser.mockResolvedValue(sessioneStudente.user);
    mocks.prisma.listaAttesa.findMany.mockResolvedValue([]);
    const response = await coda.GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ success: true, count: 0 });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 05x — FALLE DI AUTORIZZAZIONE CHIUSE in fix(security) (ex "FALLE NOTE")
// La matrice AS-IS di Fase 1 segnalava due varchi che la Fase 3 non aveva
// chiuso (era stata irrobustita solo l'area `prenotazioni`):
//   #1  GET /api/admin/posti/[id]        — `auth()` senza controllo ruolo    (M-1 / AUTH-NEG-006)
//   #2  GET e PATCH /api/admin/richieste — nessun `auth()` né controllo ruolo (C-5 / AUTH-NEG-007)
// Entrambi sono stati corretti in fix(security). Questi test ora FISSANO il
// comportamento corretto (401 senza sessione, 403 per lo STUDENTE) e restano
// come tripwire di regressione. Gli ex `it.fails` (051, 054) e gli ex casi
// "FALLA NOTA" (050, 052, 053) sono stati promossi a `it()` normali.
// ═════════════════════════════════════════════════════════════════════════════
describe("BIB-57 · 05x — falle di autorizzazione chiuse in fix(security)", () => {
  // ── FALLA #1 CHIUSA — GET /api/admin/posti/[id] (M-1 / AUTH-NEG-006) ──────
  // Il handler GET ora replica il controllo di ruolo staff già presente nella
  // PATCH: uno STUDENTE autenticato non legge più i dati amministrativi del
  // posto (storico prenotazioni, identità collegate).
  it("TC-BIB57-050: STUDENTE su GET /api/admin/posti/[id] riceve 403 (corretto in fix(security))", async () => {
    // Ex "FALLA NOTA": prima la GET non filtrava il ruolo e rispondeva 404/200.
    // Ora la guardia di ruolo risponde 403 PRIMA di qualunque query: neppure
    // `posto.findUnique` deve essere raggiunto.
    mocks.auth.mockResolvedValue(sessioneStudente);
    mocks.prisma.posto.findUnique.mockResolvedValue(null);
    const response = await adminPosto.GET(
      request("http://localhost/api/admin/posti/posto-x"),
      ctx("posto-x"),
    );
    expect(response.status).toBe(403);
    expect(mocks.prisma.posto.findUnique).not.toHaveBeenCalled();
  });

  it("TC-BIB57-051: [AUTH-NEG-006] STUDENTE su GET /api/admin/posti/[id] è 403 (ex it.fails, corretto in fix(security))", async () => {
    // Ex `it.fails` che documentava la falla aperta: ora la correzione è in
    // codice e il test è un normale `it()` verde. Tripwire di regressione sul
    // controllo di ruolo della GET.
    mocks.auth.mockResolvedValue(sessioneStudente);
    mocks.prisma.posto.findUnique.mockResolvedValue(null);
    const response = await adminPosto.GET(
      request("http://localhost/api/admin/posti/posto-x"),
      ctx("posto-x"),
    );
    expect(response.status).toBe(403);
  });

  // ── FALLA #2 CHIUSA — GET/PATCH /api/admin/richieste (C-5 / AUTH-NEG-007) ─
  // Il file ora importa `auth()` e applica su ENTRAMBI i metodi la guardia
  // "sessione + ruolo staff": senza sessione → 401, STUDENTE → 403, prima di
  // toccare parser del body o database.
  it("TC-BIB57-052: GET /api/admin/richieste senza sessione riceve 401 (corretto in fix(security))", async () => {
    // Ex "FALLA NOTA": prima la GET non chiamava mai `auth()` e serviva i dati.
    mocks.auth.mockResolvedValue(null);
    mocks.prisma.richiestaPreparazione.findMany.mockResolvedValue([]);
    const response = await adminRichieste.GET(
      request("http://localhost/api/admin/richieste"),
    );
    expect(response.status).toBe(401);
    // La guardia risponde prima della query: nessun accesso ai dati.
    expect(mocks.prisma.richiestaPreparazione.findMany).not.toHaveBeenCalled();
  });

  it("TC-BIB57-053: PATCH /api/admin/richieste senza sessione riceve 401 (corretto in fix(security))", async () => {
    // Ex "FALLA NOTA": prima il PATCH eseguiva l'`update` senza autenticazione.
    mocks.auth.mockResolvedValue(null);
    mocks.prisma.richiestaPreparazione.update.mockResolvedValue({
      id: "req-1",
      stato: "COMPLETATA",
    });
    const response = await adminRichieste.PATCH(
      request("http://localhost/api/admin/richieste", "PATCH", {
        id: "req-1",
        stato: "COMPLETATA",
      }),
    );
    expect(response.status).toBe(401);
    // La mutazione non deve nemmeno essere tentata.
    expect(mocks.prisma.richiestaPreparazione.update).not.toHaveBeenCalled();
  });

  it("TC-BIB57-054: [AUTH-NEG-007] STUDENTE su GET /api/admin/richieste è 403 (ex it.fails, corretto in fix(security))", async () => {
    // Ex `it.fails`: promosso a `it()` normale ora che `/api/admin/richieste`
    // applica `auth()` + controllo ruolo staff.
    mocks.auth.mockResolvedValue(sessioneStudente);
    mocks.prisma.richiestaPreparazione.findMany.mockResolvedValue([]);
    const response = await adminRichieste.GET(
      request("http://localhost/api/admin/richieste"),
    );
    expect(response.status).toBe(403);
    expect(mocks.prisma.richiestaPreparazione.findMany).not.toHaveBeenCalled();
  });

  it("TC-BIB57-055: [AUTH-NEG-007] STUDENTE su PATCH /api/admin/richieste è 403 (corretto in fix(security))", async () => {
    // Nuovo caso: copre esplicitamente lo STUDENTE anche sul PATCH (mutazione),
    // non solo sulla GET. La guardia di ruolo blocca prima dell'`update`.
    mocks.auth.mockResolvedValue(sessioneStudente);
    mocks.prisma.richiestaPreparazione.update.mockResolvedValue({
      id: "req-1",
      stato: "COMPLETATA",
    });
    const response = await adminRichieste.PATCH(
      request("http://localhost/api/admin/richieste", "PATCH", {
        id: "req-1",
        stato: "COMPLETATA",
      }),
    );
    expect(response.status).toBe(403);
    expect(mocks.prisma.richiestaPreparazione.update).not.toHaveBeenCalled();
  });
});
