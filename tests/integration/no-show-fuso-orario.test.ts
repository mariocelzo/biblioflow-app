/**
 * 🧪 TEST DI INTEGRAZIONE — FUSO ORARIO DEL RILASCIO NO-SHOW
 * (difetto "no-show-fuso-orario-rilascio-ritardato")
 *
 * BUG VERIFICATO DAL VIVO: `releaseNoShowReservations` (src/lib/automation-service.ts)
 * confrontava `("data" + "oraInizio")` (cifre di ROMA salvate cosi' come sono,
 * senza fuso — vedi src/lib/tempo-db.ts) con una soglia convertita
 * `AT TIME ZONE 'UTC'`: nessuno dei due lati applicava mai l'offset
 * Europe/Rome. Una prenotazione iniziata da 20 minuti REALI (orario di Roma)
 * restava CONFERMATA: il rilascio scattava solo quando l'orologio UTC REALE
 * raggiungeva le stesse cifre di (oraInizio_Roma - 15min), cioe' con un
 * ritardo di ~offset_UTC(+1h/+2h)+15min sulla soglia reale dei 15 minuti.
 *
 * PERCHE' UN TEST DI INTEGRAZIONE (non uno unitario con Prisma mockato): il
 * difetto vive nella SEMANTICA SQL del confronto fra colonne `DATE`/`TIME` e
 * `now()` — un mock di Prisma non esegue mai quel confronto lato Postgres
 * (vedi tests/unit/automation-service.test.ts, che mocka $queryRaw e quindi
 * non lo eserciterebbe). Si usa qui il database reale, come
 * tests/integration/no-show-finestra-notturna.test.ts (bug diverso ma
 * stesso file/stessa query, corretto in una PR precedente).
 *
 * DUE STAGIONI, NON UN OFFSET FISSO: il 15 giugno e' in ora legale (CEST,
 * Roma = UTC+2), il 15 dicembre e' in ora solare (CET, Roma = UTC+1). Se la
 * correzione avesse un offset scritto a mano (es. sempre +2h) uno dei due
 * scenari fallirebbe: `AT TIME ZONE 'Europe/Rome'` usa invece il database
 * IANA di Postgres, che conosce le date del cambio d'ora.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { prisma } = await import("@/lib/prisma");
const { releaseNoShowReservations } = await import("@/lib/automation-service");

const SALA_ID = "bibfuso-sala";
const POSTO_ID = "bibfuso-posto";
const USER_ID = "bibfuso-u1";
const PRENOTAZIONE_ID = "bibfuso-pren";

async function pulisci() {
  await prisma.logEvento.deleteMany({
    where: {
      OR: [{ userId: USER_ID }, { targetUserId: USER_ID }, { prenotazioneId: PRENOTAZIONE_ID }],
    },
  });
  await prisma.notifica.deleteMany({ where: { userId: USER_ID } });
  await prisma.listaAttesa.deleteMany({ where: { postoId: POSTO_ID } });
  await prisma.prenotazione.deleteMany({ where: { postoId: POSTO_ID } });
  await prisma.posto.deleteMany({ where: { id: POSTO_ID } });
  await prisma.sala.deleteMany({ where: { id: SALA_ID } });
  await prisma.user.deleteMany({ where: { id: USER_ID } });
}

beforeAll(async () => {
  await pulisci();
  await prisma.user.create({
    data: {
      id: USER_ID,
      email: `${USER_ID}@biblioflow.test`,
      nome: "Test",
      cognome: "Fuso",
      matricola: "BIBFUSO1",
      ruolo: "STUDENTE",
      emailVerificata: true,
    },
  });
  await prisma.sala.create({
    data: { id: SALA_ID, nome: `Sala ${SALA_ID}`, piano: 1, capienzaMax: 1 },
  });
  await prisma.posto.create({
    data: {
      id: POSTO_ID,
      numero: "F1",
      salaId: SALA_ID,
      coordinataX: 0,
      coordinataY: 0,
      stato: "OCCUPATO",
    },
  });
});

afterEach(() => {
  vi.useRealTimers();
});

afterAll(async () => {
  await pulisci();
  await prisma.$disconnect();
});

/** Ricrea la prenotazione con lo slot indicato (le cifre di `oraInizio`/`oraFine` sono orario di ROMA). */
async function creaPrenotazione(params: {
  data: Date;
  oraInizio: Date;
  oraFine: Date;
  createdAt: Date;
}) {
  await prisma.prenotazione.deleteMany({ where: { postoId: POSTO_ID } });
  await prisma.prenotazione.create({
    data: {
      id: PRENOTAZIONE_ID,
      userId: USER_ID,
      postoId: POSTO_ID,
      ...params,
      stato: "CONFERMATA",
    },
  });
  await prisma.posto.update({ where: { id: POSTO_ID }, data: { stato: "OCCUPATO" } });
}

describe("releaseNoShowReservations · fuso orario Europe/Rome (bug: confronto senza offset)", () => {
  describe("estate — CEST, Roma = UTC+2 (15 giugno)", () => {
    // oraInizio "10:00" di Roma, in giugno, e' le 08:00 UTC reali.
    const DATA = new Date("2026-06-15T00:00:00.000Z");
    const ORA_INIZIO = new Date("1970-01-01T10:00:00.000Z");
    const ORA_FINE = new Date("1970-01-01T12:00:00.000Z");

    beforeEach(async () => {
      await creaPrenotazione({
        data: DATA,
        oraInizio: ORA_INIZIO,
        oraFine: ORA_FINE,
        createdAt: new Date("2026-06-15T06:00:00.000Z"),
      });
    });

    it("marca NO_SHOW uno slot iniziato 20 minuti fa in ORARIO REALE DI ROMA (avrebbe fallito prima della correzione)", async () => {
      // 08:20 UTC = 10:20 di Roma: lo slot delle 10:00 e' iniziato da 20
      // minuti REALI, oltre la soglia di grazia di 15 minuti.
      // Con il bug (nessun offset applicato): il rilascio sarebbe scattato
      // solo a partire dalle ~10:15 UTC (le cifre "10:00" trattate come UTC,
      // meno 15 minuti) — quasi 2 ore dopo. A 08:20Z la prenotazione sarebbe
      // rimasta CONFERMATA.
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2026-06-15T08:20:00.000Z"));

      const risultato = await releaseNoShowReservations();

      const prenotazione = await prisma.prenotazione.findUniqueOrThrow({
        where: { id: PRENOTAZIONE_ID },
      });
      expect(prenotazione.stato).toBe("NO_SHOW");
      expect(risultato.released).toBe(1);

      const posto = await prisma.posto.findUniqueOrThrow({ where: { id: POSTO_ID } });
      expect(posto.stato).toBe("DISPONIBILE");
    });

    it("NON tocca lo stesso slot 10 minuti dopo l'inizio reale (dentro i 15 minuti di grazia)", async () => {
      // 08:10 UTC = 10:10 di Roma: solo 10 minuti reali dopo l'inizio, ancora
      // dentro la finestra di grazia — non deve scattare.
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2026-06-15T08:10:00.000Z"));

      const risultato = await releaseNoShowReservations();

      const prenotazione = await prisma.prenotazione.findUniqueOrThrow({
        where: { id: PRENOTAZIONE_ID },
      });
      expect(prenotazione.stato).toBe("CONFERMATA");
      expect(risultato.released).toBe(0);
    });
  });

  describe("inverno — CET, Roma = UTC+1 (15 dicembre): dimostra che l'offset non e' fisso", () => {
    // Stesse cifre di Roma ("10:00"), ma in dicembre l'offset e' +1h, non +2h:
    // se la correzione avesse un offset scritto a mano questo scenario
    // fallirebbe mentre quello estivo passerebbe (o viceversa).
    const DATA = new Date("2026-12-15T00:00:00.000Z");
    const ORA_INIZIO = new Date("1970-01-01T10:00:00.000Z");
    const ORA_FINE = new Date("1970-01-01T12:00:00.000Z");

    beforeEach(async () => {
      await creaPrenotazione({
        data: DATA,
        oraInizio: ORA_INIZIO,
        oraFine: ORA_FINE,
        createdAt: new Date("2026-12-15T06:00:00.000Z"),
      });
    });

    it("marca NO_SHOW uno slot iniziato 20 minuti fa in ORARIO REALE DI ROMA, con l'offset invernale (+1h)", async () => {
      // 09:20 UTC = 10:20 di Roma (CET, +1h): 20 minuti reali dopo l'inizio.
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2026-12-15T09:20:00.000Z"));

      const risultato = await releaseNoShowReservations();

      const prenotazione = await prisma.prenotazione.findUniqueOrThrow({
        where: { id: PRENOTAZIONE_ID },
      });
      expect(prenotazione.stato).toBe("NO_SHOW");
      expect(risultato.released).toBe(1);
    });
  });
});
