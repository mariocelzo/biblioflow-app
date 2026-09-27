/**
 * 🧪 TEST DI INTEGRAZIONE — COMPLETAMENTO AUTOMATICO DELLE PRENOTAZIONI
 * CHECK_IN A FINE FASCIA (correzione del difetto verificato in produzione)
 *
 * 🐞 DIFETTO: quando uno studente fa check-in, la prenotazione passa a
 * `CHECK_IN` e il posto a `OCCUPATO`. PRIMA di questa correzione l'unico modo
 * per tornare `DISPONIBILE` era il check-out manuale: nessuna automazione
 * chiudeva mai una prenotazione rimasta in CHECK_IN dopo la fine della sua
 * fascia. Prova in produzione: le prenotazioni seed
 * `cmk465flx003z9syqorot22uf` (06/01/2026, posto A1) e
 * `cmk465fm200489syqd5ezucdh` (06/01/2026, posto C1) erano ancora CHECK_IN a
 * fine settembre — il posto A1 bloccato da quasi nove mesi.
 *
 * PERCHÉ UN TEST DI INTEGRAZIONE (non solo unitario con Prisma mockato): il
 * confronto `("data" + "oraFine") AT TIME ZONE 'Europe/Rome' <= now()` vive
 * nella semantica SQL di Postgres — un mock di `$queryRaw`
 * (tests/unit/automation-service.test.ts) non la esercita mai. Stesso
 * principio di tests/integration/no-show-fuso-orario.test.ts.
 *
 * ISOLAMENTO DAL RESTO DELLA SUITE: `completaPrenotazioniCheckInScaduto`
 * interroga l'intera tabella `Prenotazione` (nessuno scoping per posto/utente
 * — stessa scelta di `releaseNoShowReservations`, vedi il commento in
 * tests/integration/no-show-margine-pendolare.test.ts). Per ridurre la
 * probabilità di collisione con le fixture CHECK_IN di altri file
 * (tests/integration/automazioni.test.ts usa il 2026-09-02;
 * tests/integration/statistiche-coda.test.ts il 2035-01-15;
 * tests/integration/admin-prenotazioni-stati-terminali-db.test.ts il
 * 2030-03-01) questo file usa il 2027-03-01, una data non condivisa con
 * nessun altro. Le asserzioni si concentrano SEMPRE sulle righe specifiche
 * sotto test (per id), mai sul conteggio globale `completed`.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { prisma } = await import("@/lib/prisma");
const { completaPrenotazioniCheckInScaduto } = await import("@/lib/automation-service");

const PREFISSO = "bibcomp";
const SALA_ID = `${PREFISSO}-sala`;
const USER_ID = `${PREFISSO}-u1`;

/** Orologio fissato: 11:00 UTC del 2027-03-01 (Roma è UTC+1 il 1° marzo, ora solare). */
const NOW = new Date("2027-03-01T11:00:00.000Z");
const DATA = new Date("2027-03-01T00:00:00.000Z");

async function pulisci() {
  await prisma.logEvento.deleteMany({
    where: { OR: [{ userId: USER_ID }, { descrizione: { contains: PREFISSO } }] },
  });
  await prisma.prenotazione.deleteMany({ where: { userId: USER_ID } });
  await prisma.posto.deleteMany({ where: { salaId: SALA_ID } });
  await prisma.sala.deleteMany({ where: { id: SALA_ID } });
  await prisma.user.deleteMany({ where: { id: USER_ID } });
}

async function creaPosto(id: string, stato: "DISPONIBILE" | "OCCUPATO" | "MANUTENZIONE") {
  return prisma.posto.create({
    data: { id, numero: id, salaId: SALA_ID, coordinataX: 0, coordinataY: 0, stato },
  });
}

/** Crea una prenotazione CHECK_IN con lo slot indicato (cifre di ROMA). */
async function creaCheckIn(params: {
  id: string;
  postoId: string;
  oraInizio: string;
  oraFine: string;
  checkInAt: Date;
}) {
  return prisma.prenotazione.create({
    data: {
      id: params.id,
      userId: USER_ID,
      postoId: params.postoId,
      data: DATA,
      oraInizio: new Date(`1970-01-01T${params.oraInizio}:00.000Z`),
      oraFine: new Date(`1970-01-01T${params.oraFine}:00.000Z`),
      stato: "CHECK_IN",
      checkInAt: params.checkInAt,
    },
  });
}

beforeAll(async () => {
  await pulisci();
  await prisma.user.create({
    data: {
      id: USER_ID,
      email: `${USER_ID}@biblioflow.test`,
      nome: "Test",
      cognome: "Completamento",
      matricola: "BIBCOMP1",
      ruolo: "STUDENTE",
      emailVerificata: true,
    },
  });
  await prisma.sala.create({
    data: { id: SALA_ID, nome: `Sala ${SALA_ID}`, piano: 1, capienzaMax: 4 },
  });
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});

afterEach(async () => {
  vi.useRealTimers();
  // Ogni test ricrea le proprie righe: si ripulisce prenotazioni/posti fra un
  // test e l'altro, mantenendo utente e sala (ricreati solo in beforeAll).
  await prisma.logEvento.deleteMany({ where: { userId: USER_ID } });
  await prisma.prenotazione.deleteMany({ where: { userId: USER_ID } });
  await prisma.posto.deleteMany({ where: { salaId: SALA_ID } });
});

afterAll(async () => {
  await pulisci();
  await prisma.$disconnect();
});

describe("completaPrenotazioniCheckInScaduto — fascia finita", () => {
  it("una prenotazione CHECK_IN la cui fascia è finita passa a COMPLETATA, il posto torna DISPONIBILE, checkOutAt = fine fascia", async () => {
    const posto = await creaPosto(`${PREFISSO}-p1`, "OCCUPATO");
    // 08:00-10:00 di Roma: finita da un'ora rispetto a NOW (11:00 UTC = 12:00 Roma).
    await creaCheckIn({
      id: `${PREFISSO}-pren1`,
      postoId: posto.id,
      oraInizio: "08:00",
      oraFine: "10:00",
      checkInAt: new Date("2027-03-01T07:05:00.000Z"),
    });

    const risultato = await completaPrenotazioniCheckInScaduto();
    expect(risultato.completed).toBeGreaterThanOrEqual(1);

    const pren = await prisma.prenotazione.findUniqueOrThrow({
      where: { id: `${PREFISSO}-pren1` },
    });
    expect(pren.stato).toBe("COMPLETATA");
    // Fine fascia: 10:00 di Roma (ora solare, 1° marzo) = 09:00 UTC — non "adesso" (11:00 UTC).
    expect(pren.checkOutAt?.toISOString()).toBe("2027-03-01T09:00:00.000Z");

    const postoDopo = await prisma.posto.findUniqueOrThrow({ where: { id: posto.id } });
    expect(postoDopo.stato).toBe("DISPONIBILE");

    const log = await prisma.logEvento.findFirst({
      where: { prenotazioneId: `${PREFISSO}-pren1`, tipo: "CHECK_OUT" },
    });
    expect(log).not.toBeNull();
    expect((log?.dettagli as { automatico?: boolean } | null)?.automatico).toBe(true);
  });

  it("una prenotazione CHECK_IN la cui fascia NON è ancora finita resta invariata", async () => {
    const posto = await creaPosto(`${PREFISSO}-p2`, "OCCUPATO");
    // 12:00-14:00 di Roma: NOW è le 12:00 di Roma, la fascia finisce dopo.
    await creaCheckIn({
      id: `${PREFISSO}-pren2`,
      postoId: posto.id,
      oraInizio: "12:00",
      oraFine: "14:00",
      checkInAt: new Date("2027-03-01T10:55:00.000Z"),
    });

    await completaPrenotazioniCheckInScaduto();

    const pren = await prisma.prenotazione.findUniqueOrThrow({
      where: { id: `${PREFISSO}-pren2` },
    });
    expect(pren.stato).toBe("CHECK_IN");

    const postoDopo = await prisma.posto.findUniqueOrThrow({ where: { id: posto.id } });
    expect(postoDopo.stato).toBe("OCCUPATO");
  });

  it("due CHECK_IN sullo stesso posto (una finita, una in corso): la finita si completa ma il posto resta OCCUPATO", async () => {
    const posto = await creaPosto(`${PREFISSO}-p3`, "OCCUPATO");
    // Finita: 08:00-10:00 Roma. In corso: 12:00-14:00 Roma (non si sovrappongono,
    // quindi non violano il vincolo EXCLUDE su CONFERMATA/CHECK_IN).
    await creaCheckIn({
      id: `${PREFISSO}-pren3a`,
      postoId: posto.id,
      oraInizio: "08:00",
      oraFine: "10:00",
      checkInAt: new Date("2027-03-01T07:05:00.000Z"),
    });
    await creaCheckIn({
      id: `${PREFISSO}-pren3b`,
      postoId: posto.id,
      oraInizio: "12:00",
      oraFine: "14:00",
      checkInAt: new Date("2027-03-01T10:55:00.000Z"),
    });

    await completaPrenotazioniCheckInScaduto();

    const finita = await prisma.prenotazione.findUniqueOrThrow({
      where: { id: `${PREFISSO}-pren3a` },
    });
    expect(finita.stato).toBe("COMPLETATA");

    const inCorso = await prisma.prenotazione.findUniqueOrThrow({
      where: { id: `${PREFISSO}-pren3b` },
    });
    expect(inCorso.stato).toBe("CHECK_IN");

    // Il posto NON torna DISPONIBILE: l'altra prenotazione lo occupa ancora.
    const postoDopo = await prisma.posto.findUniqueOrThrow({ where: { id: posto.id } });
    expect(postoDopo.stato).toBe("OCCUPATO");
  });

  it("un posto in MANUTENZIONE non viene toccato (la prenotazione si completa comunque)", async () => {
    const posto = await creaPosto(`${PREFISSO}-p4`, "MANUTENZIONE");
    await creaCheckIn({
      id: `${PREFISSO}-pren4`,
      postoId: posto.id,
      oraInizio: "08:00",
      oraFine: "10:00",
      checkInAt: new Date("2027-03-01T07:05:00.000Z"),
    });

    await completaPrenotazioniCheckInScaduto();

    const pren = await prisma.prenotazione.findUniqueOrThrow({
      where: { id: `${PREFISSO}-pren4` },
    });
    expect(pren.stato).toBe("COMPLETATA");

    // Il rilascio non sovrascrive la manutenzione impostata dallo staff.
    const postoDopo = await prisma.posto.findUniqueOrThrow({ where: { id: posto.id } });
    expect(postoDopo.stato).toBe("MANUTENZIONE");
  });

  it("IDEMPOTENZA: due esecuzioni consecutive non producono effetti doppi (un solo LogEvento, un solo check-out)", async () => {
    const posto = await creaPosto(`${PREFISSO}-p5`, "OCCUPATO");
    await creaCheckIn({
      id: `${PREFISSO}-pren5`,
      postoId: posto.id,
      oraInizio: "08:00",
      oraFine: "10:00",
      checkInAt: new Date("2027-03-01T07:05:00.000Z"),
    });

    await completaPrenotazioniCheckInScaduto();
    const primoGiro = await prisma.prenotazione.findUniqueOrThrow({
      where: { id: `${PREFISSO}-pren5` },
    });
    expect(primoGiro.stato).toBe("COMPLETATA");
    const checkOutAtPrimoGiro = primoGiro.checkOutAt;

    // Secondo giro: la riga non è più CHECK_IN, la guardia sulla updateMany
    // non la riseleziona nemmeno (query $queryRaw filtra `stato = 'CHECK_IN'`).
    await completaPrenotazioniCheckInScaduto();

    const dopoSecondoGiro = await prisma.prenotazione.findUniqueOrThrow({
      where: { id: `${PREFISSO}-pren5` },
    });
    expect(dopoSecondoGiro.stato).toBe("COMPLETATA");
    expect(dopoSecondoGiro.checkOutAt?.toISOString()).toBe(checkOutAtPrimoGiro?.toISOString());

    const logs = await prisma.logEvento.findMany({
      where: { prenotazioneId: `${PREFISSO}-pren5`, tipo: "CHECK_OUT" },
    });
    expect(logs).toHaveLength(1);

    // Il posto resta DISPONIBILE (nessun secondo giro lo tocca di nuovo).
    const postoDopo = await prisma.posto.findUniqueOrThrow({ where: { id: posto.id } });
    expect(postoDopo.stato).toBe("DISPONIBILE");
  });
});
