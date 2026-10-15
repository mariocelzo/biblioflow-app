// ============================================================================
// Test integrazione — ciclo di vita di una richiesta in lista d'attesa (CR02)
// ============================================================================
// COSA: le funzioni di dominio della coda su PostgreSQL reale:
//         entraInCoda → posizioneInCoda → annullaRichiestaCoda
//         promuoviPrimoInCoda con slot ancora occupato o coda vuota.
// PERCHE': l'uscita volontaria dalla coda era la parte meno verificata della
//       CR02: i test esistenti coprivano ingresso e promozione, non
//       l'annullamento, che deve (a) essere possibile solo al proprietario,
//       (b) non rivelare l'esistenza di richieste altrui, (c) non poter essere
//       ripetuto, (d) lasciare traccia nel log e (e) far avanzare chi sta dietro.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  assertTestDatabaseUrl,
  createTestDatabaseClient,
  DEFAULT_TEST_DATABASE_URL,
} from "../fixtures/database";
import { giornoApertura } from "../fixtures/calendario";
import {
  annullaRichiestaCoda,
  entraInCoda,
  posizioneInCoda,
  promuoviPrimoInCoda,
} from "@/lib/prenotazioni-service";
import {
  RichiestaCodaDuplicata,
  RichiestaCodaNonAnnullabile,
  RichiestaCodaNonTrovata,
  ValidazioneError,
} from "@/lib/prenotazioni-errors";

const databaseUrl = process.env.DATABASE_URL ?? DEFAULT_TEST_DATABASE_URL;
assertTestDatabaseUrl(databaseUrl);
const { prisma, pool } = createTestDatabaseClient(databaseUrl);

const P = "cov-coda-";
const SALA = `${P}sala`;
const POSTO = `${P}posto`;
const ANNA = `${P}anna`;
const BRUNO = `${P}bruno`;
const CARLA = `${P}carla`;
const GIORNO = giornoApertura(4);
const SLOT = { postoId: POSTO, data: GIORNO.iso, oraInizio: "10:00", oraFine: "12:00" };

async function pulisci() {
  await prisma.logEvento.deleteMany({
    where: { OR: [{ userId: { startsWith: P } }, { targetUserId: { startsWith: P } }] },
  });
  await prisma.listaAttesa.deleteMany({ where: { postoId: POSTO } });
  await prisma.prenotazione.deleteMany({ where: { postoId: POSTO } });
  await prisma.posto.deleteMany({ where: { id: POSTO } });
  await prisma.sala.deleteMany({ where: { id: SALA } });
  await prisma.user.deleteMany({ where: { id: { startsWith: P } } });
}

beforeAll(pulisci);
afterAll(async () => {
  await pulisci();
  await prisma.$disconnect();
  await pool.end();
});

beforeEach(async () => {
  await pulisci();
  for (const id of [ANNA, BRUNO, CARLA]) {
    await prisma.user.create({
      data: { id, email: `${id}@biblioflow.test`, nome: id, cognome: "Coda", ruolo: "STUDENTE" },
    });
  }
  await prisma.sala.create({
    data: { id: SALA, nome: "Sala coda", piano: 1, capienzaMax: 1, orarioApertura: "08:00", orarioChiusura: "20:00" },
  });
  await prisma.posto.create({ data: { id: POSTO, numero: "Q1", salaId: SALA, coordinataX: 1, coordinataY: 1 } });
});

describe("ingresso e posizione", () => {
  it("[TC-CODA-VITA-001] tre utenti in coda ottengono le posizioni 1, 2, 3 in ordine di arrivo", async () => {
    for (const userId of [ANNA, BRUNO, CARLA]) {
      await entraInCoda({ ...SLOT, userId }, prisma);
    }
    await expect(posizioneInCoda({ ...SLOT, userId: ANNA }, prisma)).resolves.toBe(1);
    await expect(posizioneInCoda({ ...SLOT, userId: BRUNO }, prisma)).resolves.toBe(2);
    await expect(posizioneInCoda({ ...SLOT, userId: CARLA }, prisma)).resolves.toBe(3);
  });

  it("[TC-CODA-VITA-002] non si entra due volte nella stessa coda e chi non e' in coda non ha una posizione", async () => {
    await entraInCoda({ ...SLOT, userId: ANNA }, prisma);
    await expect(entraInCoda({ ...SLOT, userId: ANNA }, prisma)).rejects.toBeInstanceOf(RichiestaCodaDuplicata);
    await expect(posizioneInCoda({ ...SLOT, userId: BRUNO }, prisma)).rejects.toBeInstanceOf(RichiestaCodaNonTrovata);
  });

  it("[TC-CODA-VITA-003] data e orari non validi vengono rifiutati prima di toccare il database", async () => {
    await expect(entraInCoda({ ...SLOT, userId: ANNA, data: "15/01/2030" }, prisma)).rejects.toBeInstanceOf(ValidazioneError);
    await expect(entraInCoda({ ...SLOT, userId: ANNA, oraInizio: "25:00" }, prisma)).rejects.toBeInstanceOf(ValidazioneError);
    await expect(entraInCoda({ ...SLOT, userId: ANNA, data: new Date("non una data") }, prisma)).rejects.toBeInstanceOf(ValidazioneError);
    await expect(prisma.listaAttesa.count({ where: { postoId: POSTO } })).resolves.toBe(0);
  });
});

describe("annullamento", () => {
  it("[TC-CODA-VITA-010] il proprietario esce dalla coda, resta traccia nel log e chi era dietro avanza", async () => {
    const richiestaAnna = await entraInCoda({ ...SLOT, userId: ANNA }, prisma);
    await entraInCoda({ ...SLOT, userId: BRUNO }, prisma);

    const annullata = await annullaRichiestaCoda(ANNA, richiestaAnna.id, prisma);
    expect(annullata.stato).toBe("ANNULLATA");
    await expect(prisma.listaAttesa.findUniqueOrThrow({ where: { id: richiestaAnna.id } })).resolves.toMatchObject({
      stato: "ANNULLATA",
    });

    const log = await prisma.logEvento.findFirstOrThrow({ where: { tipo: "CODA_ANNULLATA", userId: ANNA } });
    expect(log.dettagli).toMatchObject({ listaAttesaId: richiestaAnna.id, postoId: POSTO, data: GIORNO.iso, oraInizio: "10:00" });

    await expect(posizioneInCoda({ ...SLOT, userId: BRUNO }, prisma)).resolves.toBe(1);
  });

  it("[TC-CODA-VITA-011] la richiesta di un altro utente risulta inesistente e resta in coda", async () => {
    const richiestaAnna = await entraInCoda({ ...SLOT, userId: ANNA }, prisma);
    await expect(annullaRichiestaCoda(BRUNO, richiestaAnna.id, prisma)).rejects.toBeInstanceOf(RichiestaCodaNonTrovata);
    await expect(annullaRichiestaCoda(BRUNO, "id-inventato", prisma)).rejects.toBeInstanceOf(RichiestaCodaNonTrovata);
    await expect(prisma.listaAttesa.findUniqueOrThrow({ where: { id: richiestaAnna.id } })).resolves.toMatchObject({
      stato: "IN_ATTESA",
    });
  });

  it("[TC-CODA-VITA-012] una richiesta gia' annullata non si annulla di nuovo e non duplica il log", async () => {
    const richiestaAnna = await entraInCoda({ ...SLOT, userId: ANNA }, prisma);
    await annullaRichiestaCoda(ANNA, richiestaAnna.id, prisma);
    await expect(annullaRichiestaCoda(ANNA, richiestaAnna.id, prisma)).rejects.toBeInstanceOf(RichiestaCodaNonAnnullabile);
    await expect(prisma.logEvento.count({ where: { tipo: "CODA_ANNULLATA", userId: ANNA } })).resolves.toBe(1);
  });

  it("[TC-CODA-VITA-013] dopo l'annullamento si puo' rientrare in coda, in fondo", async () => {
    const richiestaAnna = await entraInCoda({ ...SLOT, userId: ANNA }, prisma);
    await entraInCoda({ ...SLOT, userId: BRUNO }, prisma);
    await annullaRichiestaCoda(ANNA, richiestaAnna.id, prisma);
    await entraInCoda({ ...SLOT, userId: ANNA }, prisma);
    await expect(posizioneInCoda({ ...SLOT, userId: ANNA }, prisma)).resolves.toBe(2);
  });
});

describe("promozione", () => {
  it("[TC-CODA-VITA-020] con lo slot ancora occupato nessuno viene promosso", async () => {
    await prisma.prenotazione.create({
      data: {
        userId: CARLA,
        postoId: POSTO,
        data: GIORNO.data,
        oraInizio: new Date("1970-01-01T09:00:00.000Z"),
        oraFine: new Date("1970-01-01T11:00:00.000Z"),
        stato: "CONFERMATA",
      },
    });
    await entraInCoda({ ...SLOT, userId: ANNA }, prisma);
    await expect(promuoviPrimoInCoda(SLOT, prisma)).resolves.toBeNull();
    await expect(posizioneInCoda({ ...SLOT, userId: ANNA }, prisma)).resolves.toBe(1);
  });

  it("[TC-CODA-VITA-021] con la coda vuota non succede nulla; con uno slot libero viene promosso il primo", async () => {
    await expect(promuoviPrimoInCoda(SLOT, prisma)).resolves.toBeNull();

    await entraInCoda({ ...SLOT, userId: ANNA }, prisma);
    await entraInCoda({ ...SLOT, userId: BRUNO }, prisma);
    const esito = await promuoviPrimoInCoda(SLOT, prisma);
    expect(esito?.prenotazione).toMatchObject({ userId: ANNA, postoId: POSTO, stato: "CONFERMATA" });
    await expect(posizioneInCoda({ ...SLOT, userId: BRUNO }, prisma)).resolves.toBe(1);
    await expect(prisma.logEvento.count({ where: { tipo: "CODA_PROMOZIONE", targetUserId: ANNA } })).resolves.toBe(1);
  });
});
