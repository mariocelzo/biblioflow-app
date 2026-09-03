/**
 * 🧪 TEST END-TO-END — CICLO "INGRESSO IN CODA → PROMOZIONE" (Jira BIB-58, CA-03 / CA-04)
 *
 * Trello "Test end-to-end del ciclo coda-promozione".
 *
 * A differenza dei test unitari (`tests/unit/admin-prenotazioni*.test.ts` e
 * `tests/unit/prenotazioni-service.test.ts`), che isolano ogni pezzo con delle
 * spie, qui si esercita l'INTERO percorso contro un PostgreSQL reale (container
 * `biblioflow-test-db` su 127.0.0.1:5433, schema completo con il vincolo
 * `EXCLUDE Prenotazione_no_overlap_attiva_excl` anti-sovrapposizione):
 *
 *   POST /api/prenotazioni/coda   (handler REALE)  →  entraInCoda() [dominio]
 *   POST /api/admin/prenotazioni  (handler REALE)  →  promuoviPrimoInCoda() [dominio]
 *                                                  →  Notifica + LogEvento + evento realtime
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 🔐 SESSIONI SIMULATE + PRISMA REALE
 * L'unico modulo mockato è `@/lib/auth`: si sostituiscono `requireUser` (usato
 * dalla route di coda) e `auth` (usato dalla route admin) con delle `vi.fn()`,
 * il cui valore di ritorno viene impostato subito prima di ogni chiamata alla
 * route per "impersonare" di volta in volta lo studente B o il bibliotecario
 * (stesso approccio di `tests/integration/auth-prenotazioni.test.ts`).
 * TUTTO il resto è reale: `@/lib/prisma` (singleton condiviso da entrambe le
 * route e da questo file), il servizio di dominio `prenotazioni-service`, la
 * generazione di Notifica/LogEvento e l'emitter realtime in-memory.
 * NB: `@/lib/env` NON viene mockato — l'unico modulo della catena che lo importa
 * è `@/lib/auth`, che qui è già interamente sostituito, quindi lo `zod`
 * `process.exit(1)` di `env.ts` non viene mai raggiunto.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 🧹 PULIZIA — SCOPED, MAI GLOBALE
 * I file di test girano in parallelo sullo STESSO database. Un
 * `resetTestDatabase()` globale cancellerebbe le fixture degli altri file e, con
 * più worker che fanno `deleteMany` sull'intera tabella in transazioni
 * Serializable, va in deadlock (vedi `concorrenza.test.ts` / `automazioni.test.ts`).
 * Qui si ripuliscono SOLO le righe con prefisso `bib58-*` (in `beforeAll`,
 * `beforeEach` e `afterAll`), in ordine sicuro rispetto alle foreign key. Il
 * file non lascia righe.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 🚧 GATE ANTI-CONTESA CON `concorrenza.test.ts`
 * La promozione (`promuoviPrimoInCoda`) fa un `INSERT` su `Prenotazione` dentro
 * una transazione Serializable. `concorrenza.test.ts` spara molti INSERT
 * concorrenti sulla stessa tabella; sotto SSI, con tabelle piccole (seq scan →
 * predicate lock a livello di relazione), due INSERT Serializable concorrenti —
 * anche su posti/date diversi — possono abortire a vicenda con `40001`/`40P01`.
 * Conseguenze: (a) `promuoviPrimoInCoda` assorbe l'errore e ritorna `null`
 * (falso negativo per noi); (b) `concorrenza.test.ts` potrebbe uscire con zero
 * 201 (regressione). Per evitarlo si attende — usando la fixture `bib38-posto`
 * di quel file come semaforo — che `concorrenza.test.ts` non sia in volo prima
 * di eseguire la cancellazione admin. In più, `retry` sui `describe` è la rete
 * di sicurezza residua: al retry il `beforeEach` ripulisce e il caso riparte da
 * capo con dati puliti.
 */

import { NextRequest } from "next/server";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  assertTestDatabaseUrl,
  DEFAULT_TEST_DATABASE_URL,
} from "../fixtures/database";

// ─── Mock di `@/lib/auth` (sessioni simulate) ──────────────────────────────
// `vi.hoisted` porta la definizione sopra gli import: le `vi.fn()` esistono già
// quando la factory di `vi.mock` viene valutata e quando le route le importano.
const authMocks = vi.hoisted(() => {
  // Riproduzione minimale di `AuthError`: la route di coda fa
  // `error instanceof AuthError` nel suo `errorResponse`, quindi il simbolo deve
  // esistere ed essere una classe (nel percorso "happy" non viene comunque usata).
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

  return { AuthError, requireUser: vi.fn(), auth: vi.fn() };
});

vi.mock("@/lib/auth", () => ({
  AuthError: authMocks.AuthError,
  requireUser: authMocks.requireUser,
  auth: authMocks.auth,
}));

// La `@/lib/prisma` NON è mockata: `assertTestDatabaseUrl` protegge comunque da
// un puntamento accidentale a un DB non "di test".
const databaseUrl = process.env.DATABASE_URL ?? DEFAULT_TEST_DATABASE_URL;
assertTestDatabaseUrl(databaseUrl);

// Import dinamici DOPO il mock (come in `concorrenza.test.ts`): così il mock di
// `@/lib/auth` è già registrato quando le route vengono caricate.
const { prisma } = await import("@/lib/prisma");
const codaRoute = await import("@/app/api/prenotazioni/coda/route");
const adminRoute = await import("@/app/api/admin/prenotazioni/route");

// ─── Identificatori delle fixture (prefisso `bib58-` per la pulizia scoped) ──

const USER_A = "bib58-userA"; // ha la prenotazione CONFERMATA che verrà cancellata
const USER_B = "bib58-userB"; // entra in coda e deve essere promosso
const LIBRARIAN = "bib58-lib"; // esegue la cancellazione dalla rotta admin
const UTENTI = [USER_A, USER_B, LIBRARIAN] as const;
const SALA_ID = "bib58-sala";
const POSTO_ID = "bib58-posto";
const PREN_A_ID = "bib58-pren-a";

// ─── Slot deterministico: oggi + 3 giorni, 09:00–11:00 ─────────────────────
// Data nel futuro ⇒ `validaIntervallo` non scatta ("DATA_NEL_PASSATO"); lo slot
// 09:00–11:00 (120 min) sta dentro l'orario di default della sala (08:00–22:00)
// e rispetta durata minima/massima. Niente fake timers: si usano date reali.

function slotFuturo(giorni: number): { iso: string; data: Date } {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + giorni);
  const anno = d.getUTCFullYear();
  const mese = d.getUTCMonth() + 1;
  const giorno = d.getUTCDate();
  const iso = `${anno}-${String(mese).padStart(2, "0")}-${String(giorno).padStart(2, "0")}`;
  // Prisma rappresenta `@db.Date` come mezzanotte UTC.
  return { iso, data: new Date(Date.UTC(anno, mese - 1, giorno)) };
}

const SLOT = slotFuturo(3);
// Prisma rappresenta `@db.Time` con la data fittizia 1970-01-01 UTC.
const ORA_INIZIO = new Date("1970-01-01T09:00:00.000Z");
const ORA_FINE = new Date("1970-01-01T11:00:00.000Z");

// ─── Sessioni simulate ────────────────────────────────────────────────────

/** Forma di `AuthenticatedUser` attesa da `requireUser()` nella route di coda. */
function sessioneStudente(id: string) {
  return {
    id,
    email: `${id}@biblioflow.test`,
    nome: "Utente",
    cognome: id === USER_A ? "A" : "B",
    ruolo: "STUDENTE" as const,
    matricola: id.toUpperCase(),
    isPendolare: false,
    necessitaAccessibilita: false,
  };
}

/** Forma di `Session` attesa da `auth()` nella route admin (serve `ruolo` staff). */
function sessioneBibliotecario() {
  return {
    user: {
      id: LIBRARIAN,
      email: `${LIBRARIAN}@biblioflow.test`,
      nome: "Biblio",
      cognome: "Tecario",
      ruolo: "BIBLIOTECARIO" as const,
      matricola: null,
      isPendolare: false,
      necessitaAccessibilita: false,
    },
  };
}

// ─── Helper di richiesta ──────────────────────────────────────────────────

function richiestaJson(url: string, body: unknown) {
  return new NextRequest(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Accesso tipizzato al campo Json `LogEvento.dettagli`. */
function dettagli(log: { dettagli: unknown }): Record<string, unknown> {
  return (log.dettagli ?? {}) as Record<string, unknown>;
}

// ─── Gate anti-contesa con `concorrenza.test.ts` ──────────────────────────

const attesa = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** `true` finché `concorrenza.test.ts` tiene viva la sua fixture `bib38-posto`. */
async function concorrenzaAttiva(): Promise<boolean> {
  const righe = await prisma.$queryRaw<Array<{ presente: boolean }>>`
    SELECT EXISTS(SELECT 1 FROM "Posto" WHERE id = 'bib38-posto') AS presente
  `;
  return righe[0]?.presente === true;
}

/**
 * @param attendiComparsa se `true` (solo in `beforeAll`) concede fino a 4s a
 *   `concorrenza.test.ts` per creare la sua fixture; se non compare, quel file
 *   ha già finito oppure girerà dopo di noi sullo stesso worker: nessuna
 *   sovrapposizione. Poi, in ogni caso, attende che la fixture SCOMPAIA
 *   (cap 90s: in pratica i pochi secondi di durata di quel file).
 */
async function gateConcorrenza(attendiComparsa: boolean): Promise<void> {
  if (attendiComparsa) {
    const t0 = Date.now();
    while (Date.now() - t0 < 4_000) {
      if (await concorrenzaAttiva()) break;
      await attesa(200);
    }
  }
  const t1 = Date.now();
  while (Date.now() - t1 < 90_000) {
    if (!(await concorrenzaAttiva())) return;
    await attesa(250);
  }
}

// ─── Pulizia SCOPED (solo righe `bib58-*`), in ordine sicuro per le FK ─────

async function pulisciBib58(): Promise<void> {
  // `LogEvento` per primo: referenzia `User` (userId/targetUserId) e
  // `Prenotazione` (prenotazioneId). Tutte le righe che generiamo hanno almeno
  // uno tra userId/targetUserId in `UTENTI` (CODA_INGRESSO, CODA_PROMOZIONE,
  // PRENOTAZIONE_CANCELLATA, OVERRIDE_BIBLIOTECARIO).
  await prisma.logEvento.deleteMany({
    where: {
      OR: [
        { userId: { in: [...UTENTI] } },
        { targetUserId: { in: [...UTENTI] } },
      ],
    },
  });
  await prisma.notifica.deleteMany({ where: { userId: { in: [...UTENTI] } } });
  await prisma.listaAttesa.deleteMany({ where: { postoId: POSTO_ID } });
  await prisma.prenotazione.deleteMany({ where: { postoId: POSTO_ID } });
  await prisma.posto.deleteMany({ where: { id: POSTO_ID } });
  await prisma.sala.deleteMany({ where: { id: SALA_ID } });
  await prisma.user.deleteMany({ where: { id: { in: [...UTENTI] } } });
}

// ─── Seed dello scenario base ────────────────────────────────────────────
// Utente A + utente B + bibliotecario, 1 sala, 1 posto e la prenotazione
// CONFERMATA di A sullo slot futuro. Il posto resta DISPONIBILE: un posto
// diventa OCCUPATO solo al check-in, quindi per una prenotazione futura è lo
// stato corretto (e la promozione non dipende da esso).

async function seedBase(): Promise<void> {
  await prisma.user.createMany({
    data: [
      {
        id: USER_A,
        email: `${USER_A}@biblioflow.test`,
        nome: "Utente",
        cognome: "A",
        matricola: "BIB58-A",
        ruolo: "STUDENTE",
        emailVerificata: true,
      },
      {
        id: USER_B,
        email: `${USER_B}@biblioflow.test`,
        nome: "Utente",
        cognome: "B",
        matricola: "BIB58-B",
        ruolo: "STUDENTE",
        emailVerificata: true,
      },
      {
        id: LIBRARIAN,
        email: `${LIBRARIAN}@biblioflow.test`,
        nome: "Biblio",
        cognome: "Tecario",
        matricola: "BIB58-LIB",
        // La route admin scrive `LogEvento.userId = <id bibliotecario>`: la riga
        // User deve esistere davvero o l'INSERT del log viola la FK.
        ruolo: "BIBLIOTECARIO",
        emailVerificata: true,
      },
    ],
  });

  await prisma.sala.create({
    data: { id: SALA_ID, nome: "Sala BIB-58", piano: 1, capienzaMax: 1 },
  });
  await prisma.posto.create({
    data: {
      id: POSTO_ID,
      numero: "B58",
      salaId: SALA_ID,
      coordinataX: 0,
      coordinataY: 0,
    },
  });

  await prisma.prenotazione.create({
    data: {
      id: PREN_A_ID,
      userId: USER_A,
      postoId: POSTO_ID,
      data: SLOT.data,
      oraInizio: ORA_INIZIO,
      oraFine: ORA_FINE,
      stato: "CONFERMATA",
    },
  });
}

// ─── Ciclo di vita ──────────────────────────────────────────────────────

// Timeout generosi sui hook: il gate può attendere la fine di
// `concorrenza.test.ts` (in pratica pochi secondi, cap teorico 90s).
beforeAll(async () => {
  await gateConcorrenza(true);
  await pulisciBib58();
}, 120_000);

beforeEach(async () => {
  await gateConcorrenza(false);
  await pulisciBib58();
}, 120_000);

afterAll(async () => {
  await pulisciBib58();
  await prisma.$disconnect();
});

// `retry`: rete di sicurezza residua oltre al gate. Se la promozione (INSERT
// Serializable su `Prenotazione`) dovesse comunque incrociare un INSERT
// concorrente e abortire con `40001`/`40P01`, `promuoviPrimoInCoda` lo assorbe e
// ritorna `null` (falso negativo ambientale): il `beforeEach` ripulisce e il
// caso riparte da capo.
const RETRY_CONCORRENZA = { retry: 3 };

// ═══════════════════════════════════════════════════════════════════════════
// BIB-58 · CA-03 / CA-04 — ciclo completo ingresso in coda → promozione
// ═══════════════════════════════════════════════════════════════════════════

describe(
  "BIB-58 · CA-03/CA-04 — ciclo end-to-end coda → promozione",
  RETRY_CONCORRENZA,
  () => {
    it("[TC-BIB58-001] B entra in coda, l'admin cancella A e B viene promosso con tracciabilita completa", async () => {
      await seedBase();

      // ── 2) B entra in coda per lo stesso posto/slot (sessione simulata = B) ──
      authMocks.requireUser.mockReset();
      authMocks.requireUser.mockResolvedValue(sessioneStudente(USER_B));

      const rispCoda = await codaRoute.POST(
        richiestaJson("http://localhost/api/prenotazioni/coda", {
          postoId: POSTO_ID,
          data: SLOT.iso,
          oraInizio: "09:00",
          oraFine: "11:00",
        }),
      );

      expect(rispCoda.status).toBe(201);
      const bodyCoda = (await rispCoda.json()) as {
        success: boolean;
        data: { id: string; userId: string; stato: string; posizione: number };
      };
      expect(bodyCoda.success).toBe(true);
      expect(bodyCoda.data.posizione).toBe(1);
      expect(bodyCoda.data.stato).toBe("IN_ATTESA");

      const richiestaCodaId = bodyCoda.data.id;
      const laIniziale = await prisma.listaAttesa.findUniqueOrThrow({
        where: { id: richiestaCodaId },
      });
      expect(laIniziale.userId).toBe(USER_B);
      expect(laIniziale.stato).toBe("IN_ATTESA");

      // ── 3) Il bibliotecario cancella la prenotazione di A (sessione = staff) ──
      // Gate appena prima: qui parte l'INSERT Serializable della promozione.
      await gateConcorrenza(false);
      authMocks.auth.mockReset();
      authMocks.auth.mockResolvedValue(sessioneBibliotecario());

      const rispAdmin = await adminRoute.POST(
        richiestaJson("http://localhost/api/admin/prenotazioni", {
          azione: "ANNULLA_SINGOLA",
          prenotazioneId: PREN_A_ID,
        }),
      );

      expect(rispAdmin.status).toBe(200);
      const bodyAdmin = (await rispAdmin.json()) as {
        success: boolean;
        promozione: null | {
          richiestaId: string;
          prenotazioneId: string;
          userId: string;
          postoId: string;
          utente?: { nome: string; cognome: string };
        };
      };

      // ── 4) Asserzioni sullo stato del dominio ──

      // 4a) La prenotazione di A è ora CANCELLATA.
      const prenA = await prisma.prenotazione.findUniqueOrThrow({
        where: { id: PREN_A_ID },
      });
      expect(prenA.stato).toBe("CANCELLATA");

      // 4b) Esiste UNA nuova prenotazione CONFERMATA per B sullo stesso posto/slot.
      const prenB = await prisma.prenotazione.findMany({
        where: { userId: USER_B, postoId: POSTO_ID, stato: "CONFERMATA" },
      });
      expect(prenB).toHaveLength(1);
      expect(prenB[0].data).toEqual(SLOT.data);
      expect(prenB[0].oraInizio).toEqual(ORA_INIZIO);
      expect(prenB[0].oraFine).toEqual(ORA_FINE);
      const nuovaPrenId = prenB[0].id;

      // 4c) La richiesta di coda di B è ora PROMOSSA.
      const laPromossa = await prisma.listaAttesa.findUniqueOrThrow({
        where: { id: richiestaCodaId },
      });
      expect(laPromossa.stato).toBe("PROMOSSA");

      // 4d) B ha una Notifica CODA_PROMOZIONE.
      const notifB = await prisma.notifica.findMany({
        where: { userId: USER_B, tipo: "CODA_PROMOZIONE" },
      });
      expect(notifB.length).toBeGreaterThanOrEqual(1);
      expect(notifB[0].actionUrl).toBe(`/prenotazioni/${nuovaPrenId}`);

      // 4e) LogEvento CODA_PROMOZIONE (targetUserId = B, prenotazioneId = nuova)…
      const logPromozione = await prisma.logEvento.findMany({
        where: { tipo: "CODA_PROMOZIONE", targetUserId: USER_B },
      });
      expect(logPromozione.length).toBeGreaterThanOrEqual(1);
      expect(
        logPromozione.some((log) => log.prenotazioneId === nuovaPrenId),
      ).toBe(true);

      // …e LogEvento OVERRIDE_BIBLIOTECARIO (userId = bibliotecario,
      // dettagli.azione = "CANCELLAZIONE_ADMIN").
      const logOverride = await prisma.logEvento.findMany({
        where: { tipo: "OVERRIDE_BIBLIOTECARIO", userId: LIBRARIAN },
      });
      expect(logOverride.length).toBeGreaterThanOrEqual(1);
      expect(
        logOverride.some(
          (log) => dettagli(log).azione === "CANCELLAZIONE_ADMIN",
        ),
      ).toBe(true);
      expect(
        logOverride.some((log) => log.targetUserId === USER_B),
      ).toBe(true);

      // 4f) Nessuna sovrapposizione: esattamente 1 prenotazione in stato attivo
      // (CONFERMATA/CHECK_IN) sul posto/slot.
      const attive = await prisma.prenotazione.count({
        where: {
          postoId: POSTO_ID,
          data: SLOT.data,
          stato: { in: ["CONFERMATA", "CHECK_IN"] },
        },
      });
      expect(attive).toBe(1);

      // 4g) La risposta admin identifica B come promosso, con nome e cognome.
      expect(bodyAdmin.success).toBe(true);
      expect(bodyAdmin.promozione).not.toBeNull();
      expect(bodyAdmin.promozione?.userId).toBe(USER_B);
      expect(bodyAdmin.promozione?.prenotazioneId).toBe(nuovaPrenId);
      expect(bodyAdmin.promozione?.utente).toEqual({
        nome: "Utente",
        cognome: "B",
      });
    });

    it("[TC-BIB58-002] coda vuota: la cancellazione admin non promuove nessuno", async () => {
      await seedBase();

      // Nessuno in coda: si cancella direttamente la prenotazione di A.
      await gateConcorrenza(false);
      authMocks.auth.mockReset();
      authMocks.auth.mockResolvedValue(sessioneBibliotecario());

      const rispAdmin = await adminRoute.POST(
        richiestaJson("http://localhost/api/admin/prenotazioni", {
          azione: "ANNULLA_SINGOLA",
          prenotazioneId: PREN_A_ID,
        }),
      );

      expect(rispAdmin.status).toBe(200);
      const bodyAdmin = (await rispAdmin.json()) as {
        success: boolean;
        promozione: unknown;
      };
      expect(bodyAdmin.success).toBe(true);
      // Coda vuota ⇒ nessuna promozione.
      expect(bodyAdmin.promozione).toBeNull();

      // La cancellazione resta valida…
      const prenA = await prisma.prenotazione.findUniqueOrThrow({
        where: { id: PREN_A_ID },
      });
      expect(prenA.stato).toBe("CANCELLATA");

      // …e non è nata alcuna nuova prenotazione sul posto.
      const nuove = await prisma.prenotazione.count({
        where: {
          postoId: POSTO_ID,
          stato: { in: ["CONFERMATA", "CHECK_IN"] },
        },
      });
      expect(nuove).toBe(0);

      // Nessuna traccia di promozione: né Notifica né LogEvento CODA_PROMOZIONE.
      expect(
        await prisma.notifica.count({
          where: { userId: { in: [...UTENTI] }, tipo: "CODA_PROMOZIONE" },
        }),
      ).toBe(0);
      expect(
        await prisma.logEvento.count({
          where: { tipo: "CODA_PROMOZIONE", targetUserId: { in: [...UTENTI] } },
        }),
      ).toBe(0);
    });
  },
);
