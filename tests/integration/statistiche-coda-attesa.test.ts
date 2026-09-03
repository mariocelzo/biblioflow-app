/**
 * 🧪 TEST DI INTEGRAZIONE — BIB-56: indicatore "utenti in lista d'attesa"
 *
 * Verifica il nuovo `case "coda-attesa"` di
 * `src/app/api/admin/statistiche/route.ts`: la query di aggregazione deve
 * contare SOLO le richieste `ListaAttesa` con `stato = IN_ATTESA`,
 * raggruppandole per sala e per posto.
 *
 * Come `tests/integration/automazioni.test.ts` e `tests/integration/concorrenza.test.ts`
 * il test gira contro il PostgreSQL reale di test (container `biblioflow-test-db`
 * su 127.0.0.1:5433). Vitest esegue i file di test in parallelo sullo STESSO
 * database, quindi:
 *
 *   • PULIZIA SCOPED, MAI globale: si toccano esclusivamente le righe con id
 *     prefisso `bib56-` (in `beforeAll` prima del seed e in `afterAll`), in
 *     ordine sicuro rispetto alle foreign key. Nessun `resetTestDatabase()`.
 *
 *   • ASSERZIONI SCOPED: il `groupBy` del route vede anche le righe IN_ATTESA
 *     seminate dagli altri file (`bib23-*`, `bib47-*`, …). Le asserzioni
 *     filtrano quindi il risultato sulle sole sale/posti di questo test,
 *     riconoscibili dal nome ("Sala BIB56 …") e dal numero posto ("B56…").
 *
 * L'unico modulo mockato è `@/lib/auth`: `auth()` restituisce una sessione con
 * il ruolo richiesto dal singolo caso. `@/lib/prisma` resta quello reale
 * (import dinamico DOPO il mock, come negli altri test di integrazione).
 */

import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { StatoListaAttesa, UserRole } from "@prisma/client";

import {
  assertTestDatabaseUrl,
  DEFAULT_TEST_DATABASE_URL,
} from "../fixtures/database";

// ─── Mock della sola autenticazione ────────────────────────────────────────
// Il route importa `{ auth }` da `@/lib/auth`: sostituendo il modulo si evita
// anche la catena `@/lib/auth` → `@/lib/env` (che farebbe `process.exit` senza
// le NEXTAUTH_*). Tutto il resto (Prisma incluso) è reale.
const mocks = vi.hoisted(() => ({ auth: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));

const databaseUrl = process.env.DATABASE_URL ?? DEFAULT_TEST_DATABASE_URL;
assertTestDatabaseUrl(databaseUrl);

// Import dinamici DOPO il mock, così il modulo mockato è già registrato quando
// il route viene caricato.
const { prisma } = await import("@/lib/prisma");
const statisticheRoute = await import("@/app/api/admin/statistiche/route");

// ─── Identificatori delle fixture (prefisso `bib56-` per la pulizia scoped) ──

const SALA_ALFA = { id: "bib56-sala-alfa", nome: "Sala BIB56 Alfa" };
const SALA_BETA = { id: "bib56-sala-beta", nome: "Sala BIB56 Beta" };

// 3 posti su 2 sale.
const POSTO_A1 = { id: "bib56-posto-a1", numero: "B56A1", salaId: SALA_ALFA.id };
const POSTO_A2 = { id: "bib56-posto-a2", numero: "B56A2", salaId: SALA_ALFA.id };
const POSTO_B1 = { id: "bib56-posto-b1", numero: "B56B1", salaId: SALA_BETA.id };

// 8 studenti in coda (gli id servono anche alla pulizia scoped).
const UTENTI = Array.from({ length: 8 }, (_, i) => `bib56-u${i + 1}`);

// `ListaAttesa.data` = `@db.Date` (mezzanotte UTC); `oraInizio`/`oraFine` = `@db.Time`.
const DATA = new Date("2031-05-10T00:00:00.000Z");
const ORA_INIZIO = new Date("1970-01-01T09:00:00.000Z");
const ORA_FINE = new Date("1970-01-01T11:00:00.000Z");

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

/** Crea una sala e i suoi posti. */
async function creaSala(
  sala: { id: string; nome: string },
  posti: { id: string; numero: string; salaId: string }[],
) {
  await prisma.sala.create({
    data: { id: sala.id, nome: sala.nome, piano: 1, capienzaMax: 10 },
  });
  for (const posto of posti) {
    await prisma.posto.create({
      data: {
        id: posto.id,
        numero: posto.numero,
        salaId: posto.salaId,
        coordinataX: 0,
        coordinataY: 0,
      },
    });
  }
}

/**
 * Inserisce una richiesta di lista d'attesa. Lo slot è sempre lo stesso: il
 * vincolo `@@unique` parziale su IN_ATTESA vale solo a parità di utente, quindi
 * più righe IN_ATTESA sullo stesso posto usano utenti diversi.
 */
async function creaRichiesta(
  id: string,
  userId: string,
  postoId: string,
  stato: StatoListaAttesa,
) {
  return prisma.listaAttesa.create({
    data: {
      id,
      userId,
      postoId,
      data: DATA,
      oraInizio: ORA_INIZIO,
      oraFine: ORA_FINE,
      stato,
    },
  });
}

// ─── Sessione e richiesta HTTP fittizie ────────────────────────────────────

function sessione(ruolo: UserRole) {
  return {
    user: {
      id: "bib56-staff",
      email: "staff@biblioflow.test",
      nome: "Biblio",
      cognome: "Tecario",
      ruolo,
      isPendolare: false,
      necessitaAccessibilita: false,
    },
  };
}

function richiesta(tipo: string) {
  return new NextRequest(`http://localhost/api/admin/statistiche?tipo=${tipo}`);
}

// ─── Pulizia SCOPED (solo righe `bib56-*`, ordine FK-safe) ─────────────────

async function pulisciBib56() {
  await prisma.listaAttesa.deleteMany({ where: { id: { startsWith: "bib56-" } } });
  await prisma.posto.deleteMany({ where: { id: { startsWith: "bib56-" } } });
  await prisma.sala.deleteMany({ where: { id: { startsWith: "bib56-" } } });
  await prisma.user.deleteMany({ where: { id: { startsWith: "bib56-" } } });
}

// ─── Ciclo di vita ─────────────────────────────────────────────────────────
//
// Il route è di sola lettura: il seed viene fatto una volta in `beforeAll`
// (preceduto da una pulizia difensiva) e rimosso in `afterAll`.
//
// Conteggi attesi delle sole righe IN_ATTESA di questo test:
//   • Posto B56A1 → 3   (u1, u2, u3)
//   • Posto B56A2 → 1   (u4)
//   • Posto B56B1 → 2   (u5, u6)
//   ⇒ Sala Alfa = 4, Sala Beta = 2
//   ⇒ perPosto (desc): B56A1(3), B56B1(2), B56A2(1)
// Le righe PROMOSSA / ANNULLATA / SCADUTA di u7 e u8 NON devono essere contate.

beforeAll(async () => {
  await pulisciBib56();

  for (const id of UTENTI) await creaUtente(id);
  await creaSala(SALA_ALFA, [POSTO_A1, POSTO_A2]);
  await creaSala(SALA_BETA, [POSTO_B1]);

  // Coda reale (IN_ATTESA) — ciò che l'indicatore deve contare.
  await creaRichiesta("bib56-la-a1-u1", "bib56-u1", POSTO_A1.id, "IN_ATTESA");
  await creaRichiesta("bib56-la-a1-u2", "bib56-u2", POSTO_A1.id, "IN_ATTESA");
  await creaRichiesta("bib56-la-a1-u3", "bib56-u3", POSTO_A1.id, "IN_ATTESA");
  await creaRichiesta("bib56-la-a2-u4", "bib56-u4", POSTO_A2.id, "IN_ATTESA");
  await creaRichiesta("bib56-la-b1-u5", "bib56-u5", POSTO_B1.id, "IN_ATTESA");
  await creaRichiesta("bib56-la-b1-u6", "bib56-u6", POSTO_B1.id, "IN_ATTESA");

  // Rumore da ignorare: stati non IN_ATTESA sugli stessi posti.
  await creaRichiesta("bib56-la-a1-u7", "bib56-u7", POSTO_A1.id, "PROMOSSA");
  await creaRichiesta("bib56-la-a1-u8", "bib56-u8", POSTO_A1.id, "ANNULLATA");
  await creaRichiesta("bib56-la-a2-u7", "bib56-u7", POSTO_A2.id, "PROMOSSA");
  await creaRichiesta("bib56-la-b1-u8", "bib56-u8", POSTO_B1.id, "SCADUTA");
});

afterAll(async () => {
  await pulisciBib56();
  await prisma.$disconnect();
});

// ═══════════════════════════════════════════════════════════════════════════
// BIB-56 — aggregazione della coda d'attesa nella dashboard statistiche
// ═══════════════════════════════════════════════════════════════════════════

describe("BIB-56 · statistiche `coda-attesa` (indicatore utenti in lista d'attesa)", () => {
  it("[TC-BIB56-001] conta per SALA solo le richieste IN_ATTESA", async () => {
    mocks.auth.mockResolvedValue(sessione("BIBLIOTECARIO"));

    const risposta = await statisticheRoute.GET(richiesta("coda-attesa"));
    expect(risposta.status).toBe(200);

    const body = (await risposta.json()) as {
      data: { perSala: Array<{ sala: string; count: number }> };
    };

    const alfa = body.data.perSala.find((r) => r.sala === SALA_ALFA.nome);
    const beta = body.data.perSala.find((r) => r.sala === SALA_BETA.nome);

    // 3 (B56A1) + 1 (B56A2) = 4 ; 2 (B56B1). PROMOSSA/ANNULLATA/SCADUTA esclusi.
    expect(alfa?.count).toBe(4);
    expect(beta?.count).toBe(2);
  });

  it("[TC-BIB56-002] dettaglia per POSTO con conteggi corretti e ordine decrescente", async () => {
    mocks.auth.mockResolvedValue(sessione("ADMIN"));

    const risposta = await statisticheRoute.GET(richiesta("coda-attesa"));
    expect(risposta.status).toBe(200);

    const body = (await risposta.json()) as {
      data: { perPosto: Array<{ posto: string; sala: string; count: number }> };
    };

    // Filtra sulle sole righe di questo test, preservando l'ordine del route.
    const miei = body.data.perPosto.filter((r) =>
      r.sala.startsWith("Sala BIB56 "),
    );

    expect(miei).toEqual([
      { posto: "B56A1", sala: SALA_ALFA.nome, count: 3 },
      { posto: "B56B1", sala: SALA_BETA.nome, count: 2 },
      { posto: "B56A2", sala: SALA_ALFA.nome, count: 1 },
    ]);
  });

  it("[TC-BIB56-003] la somma per sala coincide con quella per posto (coerenza interna)", async () => {
    mocks.auth.mockResolvedValue(sessione("BIBLIOTECARIO"));

    const risposta = await statisticheRoute.GET(richiesta("coda-attesa"));
    const body = (await risposta.json()) as {
      data: {
        perSala: Array<{ sala: string; count: number }>;
        perPosto: Array<{ posto: string; sala: string; count: number }>;
      };
    };

    for (const nomeSala of [SALA_ALFA.nome, SALA_BETA.nome]) {
      const totSala =
        body.data.perSala.find((r) => r.sala === nomeSala)?.count ?? 0;
      const totPosti = body.data.perPosto
        .filter((r) => r.sala === nomeSala)
        .reduce((somma, r) => somma + r.count, 0);
      expect(totSala).toBe(totPosti);
    }
  });

  it("[TC-BIB56-004] nega l'accesso a chi non è staff (403) e senza sessione (401)", async () => {
    mocks.auth.mockResolvedValueOnce(sessione("STUDENTE"));
    expect((await statisticheRoute.GET(richiesta("coda-attesa"))).status).toBe(403);

    mocks.auth.mockResolvedValueOnce(null);
    expect((await statisticheRoute.GET(richiesta("coda-attesa"))).status).toBe(401);
  });
});
