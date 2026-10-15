// ============================================================================
// Test integrazione — modifica di una prenotazione dallo staff (D-10)
// ============================================================================
// COSA: POST /api/admin/prenotazioni con azione MODIFICA, su PostgreSQL reale
//       con il vincolo di esclusione anti-sovrapposizione introdotto da CR01.
// PERCHE': la modifica dello staff non controllava l'intervallo risultante.
//       Un orario invertito o una sovrapposizione con un'altra prenotazione
//       attiva arrivavano al vincolo del database, che li rifiutava, ma la
//       route rispondeva "Errore interno del server" (500). Il vincolo
//       proteggeva i dati; mancava una risposta comprensibile allo staff.

import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { assertTestDatabaseUrl, DEFAULT_TEST_DATABASE_URL } from "../fixtures/database";
import { giornoApertura } from "../fixtures/calendario";

const mocks = vi.hoisted(() => ({ auth: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/rate-limit", () => ({ staffCriticalApiRateLimiter: vi.fn(async () => null) }));

const databaseUrl = process.env.DATABASE_URL ?? DEFAULT_TEST_DATABASE_URL;
assertTestDatabaseUrl(databaseUrl);

const { prisma } = await import("@/lib/prisma");
const route = await import("@/app/api/admin/prenotazioni/route");

const P = "cov-mod-";
const SALA = `${P}sala`;
const POSTO_A = `${P}posto-a`;
const POSTO_B = `${P}posto-b`;
const UTENTE_1 = `${P}u1`;
const UTENTE_2 = `${P}u2`;
const STAFF = `${P}staff`;
const GIORNO = giornoApertura(5);
const ora = (hhmm: string) => new Date(`1970-01-01T${hhmm}:00.000Z`);

async function pulisci() {
  await prisma.notifica.deleteMany({ where: { userId: { startsWith: P } } });
  await prisma.logEvento.deleteMany({ where: { userId: { startsWith: P } } });
  await prisma.prenotazione.deleteMany({ where: { postoId: { in: [POSTO_A, POSTO_B] } } });
  await prisma.posto.deleteMany({ where: { salaId: SALA } });
  await prisma.sala.deleteMany({ where: { id: SALA } });
  await prisma.user.deleteMany({ where: { id: { startsWith: P } } });
}

function modifica(prenotazioneId: string, nuoviDati: Record<string, unknown>) {
  return route.POST(
    new NextRequest("http://localhost/api/admin/prenotazioni", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ azione: "MODIFICA", prenotazioneId, nuoviDati }),
    }),
  );
}

beforeAll(pulisci);
afterAll(pulisci);

beforeEach(async () => {
  await pulisci();
  mocks.auth.mockResolvedValue({ user: { id: STAFF, email: "staff@biblioflow.test", ruolo: "BIBLIOTECARIO" } });
  for (const id of [UTENTE_1, UTENTE_2, STAFF]) {
    await prisma.user.create({ data: { id, email: `${id}@biblioflow.test`, nome: id, cognome: "Test", ruolo: "STUDENTE" } });
  }
  await prisma.sala.create({ data: { id: SALA, nome: "Sala modifica", piano: 1, capienzaMax: 2 } });
  await prisma.posto.createMany({
    data: [
      { id: POSTO_A, numero: "M1", salaId: SALA, coordinataX: 1, coordinataY: 1 },
      { id: POSTO_B, numero: "M2", salaId: SALA, coordinataX: 2, coordinataY: 1 },
    ],
  });
  await prisma.prenotazione.createMany({
    data: [
      { id: `${P}p1`, userId: UTENTE_1, postoId: POSTO_A, data: GIORNO.data, oraInizio: ora("09:00"), oraFine: ora("11:00"), stato: "CONFERMATA" },
      { id: `${P}p2`, userId: UTENTE_2, postoId: POSTO_A, data: GIORNO.data, oraInizio: ora("12:00"), oraFine: ora("14:00"), stato: "CONFERMATA" },
      { id: `${P}p3`, userId: UTENTE_2, postoId: POSTO_B, data: GIORNO.data, oraInizio: ora("09:00"), oraFine: ora("10:00"), stato: "CONFERMATA" },
    ],
  });
});

describe("MODIFICA di una prenotazione", () => {
  it("[TC-ADM-MOD-001] una sovrapposizione con un'altra prenotazione attiva risponde 409 e non cambia nulla", async () => {
    const risposta = await modifica(`${P}p1`, { oraFine: "13:00" });
    expect(risposta.status).toBe(409);
    await expect(risposta.json()).resolves.toMatchObject({ error: expect.stringContaining("già prenotato") });
    await expect(prisma.prenotazione.findUniqueOrThrow({ where: { id: `${P}p1` } })).resolves.toMatchObject({ oraFine: ora("11:00") });
    await expect(prisma.logEvento.count({ where: { prenotazioneId: `${P}p1` } })).resolves.toBe(0);
  });

  it("[TC-ADM-MOD-002] spostare su un posto gia' occupato in quella fascia risponde 409", async () => {
    const risposta = await modifica(`${P}p1`, { postoId: POSTO_B });
    expect(risposta.status).toBe(409);
    await expect(prisma.prenotazione.findUniqueOrThrow({ where: { id: `${P}p1` } })).resolves.toMatchObject({ postoId: POSTO_A });
  });

  it("[TC-ADM-MOD-003] un intervallo risultante invertito risponde 422", async () => {
    const soloInizio = await modifica(`${P}p1`, { oraInizio: "11:30" });
    expect(soloInizio.status).toBe(422);
    const inizioUgualeFine = await modifica(`${P}p1`, { oraInizio: "10:00", oraFine: "10:00" });
    expect(inizioUgualeFine.status).toBe(422);
  });

  it("[TC-ADM-MOD-004] una modifica valida aggiorna la prenotazione, la collega al log e avvisa l'utente", async () => {
    const risposta = await modifica(`${P}p1`, { oraFine: "12:00" });
    expect(risposta.status).toBe(200);
    await expect(prisma.prenotazione.findUniqueOrThrow({ where: { id: `${P}p1` } })).resolves.toMatchObject({ oraFine: ora("12:00") });
    const log = await prisma.logEvento.findFirstOrThrow({ where: { prenotazioneId: `${P}p1` } });
    expect(log).toMatchObject({ tipo: "OVERRIDE_BIBLIOTECARIO", userId: UTENTE_1 });
    await expect(prisma.notifica.count({ where: { userId: UTENTE_1, titolo: "Prenotazione modificata" } })).resolves.toBe(1);
  });

  it("[TC-ADM-MOD-005] campi malformati 422, dati mancanti 400, prenotazione inesistente 404", async () => {
    expect((await modifica(`${P}p1`, { data: "15/01/2030" })).status).toBe(422);
    expect((await modifica(`${P}p1`, { oraInizio: 900 })).status).toBe(422);
    expect((await modifica(`${P}p1`, { oraFine: "25:00" })).status).toBe(422);
    expect(
      (
        await route.POST(
          new NextRequest("http://localhost/api/admin/prenotazioni", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ azione: "MODIFICA", prenotazioneId: `${P}p1` }),
          }),
        )
      ).status,
    ).toBe(400);
    expect((await modifica(`${P}inesistente`, { oraFine: "12:00" })).status).toBe(404);
  });
});
