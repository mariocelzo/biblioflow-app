/**
 * 🧪 TEST DI INTEGRAZIONE — ANTI-DUPLICATO ALERT SCADENZA PRESTITI
 *
 * BUG VERIFICATO: `sendLoanExpiryAlerts` (src/lib/automation-service.ts) è
 * invocata dal cron delle automazioni OGNI 5 MINUTI (~288 volte al giorno) ma,
 * a differenza di `sendCheckInReminders` (stesso file), non aveva alcuna
 * guardia anti-duplicato: ogni esecuzione ravvicinata creava una NUOVA
 * `Notifica` + `LogEvento` per lo stesso prestito già segnalato, spammando
 * l'utente (fino a ~288 notifiche identiche al giorno) e gonfiando l'audit.
 *
 * CORREZIONE: stessa guardia già usata da `sendCheckInReminders`
 * (`user: { notifiche: { none: {...} } } }`), scoped alla giornata corrente,
 * con `actionUrl` distinto tra l'avviso "3 giorni" e l'avviso "domani" così le
 * due guardie non si "consumano" a vicenda.
 *
 * Database di test reale (container `biblioflow-test-db`, 127.0.0.1:5433):
 * la guardia dipende dalla query Prisma `notifiche: { none: {...} } }`, che
 * qui si verifica per davvero contro Postgres.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { prisma } = await import("@/lib/prisma");
const { sendLoanExpiryAlerts } = await import("@/lib/automation-service");

const USER_ID = "bibalert-u1";
const LIBRO_ID = "bibalert-libro";
const PRESTITO_ID = "bibalert-prestito";

/** Orologio fissato: un istante qualunque di giornata, lontano da mezzanotte. */
const NOW = new Date("2026-09-05T10:00:00.000Z");
/** Scadenza fra esattamente 3 giorni da NOW: cade nella finestra "avviso anticipato". */
const SCADENZA_3_GIORNI = new Date(NOW.getTime() + 3 * 24 * 60 * 60 * 1000);

async function pulisci() {
  // `sendLoanExpiryAlerts` scrive `LogEvento` SENZA `userId`/`targetUserId` a
  // livello di colonna (l'id utente sta solo dentro `dettagli`, JSON): la
  // pulizia scoped deve quindi appoggiarsi alla `descrizione`, che contiene
  // sempre l'id del prestito.
  await prisma.logEvento.deleteMany({ where: { descrizione: { contains: PRESTITO_ID } } });
  await prisma.notifica.deleteMany({ where: { userId: USER_ID } });
  await prisma.prestito.deleteMany({ where: { id: PRESTITO_ID } });
  await prisma.libro.deleteMany({ where: { id: LIBRO_ID } });
  await prisma.user.deleteMany({ where: { id: USER_ID } });
}

beforeAll(async () => {
  await pulisci();
  await prisma.user.create({
    data: {
      id: USER_ID,
      email: `${USER_ID}@biblioflow.test`,
      nome: "Test",
      cognome: "Alert",
      matricola: "BIBALERT1",
      ruolo: "STUDENTE",
      emailVerificata: true,
    },
  });
  await prisma.libro.create({
    data: {
      id: LIBRO_ID,
      isbn: "978-88-00-00000-0",
      titolo: "Libro di prova BIB-Alert",
      autore: "Autore Test",
      copieTotali: 1,
      copieDisponibili: 0,
    },
  });
});

beforeEach(async () => {
  await prisma.logEvento.deleteMany({ where: { descrizione: { contains: PRESTITO_ID } } });
  await prisma.notifica.deleteMany({ where: { userId: USER_ID } });
  await prisma.prestito.deleteMany({ where: { id: PRESTITO_ID } });
  await prisma.prestito.create({
    data: {
      id: PRESTITO_ID,
      userId: USER_ID,
      libroId: LIBRO_ID,
      stato: "ATTIVO",
      dataScadenza: SCADENZA_3_GIORNI,
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

describe("sendLoanExpiryAlerts · guardia anti-duplicato (cron ogni 5 minuti)", () => {
  it("non duplica l'alert '3 giorni' su esecuzioni ravvicinate nello stesso giorno", async () => {
    const primaEsecuzione = await sendLoanExpiryAlerts();
    const secondaEsecuzione = await sendLoanExpiryAlerts();
    const terzaEsecuzione = await sendLoanExpiryAlerts();

    expect(primaEsecuzione.sent).toBe(1);
    // Senza la guardia: sent === 1 anche qui (bug), e una seconda riga in DB.
    expect(secondaEsecuzione.sent).toBe(0);
    expect(terzaEsecuzione.sent).toBe(0);

    expect(
      await prisma.notifica.count({ where: { userId: USER_ID, tipo: "ALERT" } }),
    ).toBe(1);
    expect(
      await prisma.logEvento.count({
        where: { tipo: "AUTOMATION", descrizione: { contains: PRESTITO_ID } },
      }),
    ).toBe(1);
  });
});
