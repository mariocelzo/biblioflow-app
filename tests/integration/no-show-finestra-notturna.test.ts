/**
 * 🧪 TEST DI INTEGRAZIONE — LA FINESTRA NOTTURNA DEL NO-SHOW (00:00–00:15)
 *
 * BUG VERIFICATO: `releaseNoShowReservations` (src/lib/automation-service.ts)
 * confrontava `oraInizio` (colonna `@db.Time()`, cioè SOLO l'orario del
 * giorno) con un `Date` COMPLETO (`minus15Minutes = now - 15 minuti`).
 * Postgres tronca il secondo operando alla sola componente oraria: a
 * mezzanotte e cinque, `minus15Minutes` vale le "23:50" del giorno PRIMA, e la
 * condizione `oraInizio <= '23:50'` risultava vera per QUASI OGNI
 * prenotazione (qualunque orario diurno è "prima" delle 23:50). Combinato con
 * `data <= oggi`, il cron eseguito ogni notte marcava NO_SHOW e liberava
 * pressoché TUTTE le prenotazioni CONFERMATA del giorno, ORE prima che
 * iniziassero.
 *
 * PERCHÉ SERVE UN TEST DI INTEGRAZIONE (non uno unitario con Prisma mockato):
 * il difetto vive nella SEMANTICA SQL del confronto tra una colonna `TIME` e
 * un valore `TIMESTAMP` — un mock di Prisma non esegue mai quel confronto
 * lato Postgres, quindi non lo eserciterebbe: è la ragione per cui il bug è
 * passato inosservato ai test unitari esistenti
 * (`tests/unit/automation-service.test.ts`). Qui si usa il database di test
 * reale (container `biblioflow-test-db`, 127.0.0.1:5433), come in
 * `tests/integration/automazioni.test.ts`.
 *
 * SCENARIO: orologio fissato alle 00:05 UTC del 2026-09-03. Una prenotazione
 * CONFERMATA di OGGI con `oraInizio` alle 09:00 (che quindi deve ancora
 * iniziare fra 9 ore) NON deve essere toccata. Con il bug, l'esecuzione della
 * funzione la marcava NO_SHOW e liberava il posto immediatamente.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { prisma } = await import("@/lib/prisma");
const { releaseNoShowReservations } = await import("@/lib/automation-service");

// Prefisso dedicato per la pulizia scoped: non tocca le fixture di altri file
// di integrazione che condividono lo stesso database sotto Vitest parallelo.
const SALA_ID = "bibnotte-sala";
const POSTO_ID = "bibnotte-posto";
const USER_ID = "bibnotte-u1";
const PRENOTAZIONE_ID = "bibnotte-pren";

/** Orologio fissato: 00:05 UTC del 2026-09-03 — dentro la finestra di danno 00:00–00:15. */
const NOW = new Date("2026-09-03T00:05:00.000Z");
/** `Prenotazione.data` = "oggi" a mezzanotte UTC (rappresentazione di `@db.Date`). */
const DATA_OGGI = new Date("2026-09-03T00:00:00.000Z");
/** `oraInizio` alle 09:00 — deve ancora iniziare fra 9 ore rispetto a `NOW`. */
const ORA_INIZIO_FUTURA = new Date("1970-01-01T09:00:00.000Z");
const ORA_FINE_FUTURA = new Date("1970-01-01T11:00:00.000Z");

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
      cognome: "Notturno",
      matricola: "BIBNOTTE1",
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
      numero: "N1",
      salaId: SALA_ID,
      coordinataX: 0,
      coordinataY: 0,
      stato: "OCCUPATO",
    },
  });
});

beforeEach(async () => {
  // Ricrea SOLO la prenotazione a ogni caso: sala/posto/utente restano.
  await prisma.prenotazione.deleteMany({ where: { postoId: POSTO_ID } });
  await prisma.prenotazione.create({
    data: {
      id: PRENOTAZIONE_ID,
      userId: USER_ID,
      postoId: POSTO_ID,
      data: DATA_OGGI,
      oraInizio: ORA_INIZIO_FUTURA,
      oraFine: ORA_FINE_FUTURA,
      stato: "CONFERMATA",
      // Creata con largo anticipo: non è una prenotazione nata da una
      // promozione di coda, quindi non rientra nella protezione dedicata a
      // quel caso (BIB-47) — qui si esercita solo il bug della finestra oraria.
      createdAt: new Date(NOW.getTime() - 60 * 60_000),
    },
  });

  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

afterAll(async () => {
  await pulisci();
  await prisma.$disconnect();
});

describe("releaseNoShowReservations · finestra notturna 00:00–00:15 (bug oraInizio TIME vs Date)", () => {
  it("NON marca NO_SHOW una prenotazione di oggi che deve ancora iniziare (00:05, oraInizio 09:00)", async () => {
    const risultato = await releaseNoShowReservations();

    const prenotazione = await prisma.prenotazione.findUniqueOrThrow({
      where: { id: PRENOTAZIONE_ID },
    });

    // Con il bug: `oraInizio (09:00) <= minus15Minutes (23:50 del giorno prima)`
    // risultava VERO (Postgres confronta solo la parte oraria di
    // `minus15Minutes`), quindi la prenotazione veniva rilasciata ore prima
    // del suo inizio. La correzione ricompone l'istante reale
    // `data + oraInizio` e non deve selezionarla.
    expect(prenotazione.stato).toBe("CONFERMATA");
    expect(risultato.released).toBe(0);

    // Il posto non deve essere stato liberato.
    const posto = await prisma.posto.findUniqueOrThrow({ where: { id: POSTO_ID } });
    expect(posto.stato).toBe("OCCUPATO");

    // Nessuna notifica di annullamento per no-show deve essere stata generata.
    expect(
      await prisma.notifica.count({ where: { userId: USER_ID, titolo: { contains: "no-show" } } }),
    ).toBe(0);
  });

  it("marca invece NO_SHOW una prenotazione realmente iniziata da più di 15 minuti", async () => {
    // Controllo di non regressione: il caso "vero" no-show deve continuare a
    // funzionare. `oraInizio` alle 23:00 di ieri sarebbe impossibile nello
    // stesso giorno "oggi"; usiamo invece un inizio della MATTINA presto di
    // oggi, ben oltre i 15 minuti rispetto a NOW (00:05).
    await prisma.prenotazione.update({
      where: { id: PRENOTAZIONE_ID },
      data: {
        oraInizio: new Date("1970-01-01T00:00:00.000Z"),
        oraFine: new Date("1970-01-01T00:30:00.000Z"),
      },
    });

    // Sposta l'orologio a 20 minuti dopo l'inizio reale (00:00 + 20min = 00:20),
    // ben oltre la soglia dei 15 minuti di grazia no-show.
    vi.setSystemTime(new Date("2026-09-03T00:20:00.000Z"));

    const risultato = await releaseNoShowReservations();

    const prenotazione = await prisma.prenotazione.findUniqueOrThrow({
      where: { id: PRENOTAZIONE_ID },
    });
    expect(prenotazione.stato).toBe("NO_SHOW");
    expect(risultato.released).toBe(1);
  });
});
