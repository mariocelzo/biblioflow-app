/**
 * 🧪 TEST DI INTEGRAZIONE (DB) — POST /api/admin/prestiti, azione RINNOVA
 *
 * BUG VERIFICATO: il rinnovo dal pannello admin (case "RINNOVA" di
 * src/app/api/admin/prestiti/route.ts) rifiutava un prestito già RINNOVATO
 * (`stato !== "ATTIVO" && stato !== "SCADUTO"`), rendendo irraggiungibile il
 * SECONDO rinnovo dato che `Prestito.maxRinnovi` di default è 2; inoltre non
 * incrementava mai il contatore `rinnovi`, quindi quel tetto non era comunque
 * applicabile dal pannello admin (un domani con un controllo diverso,
 * l'admin avrebbe potuto rinnovare all'infinito).
 *
 * La correzione allinea il controllo e l'incremento a quelli già usati dal
 * rinnovo studente (POST /api/prestiti/[id]/rinnova, che usa
 * `prestitoInCorso` = ATTIVO o RINNOVATO, esclude SCADUTO, e incrementa
 * `rinnovi`): un'azione dello staff non deve permettere né meno né più di
 * quello che l'azione equivalente dello studente permetterebbe.
 */

import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn() }));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/rate-limit", () => ({
  staffCriticalApiRateLimiter: vi.fn(async () => null),
}));

const { prisma } = await import("@/lib/prisma");
const adminPrestitiRoute = await import("@/app/api/admin/prestiti/route");

const PREFISSO = "adminrinn";
const LIBRO_ID = `${PREFISSO}-libro`;
const STUDENTE_ID = `${PREFISSO}-studente`;
const STAFF = {
  id: `${PREFISSO}-staff`,
  email: "staff-rinn@biblioflow.test",
  ruolo: "BIBLIOTECARIO",
};

function richiestaRinnova(prestitoId: string) {
  return new NextRequest("http://localhost/api/admin/prestiti", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ azione: "RINNOVA", prestitoId }),
  });
}

async function pulisci() {
  await prisma.logEvento.deleteMany({ where: { userId: STUDENTE_ID } });
  await prisma.notifica.deleteMany({ where: { userId: STUDENTE_ID } });
  await prisma.prestito.deleteMany({ where: { libroId: LIBRO_ID } });
  await prisma.libro.deleteMany({ where: { id: LIBRO_ID } });
  await prisma.user.deleteMany({ where: { id: STUDENTE_ID } });
}

beforeAll(async () => {
  await pulisci();
  await prisma.user.create({
    data: {
      id: STUDENTE_ID,
      email: `${STUDENTE_ID}@biblioflow.test`,
      nome: "Test",
      cognome: "Studente",
      ruolo: "STUDENTE",
      matricola: STUDENTE_ID,
      emailVerificata: true,
    },
  });
  await prisma.libro.create({
    data: {
      id: LIBRO_ID,
      isbn: "978-88-00-00201-1",
      titolo: "Libro da rinnovare",
      autore: "Autore Test",
      copieTotali: 3,
      copieDisponibili: 2,
    },
  });
});

beforeEach(async () => {
  await prisma.logEvento.deleteMany({ where: { userId: STUDENTE_ID } });
  await prisma.notifica.deleteMany({ where: { userId: STUDENTE_ID } });
  await prisma.prestito.deleteMany({ where: { libroId: LIBRO_ID } });
  mocks.auth.mockReset();
  mocks.auth.mockResolvedValue({ user: STAFF });
});

afterAll(async () => {
  await pulisci();
  await prisma.$disconnect();
});

describe("POST /api/admin/prestiti · RINNOVA rispetta il tetto rinnovi", () => {
  it("rinnova un prestito ATTIVO: stato -> RINNOVATO, rinnovi 0 -> 1, scadenza +14 giorni", async () => {
    const prestito = await prisma.prestito.create({
      data: { userId: STUDENTE_ID, libroId: LIBRO_ID, dataScadenza: new Date(), stato: "ATTIVO" },
    });

    const risposta = await adminPrestitiRoute.POST(richiestaRinnova(prestito.id));
    expect(risposta.status).toBe(200);

    const aggiornato = await prisma.prestito.findUniqueOrThrow({ where: { id: prestito.id } });
    expect(aggiornato.stato).toBe("RINNOVATO");
    expect(aggiornato.rinnovi).toBe(1);

    const giorni = Math.round(
      (aggiornato.dataScadenza.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
    );
    expect(giorni).toBeGreaterThanOrEqual(13);
    expect(giorni).toBeLessThanOrEqual(14);
  });

  it("un prestito già RINNOVATO (sotto il tetto) è rinnovabile una seconda volta dall'admin", async () => {
    // Prima del fix: rifiutato SOLO perché stato === RINNOVATO, anche se
    // rinnovi (1) era sotto maxRinnovi (2) — il secondo rinnovo era
    // irraggiungibile dal pannello admin.
    const prestito = await prisma.prestito.create({
      data: {
        userId: STUDENTE_ID,
        libroId: LIBRO_ID,
        dataScadenza: new Date(),
        stato: "RINNOVATO",
        rinnovi: 1,
        maxRinnovi: 2,
      },
    });

    const risposta = await adminPrestitiRoute.POST(richiestaRinnova(prestito.id));
    expect(risposta.status).toBe(200);

    const aggiornato = await prisma.prestito.findUniqueOrThrow({ where: { id: prestito.id } });
    expect(aggiornato.stato).toBe("RINNOVATO");
    expect(aggiornato.rinnovi).toBe(2);
  });

  it("rifiuta il rinnovo quando rinnovi ha già raggiunto maxRinnovi", async () => {
    const prestito = await prisma.prestito.create({
      data: {
        userId: STUDENTE_ID,
        libroId: LIBRO_ID,
        dataScadenza: new Date(),
        stato: "RINNOVATO",
        rinnovi: 2,
        maxRinnovi: 2,
      },
    });

    const risposta = await adminPrestitiRoute.POST(richiestaRinnova(prestito.id));
    expect(risposta.status).toBe(400);
    const body = await risposta.json();
    expect(String(body.error)).toContain("2");

    const invariato = await prisma.prestito.findUniqueOrThrow({ where: { id: prestito.id } });
    expect(invariato.rinnovi).toBe(2);
    expect(invariato.stato).toBe("RINNOVATO");
  });

  it("rifiuta il rinnovo di un prestito SCADUTO, come per lo studente (POST /api/prestiti/[id]/rinnova)", async () => {
    const prestito = await prisma.prestito.create({
      data: {
        userId: STUDENTE_ID,
        libroId: LIBRO_ID,
        dataScadenza: new Date(Date.now() - 1000 * 60 * 60 * 24 * 10),
        stato: "SCADUTO",
      },
    });

    const risposta = await adminPrestitiRoute.POST(richiestaRinnova(prestito.id));
    expect(risposta.status).toBe(400);

    const invariato = await prisma.prestito.findUniqueOrThrow({ where: { id: prestito.id } });
    expect(invariato.stato).toBe("SCADUTO");
    expect(invariato.rinnovi).toBe(0);
  });
});
