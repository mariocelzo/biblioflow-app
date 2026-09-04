/**
 * 🧪 TEST DI INTEGRAZIONE — AUTOMAZIONI E NOTIFICHE DELLA FASE 4 (Jira BIB-47)
 *
 * Trello "Test su automazioni e notifiche" — criteri di accettazione CA-04, CA-05, CA-06.
 *
 * A differenza dei test unitari di `tests/unit/automation-service.test.ts` (che
 * isolano il servizio dal DB con delle spie), qui si esercita la logica di
 * Fase 4 contro un PostgreSQL reale (container `biblioflow-test-db` su
 * 127.0.0.1:5433, schema completo con il vincolo `EXCLUDE` anti-sovrapposizione).
 * Si verifica quindi l'integrazione end-to-end:
 *   `runAllAutomations()` → `releaseNoShowReservations()` → `processaCodaPerPosto()`
 *   → `promuoviPrimoInCoda()` (dominio) → `notificaEventoCoda()` + `LogEvento`,
 *   e il percorso `scadiPromozioniNonConfermate()` per la finestra di conferma.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⏱️  OROLOGIO FISSATO
 * `automation-service.ts` legge `new Date()` internamente e non è iniettabile.
 * Per rendere i casi deterministici (le finestre no-show / conferma dipendono
 * dall'ora del giorno) si congela SOLO l'oggetto `Date` con
 * `vi.useFakeTimers({ toFake: ["Date"] })`: `setTimeout`/`queueMicrotask` restano
 * reali, quindi il driver `pg` e Prisma continuano a funzionare normalmente.
 * Il clock è fissato a 12:00 UTC del 2026-09-02: uno slot "passato" 08:00–10:00 e
 * uno "futuro" 14:00–16:00 cadono entrambi dentro l'orario di default della sala
 * (08:00–22:00), evitando falsi `FUORI_ORARIO_SALA` nella promozione.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 🧹 PULIZIA — SCOPED, NON GLOBALE + GATE ANTI-CONTESA
 * Vitest esegue i file di test in parallelo sullo STESSO database. Due scelte
 * necessarie per non far regredire la suite (in particolare `concorrenza.test.ts`):
 *   1. Pulizia SCOPED: un `resetTestDatabase()` globale in `beforeEach`
 *      cancellerebbe le fixture degli altri file (`concorrenza.test.ts` crea
 *      `bib38-*`) e, con più worker che fanno `deleteMany` sull'intera tabella in
 *      transazioni Serializable, genera deadlock. Come già fanno
 *      `concorrenza.test.ts` e i test in `tests/post-modifica/`, qui si
 *      ripuliscono SOLO le righe `bib47-*` (in `beforeEach` e `afterAll`), in
 *      ordine sicuro rispetto alle foreign key. Il file non lascia righe.
 *   2. Gate anti-contesa (`beforeAll` + `beforeEach` + prima di ogni run, vedi
 *      `gateConcorrenza`): si attende che `concorrenza.test.ts` non stia
 *      inserendo su `Prenotazione`, perché sotto SSI due inserimenti concorrenti
 *      su `Prenotazione` — anche su date diverse — possono abortire a vicenda
 *      con `40001`/`40P01` e far uscire `concorrenza.test.ts` con zero 201.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 🐞→✅ BUG DI IDEMPOTENZA TROVATO DA QUESTO FILE E CORRETTO (TC-BIB47-002)
 * Sintomo originale: `releaseNoShowReservations` selezionava OGNI prenotazione
 * `CONFERMATA` con `data <= now` e `oraInizio` passata, senza escludere quelle
 * appena create da una promozione di coda. La prenotazione nata da
 * `processaCodaPerPosto` è per uno slot già iniziato da oltre 15 minuti (l'unico
 * caso in cui il no-show promuove qualcuno), quindi alla run successiva veniva
 * subito marcata NO_SHOW: catena no-show + promozione NON idempotente, e la
 * finestra di conferma di BIB-44 scavalcata.
 * Correzione (src/lib/automation-service.ts):
 *   1. `releaseNoShowReservations` aggiunge `createdAt <= now - FINESTRA_CONFERMA`
 *      (grazia): una prenotazione appena creata — quindi quella da promozione —
 *      non viene mai messa subito in no-show.
 *   2. `runAllAutomations` esegue `scadiPromozioniNonConfermate` PRIMA del
 *      rilascio no-show: dopo la finestra, la decadenza della promozione non
 *      confermata è gestita una sola volta (→ SCADUTA), e il no-show — che
 *      filtra `stato = CONFERMATA` — non la rivede.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// `@/app/api/cron/automations/route` importa `@/lib/env`, che con `zod` fa
// `process.exit(1)` se mancano NEXTAUTH_URL/NEXTAUTH_SECRET: si mocka per
// fissare solo `CRON_SECRET` (stesso approccio di `tests/unit/cron-automations.test.ts`).
const fisso = vi.hoisted(() => ({ CRON_SECRET: "bib47-cron-secret-integrazione" }));
vi.mock("@/lib/env", () => ({ env: { CRON_SECRET: fisso.CRON_SECRET } }));

// `@/app/api/notifiche/route` dopo il fix di sicurezza C-4 richiede una sessione
// autenticata e ignora il parametro `?userId=` (prima l'endpoint era aperto e
// leggeva un userId arbitrario dalla query). Qui si mocka `@/lib/auth` per
// autenticare l'utente di test `bib47-u1`: la verifica del contenuto delle
// notifiche via GET (caso 3) continua a valere, ora contro il comportamento
// sicuro. Mockare `@/lib/auth` evita inoltre di caricare `next-auth`, non
// risolvibile sotto vitest.
const utenteNotifiche = vi.hoisted(() => ({
  id: "bib47-u1",
  email: "bib47-u1@biblioflow.test",
  nome: "Bib47",
  cognome: "U1",
  ruolo: "STUDENTE" as const,
  matricola: "B47U1",
  isPendolare: false,
  necessitaAccessibilita: false,
}));
vi.mock("@/lib/auth", () => {
  class AuthError extends Error {
    status: number;
    code: string;
    constructor(status: number, code: string, message: string) {
      super(message);
      this.name = "AuthError";
      this.status = status;
      this.code = code;
    }
  }
  return {
    AuthError,
    // La sessione e' sempre quella dell'utente di test.
    auth: async () => ({ user: utenteNotifiche }),
    requireUser: async () => utenteNotifiche,
    requireRole: async () => utenteNotifiche,
    isStaff: (ruolo: string) => ruolo === "BIBLIOTECARIO" || ruolo === "ADMIN",
    hasRole: (ruolo: string, ammessi: string[]) => ammessi.includes(ruolo),
    // Stessa semantica reale: al proprietario passa, allo studente non
    // proprietario la risorsa "non esiste" (404), agli altri ruoli 403.
    assertOwnership: (
      resource: { userId: string },
      user: { id: string; ruolo: string },
    ) => {
      if (resource.userId === user.id) return;
      throw new AuthError(
        user.ruolo === "STUDENTE" ? 404 : 403,
        user.ruolo === "STUDENTE"
          ? "RISORSA_NON_TROVATA"
          : "RISORSA_NON_AUTORIZZATA",
        "accesso negato alla risorsa",
      );
    },
  };
});

// Import dinamici DOPO i mock (come in `tests/integration/concorrenza.test.ts`):
// così il modulo mockato è già registrato quando i moduli sotto test vengono caricati.
const { prisma } = await import("@/lib/prisma");
const { runAllAutomations } = await import("@/lib/automation-service");
const cronRoute = await import("@/app/api/cron/automations/route");
const notificheRoute = await import("@/app/api/notifiche/route");
const { getTipoConfig } = await import("@/app/notifiche/tipo-config");
const { NextRequest } = await import("next/server");

// ─── Identificatori delle fixture (prefisso `bib47-` per la pulizia scoped) ──

const UTENTI = ["bib47-u1", "bib47-u2", "bib47-u3"] as const;
const SALA_ID = "bib47-sala";
const POSTO_ID = "bib47-posto";

// ─── Istanti e slot deterministici ──────────────────────────────────────────

/** Istante "corrente" congelato per tutti i casi. */
const NOW = new Date("2026-09-02T12:00:00.000Z");
/** `Prenotazione.data` / `ListaAttesa.data` — `@db.Date` = mezzanotte UTC di "oggi". */
const DATA_OGGI = new Date("2026-09-02T00:00:00.000Z");

/** Slot "passato": inizio 4h prima del clock ⇒ dentro la finestra no-show e nell'orario sala. */
const SLOT_PASSATO = {
  oraInizio: new Date("1970-01-01T08:00:00.000Z"),
  oraFine: new Date("1970-01-01T10:00:00.000Z"),
};
/** Slot "futuro": inizio dopo il clock ⇒ NON entra nella finestra no-show (isola la scadenza-promozione). */
const SLOT_FUTURO = {
  oraInizio: new Date("1970-01-01T14:00:00.000Z"),
  oraFine: new Date("1970-01-01T16:00:00.000Z"),
};

// ─── Helper di seeding ──────────────────────────────────────────────────────

/** Crea uno studente con email/matricola derivate dall'id. */
async function creaUtente(id: string) {
  return prisma.user.create({
    data: {
      id,
      email: `${id}@biblioflow.test`,
      nome: "Test",
      cognome: id,
      matricola: id.toUpperCase(),
      ruolo: "STUDENTE",
      emailVerificata: true,
    },
  });
}

/** Crea una sala (orari di default 08:00–22:00) e un posto al suo interno. */
async function creaSalaEPosto(
  salaId: string,
  postoId: string,
  statoPosto: "DISPONIBILE" | "OCCUPATO" = "DISPONIBILE",
) {
  await prisma.sala.create({
    data: { id: salaId, nome: `Sala ${salaId}`, piano: 1, capienzaMax: 1 },
  });
  await prisma.posto.create({
    data: {
      id: postoId,
      numero: "A1",
      salaId,
      coordinataX: 0,
      coordinataY: 0,
      stato: statoPosto,
    },
  });
}

/**
 * Scenario base CA-04 (no-show → promozione):
 * - U1 ha una prenotazione `CONFERMATA` sullo slot passato, senza check-in;
 * - U2 è `IN_ATTESA` in coda per lo stesso (posto, slot).
 * Ritorna gli id utili alle asserzioni.
 */
async function seedNoShowConCoda() {
  const salaId = SALA_ID;
  const postoId = POSTO_ID;
  await creaUtente("bib47-u1");
  await creaUtente("bib47-u2");
  await creaSalaEPosto(salaId, postoId);

  const prenU1 = await prisma.prenotazione.create({
    data: {
      id: "bib47-pren-u1",
      userId: "bib47-u1",
      postoId,
      data: DATA_OGGI,
      ...SLOT_PASSATO,
      stato: "CONFERMATA",
      // Prenotazione reale di no-show: creata con largo anticipo, quindi ben
      // oltre la finestra di grazia anti no-show-immediato di
      // `releaseNoShowReservations` (BIB-47). Solo le prenotazioni "appena
      // create" — cioè quelle nate da una promozione di coda — restano protette.
      createdAt: new Date(NOW.getTime() - 3 * 60 * 60_000),
    },
  });
  const laU2 = await prisma.listaAttesa.create({
    data: {
      id: "bib47-la-u2",
      userId: "bib47-u2",
      postoId,
      data: DATA_OGGI,
      ...SLOT_PASSATO,
      stato: "IN_ATTESA",
    },
  });

  return { salaId, postoId, prenU1Id: prenU1.id, laU2Id: laU2.id };
}

/**
 * Scenario base CA-04 (finestra di conferma):
 * - U2 è stato promosso (`ListaAttesa` `PROMOSSA`) da 20 minuti ma non ha
 *   confermato: la sua prenotazione `CONFERMATA` sullo slot futuro è senza
 *   check-in (a meno che `statoPrenU2` sia diverso);
 * - il posto è `OCCUPATO`;
 * - U3 è `IN_ATTESA` per lo stesso (posto, slot).
 *
 * `ListaAttesa.updatedAt` è il solo timestamp della promozione: Prisma lo
 * riscrive a `now` a ogni update, quindi lo si retrodata con `$executeRaw`.
 */
async function seedPromozioneDaScadere(
  statoPrenU2: "CONFERMATA" | "CHECK_IN" = "CONFERMATA",
) {
  const salaId = SALA_ID;
  const postoId = POSTO_ID;
  await creaUtente("bib47-u2");
  await creaUtente("bib47-u3");
  await creaSalaEPosto(salaId, postoId, "OCCUPATO");

  const prenU2 = await prisma.prenotazione.create({
    data: {
      id: "bib47-pren-u2",
      userId: "bib47-u2",
      postoId,
      data: DATA_OGGI,
      ...SLOT_FUTURO,
      stato: statoPrenU2,
      // Se è già in CHECK_IN la promozione risulta "confermata" e non deve scadere.
      checkInAt: statoPrenU2 === "CHECK_IN" ? new Date(NOW.getTime() - 5 * 60_000) : null,
    },
  });

  const laU2 = await prisma.listaAttesa.create({
    data: {
      id: "bib47-la-u2",
      userId: "bib47-u2",
      postoId,
      data: DATA_OGGI,
      ...SLOT_FUTURO,
      stato: "PROMOSSA",
      // createdAt più vecchio di U3: la coda resta FIFO anche a parità di updatedAt.
      createdAt: new Date(NOW.getTime() - 60 * 60_000),
    },
  });
  // Retrodata l'istante di promozione a 20 minuti fa (> FINESTRA_CONFERMA = 15 min).
  await prisma.$executeRaw`
    UPDATE "ListaAttesa" SET "updatedAt" = ${new Date(NOW.getTime() - 20 * 60_000)}
    WHERE id = ${laU2.id}
  `;

  const laU3 = await prisma.listaAttesa.create({
    data: {
      id: "bib47-la-u3",
      userId: "bib47-u3",
      postoId,
      data: DATA_OGGI,
      ...SLOT_FUTURO,
      stato: "IN_ATTESA",
      createdAt: new Date(NOW.getTime() - 30 * 60_000),
    },
  });

  return { salaId, postoId, prenU2Id: prenU2.id, laU2Id: laU2.id, laU3Id: laU3.id };
}

// ─── Utility di lettura e pulizia ──────────────────────────────────────────

/**
 * Pulizia SCOPED: elimina solo le righe con prefisso `bib47-*`, in ordine
 * sicuro rispetto alle foreign key. Non tocca le fixture degli altri file di
 * integrazione che condividono lo stesso database.
 *
 * I `LogEvento` prodotti dalle automazioni referenziano i nostri utenti
 * (`userId`/`targetUserId`) o le nostre prenotazioni (`prenotazioneId`);
 * gli unici con riferimenti tutti nulli sono i riepiloghi di run
 * (`tipo = AUTOMATION`, descrizione "Riepilogo run …"), inclusi qui esplicitamente.
 */
async function pulisciBib47() {
  await prisma.logEvento.deleteMany({
    where: {
      OR: [
        { userId: { in: [...UTENTI] } },
        { targetUserId: { in: [...UTENTI] } },
        // Eventi di innesco con lo slot nel testo (anche esito "coda_vuota", che
        // ha userId/targetUserId nulli) e riepiloghi di run (riferimenti nulli).
        { descrizione: { contains: "bib47" } },
        { tipo: "AUTOMATION", descrizione: { startsWith: "Riepilogo run" } },
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

/** Accesso tipizzato al campo Json `LogEvento.dettagli`. */
function dettagli(log: { dettagli: unknown }): Record<string, unknown> {
  return (log.dettagli ?? {}) as Record<string, unknown>;
}

/** Risposta JSON della cron route, nella forma che ci interessa asserire. */
type RispostaCron = {
  success: boolean;
  skipped: boolean;
  runId: string;
  results?: { noShows: { released: number; promoted: number } };
};

function richiestaCron() {
  return new NextRequest("http://localhost/api/cron/automations", {
    headers: { authorization: `Bearer ${fisso.CRON_SECRET}` },
  });
}

const attesa = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 🚧 GATE ANTI-CONTESA CON `concorrenza.test.ts`
 *
 * Vitest esegue i file di test in parallelo sullo stesso PostgreSQL.
 * `concorrenza.test.ts` spara molte creazioni concorrenti di `Prenotazione`;
 * anche le nostre promozioni inseriscono in `Prenotazione` in transazioni
 * Serializable. Sotto SSI il predicato `stato IN ('CONFERMATA','CHECK_IN')`
 * letto da `creaPrenotazioneNellaTransazione` fa sì che due inserimenti
 * concorrenti — pur su date/posti diversi — possano abortire con `40001`/`40P01`:
 * `concorrenza.test.ts` ne uscirebbe con zero esiti 201 (regressione).
 *
 * Non potendo toccare la config di vitest né gli altri test, questo file
 * attende (in `beforeAll`, in `beforeEach` e appena prima di ogni chiamata alle
 * automazioni) che `concorrenza.test.ts` non sia in esecuzione, usando la sua
 * fixture `bib38-posto` come semaforo: in `beforeAll` aspetta prima che compaia
 * (max 4s: quel file potrebbe non essere ancora partito), poi in ogni caso che
 * scompaia (max 90s: la sua `afterAll` la rimuove appena finito). Se non
 * compare, `concorrenza.test.ts` ha già finito oppure girerà dopo di noi sullo
 * stesso worker: in entrambi i casi non c'è sovrapposizione.
 */
async function concorrenzaFixturePresente(): Promise<boolean> {
  const righe = await prisma.$queryRaw<Array<{ presente: boolean }>>`
    SELECT EXISTS(SELECT 1 FROM "Posto" WHERE id = 'bib38-posto') AS presente
  `;
  return righe[0]?.presente === true;
}

/**
 * @param attendiComparsa se `true` (solo in `beforeAll`) concede fino a 4s a
 *   `concorrenza.test.ts` per creare la sua fixture; se non compare, quel file
 *   ha già finito o girerà dopo di noi sullo stesso worker.
 * Poi, in ogni caso, attende che la fixture SCOMPAIA (cap 90s: in pratica i
 * ~3s di durata di quel file).
 */
async function gateConcorrenza(attendiComparsa: boolean): Promise<void> {
  if (attendiComparsa) {
    const t0 = Date.now();
    while (Date.now() - t0 < 4_000) {
      if (await concorrenzaFixturePresente()) break;
      await attesa(200);
    }
  }
  const t1 = Date.now();
  while (Date.now() - t1 < 90_000) {
    if (!(await concorrenzaFixturePresente())) return;
    await attesa(250);
  }
}

/** Esegue le automazioni solo quando `concorrenza.test.ts` non è in volo. */
async function eseguiAutomazioni() {
  await gateConcorrenza(false);
  return runAllAutomations();
}

// ─── Ciclo di vita ─────────────────────────────────────────────────────────

beforeAll(async () => {
  await gateConcorrenza(true);
});

beforeEach(async () => {
  await gateConcorrenza(false);
  await pulisciBib47();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

afterAll(async () => {
  await pulisciBib47();
  await prisma.$disconnect();
});

// ═══════════════════════════════════════════════════════════════════════════
// CA-04 — rilascio no-show e innesco della promozione dalla coda
// ═══════════════════════════════════════════════════════════════════════════

/**
 * `retry`: rete di sicurezza RESIDUA oltre al gate anti-contesa. Se una
 * promozione (insert su `Prenotazione` in transazione Serializable) dovesse
 * comunque incrociare un insert concorrente e abortire con `40001`/`40P01`,
 * `promuoviPrimoInCoda` lo assorbe e ritorna `null` (falso negativo ambientale,
 * non un difetto di logica): il `beforeEach` ripulisce e il caso riparte da capo.
 */
const RETRY_CONCORRENZA = { retry: 3 };

describe("BIB-47 · CA-04 — no-show automatico e promozione dalla coda", RETRY_CONCORRENZA, () => {
  it("[TC-BIB47-001] il no-show automatico promuove il primo in coda e lascia tracciabilità completa", async () => {
    const { postoId, prenU1Id, laU2Id } = await seedNoShowConCoda();

    const results = await eseguiAutomazioni();

    // La prenotazione di U1 è passata a NO_SHOW.
    const prenU1 = await prisma.prenotazione.findUniqueOrThrow({ where: { id: prenU1Id } });
    expect(prenU1.stato).toBe("NO_SHOW");

    // Esiste UNA sola nuova prenotazione CONFERMATA di U2 sullo stesso (posto, slot).
    const prenU2 = await prisma.prenotazione.findMany({
      where: { userId: "bib47-u2", postoId, stato: "CONFERMATA" },
    });
    expect(prenU2).toHaveLength(1);
    expect(prenU2[0].data).toEqual(DATA_OGGI);
    expect(prenU2[0].oraInizio).toEqual(SLOT_PASSATO.oraInizio);
    expect(prenU2[0].oraFine).toEqual(SLOT_PASSATO.oraFine);

    // La richiesta di coda di U2 è ora PROMOSSA.
    const laU2 = await prisma.listaAttesa.findUniqueOrThrow({ where: { id: laU2Id } });
    expect(laU2.stato).toBe("PROMOSSA");

    // U2 ha ricevuto la notifica CODA_PROMOZIONE (una sola).
    const notifU2 = await prisma.notifica.findMany({
      where: { userId: "bib47-u2", tipo: "CODA_PROMOZIONE" },
    });
    expect(notifU2).toHaveLength(1);

    // Audit trail: esistono sia NO_SHOW_AUTO sia CODA_PROMOZIONE.
    expect(await prisma.logEvento.count({ where: { tipo: "NO_SHOW_AUTO" } })).toBeGreaterThanOrEqual(1);
    expect(await prisma.logEvento.count({ where: { tipo: "CODA_PROMOZIONE" } })).toBeGreaterThanOrEqual(1);

    // Riepilogo di run.
    expect(results.noShows.promoted).toBe(1);
    expect(results.noShows.released).toBe(1);
  });

  /**
   * ✅ Regressione del bug di idempotenza (vedi header del file).
   *
   * Con la finestra di grazia su `createdAt` in `releaseNoShowReservations` e
   * l'inversione d'ordine in `runAllAutomations`, la prenotazione nata dalla
   * promozione NON viene più mandata in NO_SHOW alla run successiva: resta
   * `CONFERMATA` finché il promosso ha tempo di fare check-in (finestra BIB-44).
   */
  it("[TC-BIB47-002] doppia esecuzione ravvicinata: il promosso conserva il posto (idempotenza no-show + promozione)", async () => {
    await seedNoShowConCoda();

    await eseguiAutomazioni();
    const secondaRun = await eseguiAutomazioni();

    // La prenotazione della promozione di U2 sopravvive alla 2ª run.
    const prenU2Confermate = await prisma.prenotazione.count({
      where: { userId: "bib47-u2", stato: "CONFERMATA" },
    });
    expect(prenU2Confermate).toBe(1);
    // Nessuna prenotazione di U2 finita in NO_SHOW/SCADUTA per effetto della 2ª run.
    expect(
      await prisma.prenotazione.count({
        where: { userId: "bib47-u2", stato: { in: ["NO_SHOW", "SCADUTA"] } },
      }),
    ).toBe(0);

    const notifPromozione = await prisma.notifica.count({
      where: { userId: "bib47-u2", tipo: "CODA_PROMOZIONE" },
    });
    expect(notifPromozione).toBe(1);
    expect(secondaRun.noShows.promoted).toBe(0);
    expect(secondaRun.promozioniScadute.scadute).toBe(0);
  });

  it("[TC-BIB47-002b] doppia esecuzione ravvicinata: nessuna promozione/notifica/coda duplicata", async () => {
    const { laU2Id } = await seedNoShowConCoda();

    await eseguiAutomazioni();
    const logPromozionePrima = await prisma.logEvento.count({ where: { tipo: "CODA_PROMOZIONE" } });

    const secondaRun = await eseguiAutomazioni();

    // La 2ª run NON crea una nuova promozione né una seconda notifica/log.
    expect(secondaRun.noShows.promoted).toBe(0);
    expect(await prisma.notifica.count({ where: { userId: "bib47-u2", tipo: "CODA_PROMOZIONE" } })).toBe(1);
    expect(await prisma.logEvento.count({ where: { tipo: "CODA_PROMOZIONE" } })).toBe(logPromozionePrima);

    // La richiesta di coda di U2 resta PROMOSSA una sola volta (non ri-promossa),
    // e non esistono altre righe di coda per lo stesso slot.
    const laU2 = await prisma.listaAttesa.findUniqueOrThrow({ where: { id: laU2Id } });
    expect(laU2.stato).toBe("PROMOSSA");
    expect(await prisma.listaAttesa.count({ where: { postoId: "bib47-posto" } })).toBe(1);
  });

  it("[TC-BIB47-003] cron route: due invocazioni concorrenti, una sola esegue davvero", async () => {
    await seedNoShowConCoda();
    await gateConcorrenza(false);

    // Il lock `pg_try_advisory_xact_lock(424241)` dentro la $transaction fa sì
    // che una sola delle due chiamate esegua `runAllAutomations`; l'altra
    // ritorna `skipped: true` senza toccare il DB.
    const [rispA, rispB] = await Promise.all([
      cronRoute.GET(richiestaCron()),
      cronRoute.GET(richiestaCron()),
    ]);

    expect(rispA.status).toBe(200);
    expect(rispB.status).toBe(200);

    const bodyA = (await rispA.json()) as RispostaCron;
    const bodyB = (await rispB.json()) as RispostaCron;

    // Una ha eseguito (skipped:false), l'altra è stata saltata (skipped:true).
    expect([bodyA.skipped, bodyB.skipped].sort()).toEqual([false, true]);

    // Stato finale: una sola promozione, nessun duplicato.
    expect(await prisma.prenotazione.count({ where: { userId: "bib47-u2", stato: "CONFERMATA" } })).toBe(1);
    expect(await prisma.listaAttesa.count({ where: { id: "bib47-la-u2", stato: "PROMOSSA" } })).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// CA-05 — notifiche e LogEvento coerenti sulla promozione
// ═══════════════════════════════════════════════════════════════════════════

describe("BIB-47 · CA-05 — tracciabilità della promozione", RETRY_CONCORRENZA, () => {
  it("[TC-BIB47-004] la promozione genera Notifica e LogEvento coerenti e correlati", async () => {
    await seedNoShowConCoda();

    await eseguiAutomazioni();

    // La nuova prenotazione di U2 nata dalla promozione.
    const nuovaPren = await prisma.prenotazione.findFirstOrThrow({
      where: { userId: "bib47-u2", stato: "CONFERMATA" },
    });

    // La notifica CODA_PROMOZIONE punta esattamente alla nuova prenotazione.
    const notifica = await prisma.notifica.findFirstOrThrow({
      where: { userId: "bib47-u2", tipo: "CODA_PROMOZIONE" },
    });
    expect(notifica.actionUrl).toBe(`/prenotazioni/${nuovaPren.id}`);

    // Esiste un LogEvento CODA_PROMOZIONE con targetUserId = U2 e prenotazioneId = nuova prenotazione.
    const logPromozione = await prisma.logEvento.findMany({
      where: { tipo: "CODA_PROMOZIONE", targetUserId: "bib47-u2" },
    });
    expect(logPromozione.length).toBeGreaterThanOrEqual(1);
    for (const log of logPromozione) {
      expect(log.prenotazioneId).toBe(nuovaPren.id);
    }

    // Catena correlata: NO_SHOW_AUTO e l'AUTOMATION di innesco condividono il correlationId.
    const logNoShow = await prisma.logEvento.findFirstOrThrow({ where: { tipo: "NO_SHOW_AUTO" } });
    const tuttiAutomation = await prisma.logEvento.findMany({ where: { tipo: "AUTOMATION" } });
    const logInnesco = tuttiAutomation.find((log) => dettagli(log).esito === "promossa");
    expect(logInnesco).toBeDefined();

    const correlationNoShow = dettagli(logNoShow).correlationId;
    const correlationInnesco = dettagli(logInnesco!).correlationId;
    expect(typeof correlationNoShow).toBe("string");
    expect(correlationNoShow).not.toHaveLength(0);
    expect(correlationInnesco).toBe(correlationNoShow);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// CA-04 — finestra di conferma della promozione (decadenza)
// ═══════════════════════════════════════════════════════════════════════════

describe("BIB-47 · CA-04 — finestra di conferma della promozione", RETRY_CONCORRENZA, () => {
  it("[TC-BIB47-005] la promozione non confermata scade e il posto passa al successivo in coda", async () => {
    const { postoId, prenU2Id, laU2Id, laU3Id } = await seedPromozioneDaScadere();

    const results = await eseguiAutomazioni();

    // U2: richiesta di coda e prenotazione entrambe SCADUTE.
    const laU2 = await prisma.listaAttesa.findUniqueOrThrow({ where: { id: laU2Id } });
    const prenU2 = await prisma.prenotazione.findUniqueOrThrow({ where: { id: prenU2Id } });
    expect(laU2.stato).toBe("SCADUTA");
    expect(prenU2.stato).toBe("SCADUTA");
    expect(await prisma.notifica.count({ where: { userId: "bib47-u2", tipo: "CODA_SCADENZA" } })).toBe(1);

    // U3: promosso al posto liberato.
    const laU3 = await prisma.listaAttesa.findUniqueOrThrow({ where: { id: laU3Id } });
    expect(laU3.stato).toBe("PROMOSSA");
    const prenU3 = await prisma.prenotazione.findMany({
      where: { userId: "bib47-u3", postoId, stato: "CONFERMATA" },
    });
    expect(prenU3).toHaveLength(1);
    expect(await prisma.notifica.count({ where: { userId: "bib47-u3", tipo: "CODA_PROMOZIONE" } })).toBe(1);

    expect(results.promozioniScadute.scadute).toBe(1);
    expect(results.promozioniScadute.promozioniInnescate).toBe(1);
  });

  it("[TC-BIB47-006] la scadenza della promozione è idempotente su doppia esecuzione", async () => {
    const { laU2Id, laU3Id } = await seedPromozioneDaScadere();

    await eseguiAutomazioni();
    const secondaRun = await eseguiAutomazioni();

    // La 2ª run non fa scadere nulla di nuovo.
    expect(secondaRun.promozioniScadute.scadute).toBe(0);
    expect(secondaRun.promozioniScadute.promozioniInnescate).toBe(0);

    // Nessun duplicato: U3 ha una sola prenotazione e una sola notifica; U2 una sola CODA_SCADENZA.
    expect(await prisma.prenotazione.count({ where: { userId: "bib47-u3", stato: "CONFERMATA" } })).toBe(1);
    expect(await prisma.notifica.count({ where: { userId: "bib47-u3", tipo: "CODA_PROMOZIONE" } })).toBe(1);
    expect(await prisma.notifica.count({ where: { userId: "bib47-u2", tipo: "CODA_SCADENZA" } })).toBe(1);

    // Stati stabili.
    expect((await prisma.listaAttesa.findUniqueOrThrow({ where: { id: laU2Id } })).stato).toBe("SCADUTA");
    expect((await prisma.listaAttesa.findUniqueOrThrow({ where: { id: laU3Id } })).stato).toBe("PROMOSSA");
  });

  it("[TC-BIB47-007] una promozione confermata con check-in non scade e non promuove il successivo", async () => {
    const { prenU2Id, laU2Id, laU3Id } = await seedPromozioneDaScadere("CHECK_IN");

    const results = await eseguiAutomazioni();

    // U2: la promozione confermata resta com'è, nessuna notifica di scadenza.
    const laU2 = await prisma.listaAttesa.findUniqueOrThrow({ where: { id: laU2Id } });
    expect(laU2.stato).toBe("PROMOSSA");
    expect(laU2.stato).not.toBe("SCADUTA");
    expect((await prisma.prenotazione.findUniqueOrThrow({ where: { id: prenU2Id } })).stato).toBe("CHECK_IN");
    expect(await prisma.notifica.count({ where: { userId: "bib47-u2", tipo: "CODA_SCADENZA" } })).toBe(0);

    // U3: non promosso.
    expect((await prisma.listaAttesa.findUniqueOrThrow({ where: { id: laU3Id } })).stato).toBe("IN_ATTESA");
    expect(await prisma.prenotazione.count({ where: { userId: "bib47-u3" } })).toBe(0);

    expect(results.promozioniScadute.scadute).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// CA-06 — regressione: le notifiche storiche restano rese e leggibili
// ═══════════════════════════════════════════════════════════════════════════

describe("BIB-47 · CA-06 — regressione notifiche preesistenti", () => {
  it("[TC-BIB47-008] i tipi storici hanno config completa, il tipo sconosciuto ha fallback neutro e l'API le restituisce integre", async () => {
    await creaUtente("bib47-u1");

    // Due notifiche di tipi "storici" per U1.
    await prisma.notifica.createMany({
      data: [
        {
          userId: "bib47-u1",
          tipo: "CHECK_IN_REMINDER",
          titolo: "Promemoria check-in",
          messaggio: "Ricordati di fare il check-in fra 15 minuti.",
          actionUrl: "/prenotazioni/storica-1",
          actionLabel: "Fai check-in",
        },
        {
          userId: "bib47-u1",
          tipo: "SCADENZA_PRESTITO",
          titolo: "Prestito in scadenza",
          messaggio: 'Il libro "Clean Code" scade domani.',
          actionUrl: "/prestiti",
        },
      ],
    });

    // 1) Config dei tipi storici: icona/colore/label definiti e non vuoti.
    for (const tipo of ["CHECK_IN_REMINDER", "SCADENZA_PRESTITO"] as const) {
      const config = getTipoConfig(tipo);
      expect(config.icona).toBeDefined();
      expect(config.icona).not.toBeNull();
      expect(typeof config.colore).toBe("string");
      expect(config.colore.length).toBeGreaterThan(0);
      expect(typeof config.label).toBe("string");
      expect(config.label.length).toBeGreaterThan(0);
    }

    // 2) Tipo inventato: fallback neutro, nessun undefined.
    const fallback = getTipoConfig("TIPO_FANTASMA");
    expect(fallback.icona).toBeDefined();
    expect(fallback.icona).not.toBeNull();
    expect(fallback.colore).toBe("bg-gray-100 text-gray-800");
    expect(fallback.label).toBe("Notifica");

    // 3) GET /api/notifiche?userId=<U1> restituisce le due notifiche con tutti i campi valorizzati.
    const risposta = await notificheRoute.GET(
      new NextRequest("http://localhost/api/notifiche?userId=bib47-u1"),
    );
    expect(risposta.status).toBe(200);

    const body = (await risposta.json()) as {
      success: boolean;
      data: Array<{
        id: string;
        tipo: string;
        titolo: string;
        messaggio: string;
        letta: boolean;
      }>;
    };
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    for (const notifica of body.data) {
      expect(notifica.id).toBeTruthy();
      expect(notifica.tipo.length).toBeGreaterThan(0);
      expect(notifica.titolo.length).toBeGreaterThan(0);
      expect(notifica.messaggio.length).toBeGreaterThan(0);
      expect(notifica.letta).toBe(false);
    }
    expect(new Set(body.data.map((n) => n.tipo))).toEqual(
      new Set(["CHECK_IN_REMINDER", "SCADENZA_PRESTITO"]),
    );
  });
});
