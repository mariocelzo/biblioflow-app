/**
 * 🧪 TEST DI INTEGRAZIONE — BIB-55 "Statistiche: non inquinare le metriche esistenti" (CA-06)
 *
 * Trello: «I nuovi tipi di LogEvento rischiano di essere conteggiati come
 * occupazione o anomalie». Finito quando: «Le statistiche di occupazione
 * producono gli stessi valori di prima della modifica» — AC: confronto
 * prima/dopo su dataset identico → devono coincidere.
 *
 * COSA VERIFICA
 * ────────────
 * 1. Costruisce un dataset base (utenti, sala, posti, prenotazioni in vari
 *    stati, prestiti, richieste di preparazione, `LogEvento` legittimi tra cui
 *    `NO_SHOW` risolti e non, e un `OVERRIDE_BIBLIOTECARIO` non-coda).
 * 2. MISURA le aggregazioni chiave:
 *      - contatori della dashboard admin  (`src/app/admin/page.tsx`)
 *      - righe/contatori del feed anomalie (`src/app/admin/anomalie/page.tsx`
 *        e il batch `RISOLVI_TUTTE_NOSHOW` di `src/app/api/admin/anomalie/route.ts`)
 *      - endpoint reale `GET /api/admin/statistiche` per
 *        `?tipo=occupazione-oraria`, `?tipo=trend-prenotazioni`, `?tipo=tasso-noshow`
 * 3. AGGIUNGE al DB gli eventi che la CR introduce: `CODA_INGRESSO`,
 *    `CODA_PROMOZIONE`, `CODA_SCADENZA`, `CODA_ANNULLATA` (vedi
 *    `src/lib/eventi-coda.ts`) PIÙ una promozione admin, cioè un
 *    `OVERRIDE_BIBLIOTECARIO` con `dettagli.azione = "CANCELLAZIONE_ADMIN"`
 *    (come fa BIB-49 in `src/app/api/admin/prenotazioni/route.ts`).
 * 4. RI-MISURA le stesse aggregazioni e asserisce che i valori COINCIDANO
 *    ESATTAMENTE con quelli di prima (`toEqual` sull'intero snapshot).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⏱️  OROLOGIO FISSATO — e perché la data è nel 2035
 * Le query di statistiche usano finestre `new Date()` a ritroso (ultimi 7/30
 * giorni). Come `tests/integration/automazioni.test.ts` si congela SOLO l'oggetto
 * `Date` con `vi.useFakeTimers({ toFake: ["Date"] })` (i timer di `pg`/Prisma
 * restano reali). Il clock è fissato al **2035-01-15**: nessun altro file di
 * test usa date ≥ 2034 (il massimo altrove è `2031-03-10`), quindi le finestre
 * a ritroso dell'endpoint reale — pur essendo query GLOBALI — vedono
 * ESCLUSIVAMENTE le righe `bib55-*` di questo file. L'endpoint diventa così
 * deterministico anche con Vitest che esegue i file in parallelo sullo stesso DB.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 🧹 PULIZIA — SCOPED, MAI GLOBALE
 * Un reset globale entrerebbe in deadlock con `concorrenza.test.ts` /
 * `automazioni.test.ts` (deleteMany sull'intera tabella in transazioni
 * Serializable). Qui si cancellano SOLO le righe con prefisso `bib55-*`, in
 * ordine sicuro rispetto alle foreign key (in `beforeAll` e `afterAll`).
 *
 * 🎯 ASSERZIONI SCOPED
 * I contatori di dashboard/anomalie nel prodotto sono GLOBALI (`db.user.count()`
 * ecc.): replicarli tali e quali qui sarebbe non deterministico sotto carico
 * parallelo. Le helper qui sotto rispecchiano le stesse clausole `where` del
 * prodotto ma le RESTRINGONO alle fixture `bib55-*`. La proprietà sotto esame
 * non cambia: che l'aggiunta di `EVENTI_CODA` (+ promozione admin) NON alteri
 * nessuno di quei valori. Le clausole `tipo: "NO_SHOW"` restano quelle del
 * prodotto: se qualcuno le allentasse a uno scan ampio, questo test lo
 * catturerebbe.
 */

import type { Prisma } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  assertTestDatabaseUrl,
  DEFAULT_TEST_DATABASE_URL,
} from "../fixtures/database";

// `src/app/api/admin/statistiche/route.ts` importa solo `auth` da `@/lib/auth`.
// Lo si sostituisce interamente così NextAuth (e la validazione env che fa
// `process.exit(1)`) non viene mai caricato. Stesso approccio di
// `tests/integration/concorrenza.test.ts`.
const authHoisted = vi.hoisted(() => ({ auth: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: authHoisted.auth }));

const databaseUrl = process.env.DATABASE_URL ?? DEFAULT_TEST_DATABASE_URL;
assertTestDatabaseUrl(databaseUrl);

// Import dinamici DOPO i mock (come negli altri test di integrazione).
const { prisma } = await import("@/lib/prisma");
const statisticheRoute = await import("@/app/api/admin/statistiche/route");
const { NextRequest } = await import("next/server");
const { EVENTI_CODA, AZIONE_PROMOZIONE_ADMIN } = await import("@/lib/eventi-coda");

// ─── Identificatori delle fixture (prefisso `bib55-` per la pulizia scoped) ──

const SALA_ID = "bib55-sala";
const POSTI = {
  disponibile: "bib55-p1",
  occupato1: "bib55-p2",
  occupato2: "bib55-p3",
  manutenzione: "bib55-p4",
} as const;
const POSTI_IDS = Object.values(POSTI);
const UTENTI = ["bib55-u1", "bib55-u2", "bib55-u3", "bib55-u4"] as const;
const LIBRI = ["bib55-l1", "bib55-l2"] as const;

// ─── Istanti deterministici (tutto derivato da NOW, niente `new Date()` nudo) ─

/** Clock congelato: 2035 ⇒ nessun'altra suite cade nelle finestre 7/30 giorni. */
const NOW = new Date("2035-01-15T12:00:00.000Z");
/** Giorno UTC di "oggi" per i campi `@db.Date`. */
const DATA_OGGI = new Date("2035-01-15T00:00:00.000Z");
const giorniFa = (n: number) =>
  new Date(Date.UTC(2035, 0, 15 - n)); // sempre mezzanotte UTC

const SLOT = {
  oraInizio: new Date("1970-01-01T09:00:00.000Z"),
  oraFine: new Date("1970-01-01T11:00:00.000Z"),
};

/** `createdAt` esplicito: il default `now()` lato DB userebbe il clock REALE. */
const oreFa = (n: number) => new Date(NOW.getTime() - n * 60 * 60 * 1000);

// ─── Seeding ────────────────────────────────────────────────────────────────

async function seedDatasetBase() {
  await prisma.user.createMany({
    data: UTENTI.map((id) => ({
      id,
      email: `${id}@bib55.test`,
      nome: "Test",
      cognome: id,
      matricola: id.toUpperCase(),
      ruolo: "STUDENTE" as const,
      emailVerificata: true,
    })),
  });

  await prisma.sala.create({
    data: { id: SALA_ID, nome: "Sala BIB-55", piano: 1, capienzaMax: 10 },
  });
  // 4 posti con stati diversi: 1 DISPONIBILE, 2 OCCUPATO, 1 MANUTENZIONE
  // ⇒ tassoOccupazione scoped = (4 - 1) / 4 * 100 = 75.
  await prisma.posto.createMany({
    data: [
      { id: POSTI.disponibile, numero: "B55-1", salaId: SALA_ID, coordinataX: 0, coordinataY: 0, stato: "DISPONIBILE" },
      { id: POSTI.occupato1, numero: "B55-2", salaId: SALA_ID, coordinataX: 1, coordinataY: 0, stato: "OCCUPATO" },
      { id: POSTI.occupato2, numero: "B55-3", salaId: SALA_ID, coordinataX: 2, coordinataY: 0, stato: "OCCUPATO" },
      { id: POSTI.manutenzione, numero: "B55-4", salaId: SALA_ID, coordinataX: 3, coordinataY: 0, stato: "MANUTENZIONE" },
    ],
  });

  await prisma.libro.createMany({
    data: LIBRI.map((id, i) => ({
      id,
      isbn: `bib55-isbn-${i}`,
      titolo: `Libro ${id}`,
      autore: "Autore BIB-55",
    })),
  });

  // ── Prenotazioni ──────────────────────────────────────────────────────────
  // Attive (CONFERMATA/CHECK_IN): posto+slot distinti per non violare il
  // vincolo di esclusione anti-sovrapposizione (solo su CONFERMATA/CHECK_IN).
  // Terminali (COMPLETATA/NO_SHOW/CANCELLATA/SCADUTA): nessun vincolo, riuso libero.
  await prisma.prenotazione.createMany({
    data: [
      // CONFERMATA di oggi ⇒ conta in `prenotazioniOggi` e in `ritardiCheckIn`.
      { id: "bib55-pren-conf-oggi", userId: "bib55-u1", postoId: POSTI.disponibile, data: DATA_OGGI, oraInizio: SLOT.oraInizio, oraFine: SLOT.oraFine, stato: "CONFERMATA", createdAt: oreFa(48) },
      // CHECK_IN di oggi ⇒ conta in `prenotazioniCheckIn`.
      { id: "bib55-pren-checkin-oggi", userId: "bib55-u2", postoId: POSTI.occupato1, data: DATA_OGGI, oraInizio: SLOT.oraInizio, oraFine: SLOT.oraFine, stato: "CHECK_IN", checkInAt: oreFa(1), createdAt: oreFa(48) },
      // COMPLETATE nella finestra 30 giorni ⇒ trend + tasso-noshow ("Completate").
      { id: "bib55-pren-compl-1", userId: "bib55-u1", postoId: POSTI.occupato2, data: giorniFa(5), oraInizio: SLOT.oraInizio, oraFine: SLOT.oraFine, stato: "COMPLETATA", createdAt: oreFa(120) },
      { id: "bib55-pren-compl-2", userId: "bib55-u3", postoId: POSTI.occupato2, data: giorniFa(3), oraInizio: SLOT.oraInizio, oraFine: SLOT.oraFine, stato: "COMPLETATA", createdAt: oreFa(72) },
      // NO_SHOW (stato prenotazione, non LogEvento) nella finestra 30 giorni.
      { id: "bib55-pren-noshow-1", userId: "bib55-u4", postoId: POSTI.manutenzione, data: giorniFa(4), oraInizio: SLOT.oraInizio, oraFine: SLOT.oraFine, stato: "NO_SHOW", createdAt: oreFa(96) },
      // SCADUTA nella finestra 7 giorni ⇒ conta in `prenotazioniScadute` (anomalie).
      { id: "bib55-pren-scaduta-1", userId: "bib55-u2", postoId: POSTI.disponibile, data: giorniFa(2), oraInizio: SLOT.oraInizio, oraFine: SLOT.oraFine, stato: "SCADUTA", createdAt: oreFa(60) },
      // CANCELLATA ⇒ rientra in trend ("Altre"/nessuna) e tasso-noshow ("Altre").
      { id: "bib55-pren-cancellata-1", userId: "bib55-u3", postoId: POSTI.occupato1, data: giorniFa(6), oraInizio: SLOT.oraInizio, oraFine: SLOT.oraFine, stato: "CANCELLATA", createdAt: oreFa(150) },
    ],
  });

  // ── Prestiti ──────────────────────────────────────────────────────────────
  await prisma.prestito.createMany({
    data: [
      // Attivo, scade domani ⇒ `prestitiAttivi` e `prestitiInScadenza`.
      { id: "bib55-prestito-attivo-1", userId: "bib55-u1", libroId: "bib55-l1", dataPrestito: giorniFa(10), dataScadenza: giorniFa(-1), dataRestituzione: null, stato: "ATTIVO" },
      // Attivo, scade fra una settimana ⇒ solo `prestitiAttivi`.
      { id: "bib55-prestito-attivo-2", userId: "bib55-u2", libroId: "bib55-l2", dataPrestito: giorniFa(3), dataScadenza: giorniFa(-7), dataRestituzione: null, stato: "ATTIVO" },
      // Scaduto ⇒ `prestitiScaduti` (anomalie).
      { id: "bib55-prestito-scaduto-1", userId: "bib55-u3", libroId: "bib55-l1", dataPrestito: giorniFa(40), dataScadenza: giorniFa(5), dataRestituzione: null, stato: "SCADUTO" },
      // Restituito ⇒ non conta da nessuna parte (controllo negativo).
      { id: "bib55-prestito-restituito-1", userId: "bib55-u4", libroId: "bib55-l2", dataPrestito: giorniFa(30), dataScadenza: giorniFa(16), dataRestituzione: giorniFa(18), stato: "RESTITUITO" },
    ],
  });

  // ── Richieste di preparazione (Click & Collect) ───────────────────────────
  await prisma.richiestaPreparazione.createMany({
    data: [
      { id: "bib55-rp-1", userId: "bib55-u1", libroId: "bib55-l1", stato: "PENDENTE" },
      { id: "bib55-rp-2", userId: "bib55-u2", libroId: "bib55-l2", stato: "PENDENTE" },
      { id: "bib55-rp-3", userId: "bib55-u3", libroId: "bib55-l1", stato: "COMPLETATA" },
    ],
  });

  // ── LogEvento LEGITTIMI e preesistenti ────────────────────────────────────
  // NO_SHOW: uno per utente distinto (così `distinct: ["userId"]` del batch
  // `RISOLVI_TUTTE_NOSHOW` è deterministico), tutti dentro i 7 giorni tranne uno.
  await prisma.logEvento.createMany({
    data: [
      { id: "bib55-log-noshow-u2", tipo: "NO_SHOW", userId: "bib55-u2", createdAt: giorniFa(1), dettagli: { prenotazioneId: "bib55-pren-scaduta-1" } },
      { id: "bib55-log-noshow-u3", tipo: "NO_SHOW", userId: "bib55-u3", createdAt: giorniFa(2), dettagli: { prenotazioneId: "bib55-pren-cancellata-1" } },
      // Risolto ⇒ escluso dai contatori "non risolti" ma incluso nel distinct del batch.
      { id: "bib55-log-noshow-u4-risolto", tipo: "NO_SHOW", userId: "bib55-u4", createdAt: giorniFa(3), dettagli: { risolto: true, risoltoAt: NOW.toISOString() } },
      // Fuori dalla finestra 7 giorni ⇒ MAI conteggiato (controllo negativo).
      { id: "bib55-log-noshow-vecchio", tipo: "NO_SHOW", userId: "bib55-u4", createdAt: giorniFa(20), dettagli: {} },
      // Altri tipi preesistenti/legittimi che devono restare inalterati.
      { id: "bib55-log-pren-creata", tipo: "PRENOTAZIONE_CREATA", userId: "bib55-u1", prenotazioneId: "bib55-pren-conf-oggi", createdAt: giorniFa(2) },
      { id: "bib55-log-checkin", tipo: "CHECK_IN", userId: "bib55-u2", prenotazioneId: "bib55-pren-checkin-oggi", createdAt: oreFa(1) },
      { id: "bib55-log-prestito", tipo: "PRESTITO_CREATO", userId: "bib55-u1", createdAt: giorniFa(10) },
      // OVERRIDE_BIBLIOTECARIO NON-coda: azione admin generica, deve restare contato/ignorato come prima.
      { id: "bib55-log-override-generico", tipo: "OVERRIDE_BIBLIOTECARIO", userId: "bib55-u1", targetUserId: "bib55-u4", createdAt: giorniFa(4), dettagli: { azione: "DISATTIVAZIONE_UTENTE" } },
    ],
  });
}

/**
 * "Rumore" della CR, aggiunto DOPO la prima misura: i 4 tipi `EVENTI_CODA` più
 * una promozione admin (`OVERRIDE_BIBLIOTECARIO` con
 * `dettagli.azione = "CANCELLAZIONE_ADMIN"`). Tutto dentro le finestre 7/30
 * giorni e con `dettagli.risolto` non impostato: è esattamente la situazione in
 * cui uno scan ampio di `LogEvento` li conterebbe come no-show/anomalie.
 */
async function aggiungiEventiCoda() {
  const utentiRumore = ["bib55-u1", "bib55-u2", "bib55-u3"];
  const righe: Prisma.LogEventoCreateManyInput[] = [];

  for (let i = 0; i < utentiRumore.length; i++) {
    for (let j = 0; j < EVENTI_CODA.length; j++) {
      const tipo = EVENTI_CODA[j];
      righe.push({
        id: `bib55-log-${tipo.toLowerCase()}-${i}`,
        tipo,
        userId: utentiRumore[i],
        targetUserId: utentiRumore[i],
        descrizione: `bib55 rumore ${tipo}`,
        createdAt: oreFa(2 + i),
        // Nessun `risolto`: massimizza la probabilità di essere conteggiato
        // per errore da un eventuale filtro `!dettagli?.risolto`.
        dettagli: { slot: "bib55" },
      });
    }
  }

  // Promozione admin: come BIB-49 in `src/app/api/admin/prenotazioni/route.ts`.
  righe.push({
    id: "bib55-log-override-cancellazione-admin",
    tipo: "OVERRIDE_BIBLIOTECARIO",
    userId: "bib55-u1",
    targetUserId: "bib55-u2",
    prenotazioneId: "bib55-pren-checkin-oggi",
    descrizione: "bib55 promozione da coda innescata da cancellazione del personale",
    createdAt: oreFa(1),
    dettagli: {
      azione: AZIONE_PROMOZIONE_ADMIN,
      prenotazioneCancellataId: "bib55-pren-scaduta-1",
      listaAttesaId: "bib55-la-finta",
    },
  });

  await prisma.logEvento.createMany({ data: righe });
}

// ─── Misure (helper che rispecchiano le `where` del prodotto, scoped a bib55) ─

/** Stesso predicato JS del prodotto: tiene solo i `LogEvento` non risolti. */
function nonRisolti<T extends { dettagli: unknown }>(eventi: T[]): T[] {
  return eventi.filter((evento) => {
    const dettagli = evento.dettagli as { risolto?: boolean } | null;
    return !dettagli?.risolto;
  });
}

/** Contatori della dashboard admin — mirror di `src/app/admin/page.tsx`. */
async function misuraDashboard() {
  const setteGiorniFa = giorniFa(7);
  const domani = giorniFa(-1);

  const [
    totaleUtenti,
    totalePosti,
    prenotazioniOggi,
    prenotazioniCheckIn,
    prestitiAttivi,
    noShowRecentiTutti,
    postiDisponibili,
    postiManutenzione,
    prestitiInScadenza,
    richiestePendenti,
  ] = await Promise.all([
    prisma.user.count({ where: { id: { in: [...UTENTI] } } }),
    prisma.posto.count({ where: { salaId: SALA_ID } }),
    prisma.prenotazione.count({ where: { userId: { in: [...UTENTI] }, data: DATA_OGGI } }),
    prisma.prenotazione.count({ where: { userId: { in: [...UTENTI] }, stato: "CHECK_IN" } }),
    prisma.prestito.count({ where: { userId: { in: [...UTENTI] }, dataRestituzione: null } }),
    prisma.logEvento.findMany({
      where: { userId: { in: [...UTENTI] }, tipo: "NO_SHOW", createdAt: { gte: setteGiorniFa } },
      select: { id: true, dettagli: true },
    }),
    prisma.posto.count({ where: { salaId: SALA_ID, stato: "DISPONIBILE" } }),
    prisma.posto.count({ where: { salaId: SALA_ID, stato: "MANUTENZIONE" } }),
    prisma.prestito.count({
      where: { userId: { in: [...UTENTI] }, dataRestituzione: null, dataScadenza: { lte: domani } },
    }),
    prisma.richiestaPreparazione.count({ where: { userId: { in: [...UTENTI] }, stato: "PENDENTE" } }),
  ]);

  // Stesso filtro JS del prodotto: solo NO_SHOW non risolti.
  const noShowRecenti = nonRisolti(noShowRecentiTutti).length;

  const tassoOccupazione = Math.round(
    ((totalePosti - postiDisponibili) / totalePosti) * 100,
  );

  return {
    totaleUtenti,
    totalePosti,
    prenotazioniOggi,
    prenotazioniCheckIn,
    prestitiAttivi,
    noShowRecenti,
    postiDisponibili,
    postiManutenzione,
    prestitiInScadenza,
    richiestePendenti,
    tassoOccupazione,
  };
}

/**
 * Feed anomalie — mirror di `src/app/admin/anomalie/page.tsx` + del batch
 * `RISOLVI_TUTTE_NOSHOW` di `src/app/api/admin/anomalie/route.ts`.
 */
async function misuraAnomalie() {
  const setteGiorniFa = giorniFa(7);

  const [noShowRecentiTutti, prenotazioniScadute, prestitiScaduti, ritardiCheckIn, batchNoShowGrezzo] =
    await Promise.all([
      prisma.logEvento.findMany({
        where: { userId: { in: [...UTENTI] }, tipo: "NO_SHOW", createdAt: { gte: setteGiorniFa } },
        include: { user: { select: { nome: true, cognome: true, email: true, matricola: true } } },
        orderBy: { createdAt: "desc" },
      }),
      prisma.prenotazione.count({
        where: { userId: { in: [...UTENTI] }, stato: "SCADUTA", data: { gte: setteGiorniFa } },
      }),
      prisma.prestito.count({ where: { userId: { in: [...UTENTI] }, stato: "SCADUTO" } }),
      prisma.prenotazione.count({
        where: { userId: { in: [...UTENTI] }, stato: "CONFERMATA", data: DATA_OGGI },
      }),
      // Batch RISOLVI_TUTTE_NOSHOW: distinct per userId, poi filtro "non risolti".
      prisma.logEvento.findMany({
        where: { userId: { in: [...UTENTI] }, tipo: "NO_SHOW", createdAt: { gte: setteGiorniFa } },
        distinct: ["userId"],
      }),
    ]);

  const noShow = nonRisolti(noShowRecentiTutti).length;
  // La pagina mostra `noShowRecenti.slice(0, 20)`: qui basta la lunghezza.
  const noShowPerTabella = Math.min(noShow, 20);
  const batchNoShowDistinct = nonRisolti(batchNoShowGrezzo).length;

  const totaleAnomalieAttive = noShow + prenotazioniScadute + prestitiScaduti + ritardiCheckIn;

  return {
    noShow,
    noShowPerTabella,
    prenotazioniScadute,
    prestitiScaduti,
    ritardiCheckIn,
    totaleAnomalieAttive,
    batchNoShowDistinct,
  };
}

/** Endpoint REALE `GET /api/admin/statistiche` per i tre tipi richiesti da BIB-55. */
async function misuraEndpointStatistiche() {
  const chiama = async (tipo: string) => {
    const res = await statisticheRoute.GET(
      new NextRequest(`http://localhost/api/admin/statistiche?tipo=${tipo}`),
    );
    expect(res.status).toBe(200);
    return (await res.json()) as { data: unknown };
  };

  return {
    occupazioneOraria: await chiama("occupazione-oraria"),
    trendPrenotazioni: await chiama("trend-prenotazioni"),
    tassoNoshow: await chiama("tasso-noshow"),
  };
}

async function misuraTutto() {
  // Sequenziale: niente interleaving fra dashboard/anomalie/endpoint.
  const dashboard = await misuraDashboard();
  const anomalie = await misuraAnomalie();
  const endpoint = await misuraEndpointStatistiche();
  return { dashboard, anomalie, endpoint };
}

// ─── Pulizia scoped (ordine sicuro rispetto alle foreign key) ────────────────

async function pulisciBib55() {
  await prisma.logEvento.deleteMany({
    where: {
      OR: [
        { userId: { in: [...UTENTI] } },
        { targetUserId: { in: [...UTENTI] } },
        { descrizione: { contains: "bib55" } },
      ],
    },
  });
  await prisma.richiestaPreparazione.deleteMany({ where: { userId: { in: [...UTENTI] } } });
  await prisma.prestito.deleteMany({ where: { userId: { in: [...UTENTI] } } });
  await prisma.listaAttesa.deleteMany({ where: { postoId: { in: POSTI_IDS } } });
  await prisma.notifica.deleteMany({ where: { userId: { in: [...UTENTI] } } });
  await prisma.prenotazione.deleteMany({ where: { userId: { in: [...UTENTI] } } });
  await prisma.posto.deleteMany({ where: { salaId: SALA_ID } });
  await prisma.libro.deleteMany({ where: { id: { in: [...LIBRI] } } });
  await prisma.sala.deleteMany({ where: { id: SALA_ID } });
  await prisma.user.deleteMany({ where: { id: { in: [...UTENTI] } } });
}

// ─── Ciclo di vita ─────────────────────────────────────────────────────────

beforeAll(async () => {
  authHoisted.auth.mockResolvedValue({ user: { id: "bib55-admin", ruolo: "ADMIN" } });
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  await pulisciBib55();
  await seedDatasetBase();
});

afterAll(async () => {
  vi.useRealTimers();
  await pulisciBib55();
  await prisma.$disconnect();
});

// ═══════════════════════════════════════════════════════════════════════════
// BIB-55 · CA-06 — gli EVENTI_CODA non spostano di una virgola le metriche
// ═══════════════════════════════════════════════════════════════════════════

describe("BIB-55 · CA-06 — le statistiche non vengono inquinate dagli eventi di coda", () => {
  it("[TC-BIB55-001] il dataset base produce metriche non banali (guardia di sanità)", async () => {
    // `clearMocks`/`restoreMocks` in vitest.config azzerano i mock fra i test.
    authHoisted.auth.mockResolvedValue({ user: { id: "bib55-admin", ruolo: "ADMIN" } });

    const { dashboard, anomalie } = await misuraTutto();

    // Se questi valori fossero tutti 0, il confronto prima/dopo sarebbe vero
    // per vacuità: qui si fissano gli attesi del dataset base.
    expect(dashboard.totaleUtenti).toBe(4);
    expect(dashboard.totalePosti).toBe(4);
    expect(dashboard.postiDisponibili).toBe(1);
    expect(dashboard.postiManutenzione).toBe(1);
    expect(dashboard.tassoOccupazione).toBe(75);
    // 2 prenotazioni datate oggi: la CONFERMATA e la CHECK_IN.
    expect(dashboard.prenotazioniOggi).toBe(2);
    expect(dashboard.prenotazioniCheckIn).toBe(1);
    expect(dashboard.prestitiAttivi).toBe(3);
    // `dataScadenza <= domani` + `dataRestituzione: null`: l'ATTIVO che scade
    // domani e lo SCADUTO mai restituito (già oltre scadenza) ⇒ 2.
    expect(dashboard.prestitiInScadenza).toBe(2);
    expect(dashboard.richiestePendenti).toBe(2);
    // 3 NO_SHOW entro 7 giorni (u2, u3, u4-risolto) ⇒ non risolti = 2.
    expect(dashboard.noShowRecenti).toBe(2);

    expect(anomalie.noShow).toBe(2);
    expect(anomalie.batchNoShowDistinct).toBe(2);
    expect(anomalie.prenotazioniScadute).toBe(1);
    expect(anomalie.prestitiScaduti).toBe(1);
    expect(anomalie.ritardiCheckIn).toBe(1);
    expect(anomalie.totaleAnomalieAttive).toBe(2 + 1 + 1 + 1);
  });

  it("[TC-BIB55-002] aggiungere CODA_* + promozione admin non cambia NESSUNA metrica", async () => {
    authHoisted.auth.mockResolvedValue({ user: { id: "bib55-admin", ruolo: "ADMIN" } });

    // 1) MISURA PRIMA
    const prima = await misuraTutto();

    // 2) INIETTA il rumore della CR
    await aggiungiEventiCoda();

    // Sanity: gli eventi coda sono davvero finiti nel DB e nelle finestre.
    const totCoda = await prisma.logEvento.count({
      where: { tipo: { in: [...EVENTI_CODA] }, userId: { in: [...UTENTI] } },
    });
    expect(totCoda).toBe(EVENTI_CODA.length * 3);
    const totPromozioneAdmin = await prisma.logEvento.count({
      where: {
        tipo: "OVERRIDE_BIBLIOTECARIO",
        userId: { in: [...UTENTI] },
        dettagli: { path: ["azione"], equals: AZIONE_PROMOZIONE_ADMIN },
      },
    });
    expect(totPromozioneAdmin).toBe(1);

    // 3) MISURA DOPO
    const dopo = await misuraTutto();

    // 4) DEVONO COINCIDERE ESATTAMENTE — è l'AC di BIB-55.
    expect(dopo).toEqual(prima);

    // Ridondante ma esplicito sui punti caldi citati dalla card.
    expect(dopo.dashboard.noShowRecenti).toBe(prima.dashboard.noShowRecenti);
    expect(dopo.anomalie.noShow).toBe(prima.anomalie.noShow);
    expect(dopo.anomalie.batchNoShowDistinct).toBe(prima.anomalie.batchNoShowDistinct);
    expect(dopo.anomalie.totaleAnomalieAttive).toBe(prima.anomalie.totaleAnomalieAttive);
    expect(dopo.endpoint.occupazioneOraria).toEqual(prima.endpoint.occupazioneOraria);
    expect(dopo.endpoint.trendPrenotazioni).toEqual(prima.endpoint.trendPrenotazioni);
    expect(dopo.endpoint.tassoNoshow).toEqual(prima.endpoint.tassoNoshow);
  });
});
