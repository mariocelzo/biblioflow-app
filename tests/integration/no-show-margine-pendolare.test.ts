/**
 * 🧪 TEST DI INTEGRAZIONE — MARGINE PENDOLARE E RILASCIO NO-SHOW
 * (PR "Margine Pendolare": punto 1 — la finestra di check-in e il rilascio
 * no-show devono usare lo STESSO confine anche quando il margine e' attivo)
 *
 * COSA verifica: `releaseNoShowReservations` (src/lib/automation-service.ts)
 * NON libera più il posto dopo 15 minuti fissi per OGNI prenotazione. La
 * query SQL applica ora, riga per riga, `CASE WHEN "marginePendolare" THEN 30
 * ELSE 15 END` (vedi il commento sulla query e su
 * `MARGINE_PENDOLARE_MINUTI`/`tolleranzaCheckIn` in
 * src/lib/prenotazioni-regole.ts).
 *
 * PERCHE' UN TEST DI INTEGRAZIONE (non uno unitario con Prisma mockato): il
 * `CASE WHEN` vive DENTRO la query SQL grezza (`$queryRaw`), che nei test
 * unitari (tests/unit/automation-service.test.ts) è sostituita da un mock —
 * quindi non eserciterebbe mai la vera semantica del confronto lato Postgres.
 * Stesso principio di tests/integration/no-show-fuso-orario.test.ts (bug
 * diverso, stessa query).
 *
 * PROPRIETA' DA NON ROMPERE (vedi TOLLERANZA_CHECK_IN_MINUTI in
 * prenotazioni-regole.ts): non deve MAI esistere un istante in cui il
 * check-in e' ancora ammesso (`valutaFinestraCheckIn`) e il posto e' gia'
 * stato rilasciato per no-show. Con il margine attivo il confine si sposta da
 * +15 a +30 minuti, ma resta un confine UNICO — qui si verifica il lato
 * no-show; il lato check-in e' bloccato dai test di boundary +29/+30/+31 in
 * tests/unit/prenotazioni-regole-finestra-checkin.test.ts (TC-TOL-003/004/005).
 *
 * ISOLAMENTO DAL RESTO DELLA SUITE: `releaseNoShowReservations` interroga
 * l'intera tabella `Prenotazione` (nessuno scoping per posto/utente), e piu'
 * file di test di integrazione la invocano con date fisse diverse
 * (automazioni.test.ts: 2026-09-02; no-show-finestra-notturna.test.ts:
 * 2026-09-03; no-show-fuso-orario.test.ts: 2026-06-15 e 2026-12-15). Con
 * `vitest` che esegue i file in worker separati e paralleli, una riga
 * CONFERMATA di un file puo' restare visibile a una query di un altro file
 * mentre e' ancora "in volo". Per questo qui: (1) si usa una data (10 aprile)
 * non condivisa con nessun altro file che chiama la stessa funzione, per
 * ridurre la probabilita' di collisione; (2) le asserzioni si concentrano
 * SEMPRE sullo stato della RIGA SPECIFICA sotto test (letta per id), mai sul
 * conteggio globale `released` restituito dalla funzione — quel conteggio
 * include per costruzione qualunque altra riga scaduta nell'intera tabella
 * al momento della chiamata, quindi non e' un'asserzione stabile in presenza
 * di altri file che scrivono nella stessa tabella.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { prisma } = await import("@/lib/prisma");
const { releaseNoShowReservations } = await import("@/lib/automation-service");

const SALA_ID = "bibmp-sala";
const POSTO_ID = "bibmp-posto";
const USER_ID = "bibmp-u1";
const PRENOTAZIONE_ID = "bibmp-pren";

// oraInizio "10:00" di Roma, in aprile (CEST, +2h dal 29 marzo) = 08:00 UTC
// reali. 10 aprile: data scelta apposta perche' NON coincide con nessun'altra
// data fissa usata dagli altri file che chiamano releaseNoShowReservations
// (vedi il commento in testa al file).
const DATA = new Date("2026-04-10T00:00:00.000Z");
const ORA_INIZIO = new Date("1970-01-01T10:00:00.000Z");
const ORA_FINE = new Date("1970-01-01T12:00:00.000Z");

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
      cognome: "MargineP",
      matricola: "BIBMP001",
      ruolo: "STUDENTE",
      emailVerificata: true,
      isPendolare: true,
    },
  });
  await prisma.sala.create({
    data: { id: SALA_ID, nome: `Sala ${SALA_ID}`, piano: 1, capienzaMax: 1 },
  });
  await prisma.posto.create({
    data: {
      id: POSTO_ID,
      numero: "MP1",
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

/** Ricrea la prenotazione con `marginePendolare` indicato (stesso slot per tutti gli scenari). */
async function creaPrenotazione(marginePendolare: boolean) {
  await prisma.prenotazione.deleteMany({ where: { postoId: POSTO_ID } });
  await prisma.prenotazione.create({
    data: {
      id: PRENOTAZIONE_ID,
      userId: USER_ID,
      postoId: POSTO_ID,
      data: DATA,
      oraInizio: ORA_INIZIO,
      oraFine: ORA_FINE,
      stato: "CONFERMATA",
      marginePendolare,
    },
  });
  await prisma.posto.update({ where: { id: POSTO_ID }, data: { stato: "OCCUPATO" } });
}

describe("releaseNoShowReservations · Margine Pendolare (CASE WHEN riga per riga)", () => {
  describe("marginePendolare: true — la tolleranza e' 30 minuti, non 15", () => {
    beforeEach(async () => {
      await creaPrenotazione(true);
    });

    it("NON rilascia il posto a 20 minuti di ritardo (oltre i 15 normali, dentro i 30 del margine)", async () => {
      // 08:20 UTC = 10:20 di Roma: 20 minuti dopo l'inizio (10:00). Senza
      // margine sarebbe già NO_SHOW (>15); con margine attivo deve restare
      // CONFERMATA.
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2026-04-10T08:20:00.000Z"));

      await releaseNoShowReservations();

      const prenotazione = await prisma.prenotazione.findUniqueOrThrow({
        where: { id: PRENOTAZIONE_ID },
      });
      expect(prenotazione.stato).toBe("CONFERMATA");
    });

    it("NON rilascia il posto a 29 minuti di ritardo (un minuto prima del confine)", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2026-04-10T08:29:00.000Z"));

      await releaseNoShowReservations();

      const prenotazione = await prisma.prenotazione.findUniqueOrThrow({
        where: { id: PRENOTAZIONE_ID },
      });
      expect(prenotazione.stato).toBe("CONFERMATA");
    });

    it("rilascia il posto ESATTAMENTE a 30 minuti di ritardo (confine, disuguaglianza NON stretta)", async () => {
      // Stesso principio di TC-FIN-005/TC-TOL-004: al minuto esatto della
      // chiusura il check-in e' GIA' scaduto, quindi qui il posto deve
      // essere GIA' rilasciabile — nessuna sovrapposizione fra i due lati.
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2026-04-10T08:30:00.000Z"));

      await releaseNoShowReservations();

      const prenotazione = await prisma.prenotazione.findUniqueOrThrow({
        where: { id: PRENOTAZIONE_ID },
      });
      expect(prenotazione.stato).toBe("NO_SHOW");

      const posto = await prisma.posto.findUniqueOrThrow({ where: { id: POSTO_ID } });
      expect(posto.stato).toBe("DISPONIBILE");
    });
  });

  describe("marginePendolare: false — la tolleranza resta 15 minuti (nessuna regressione)", () => {
    beforeEach(async () => {
      await creaPrenotazione(false);
    });

    it("rilascia il posto a 20 minuti di ritardo, come prima di questa PR", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2026-04-10T08:20:00.000Z"));

      await releaseNoShowReservations();

      const prenotazione = await prisma.prenotazione.findUniqueOrThrow({
        where: { id: PRENOTAZIONE_ID },
      });
      expect(prenotazione.stato).toBe("NO_SHOW");
    });

    it("NON rilascia il posto a 10 minuti di ritardo (dentro i 15 normali)", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2026-04-10T08:10:00.000Z"));

      await releaseNoShowReservations();

      const prenotazione = await prisma.prenotazione.findUniqueOrThrow({
        where: { id: PRENOTAZIONE_ID },
      });
      expect(prenotazione.stato).toBe("CONFERMATA");
    });
  });
});
