/**
 * 🧪 TEST DI INTEGRAZIONE (DB) — POST /api/admin/prestiti, azione RESTITUISCI
 *
 * BUG VERIFICATO: la restituzione registrata dal personale (case
 * "RESTITUISCI" di src/app/api/admin/prestiti/route.ts) aggiornava SOLO lo
 * stato del prestito, senza incrementare `Libro.copieDisponibili` come fa
 * invece la restituzione lato studente (src/app/api/prestiti/[id]/route.ts,
 * azione "restituisci"). Ogni restituzione registrata al banco "perdeva" una
 * copia per sempre: il libro restava "non disponibile" nel catalogo pur
 * essendo di nuovo fisicamente sullo scaffale.
 *
 * La correzione usa un `updateMany` condizionato su `stato != RESTITUITO`
 * dentro una transazione (stessa tecnica del decremento condizionato di
 * `copieDisponibili` in POST /api/prestiti, PR #67), per evitare che due
 * richieste quasi simultanee sullo stesso prestito (doppio click, retry di
 * rete) incrementino le copie due volte. È una corsa a livello di riga
 * Postgres: un Prisma mockato non la riprodurrebbe (stesso principio di
 * tests/integration/prestiti-copie-concorrenza.test.ts).
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

const PREFISSO = "adminrest";
const LIBRO_ID = `${PREFISSO}-libro`;
const STUDENTE_ID = `${PREFISSO}-studente`;
const STAFF = {
  id: `${PREFISSO}-staff`,
  email: "staff-rest@biblioflow.test",
  ruolo: "BIBLIOTECARIO",
};

function richiestaRestituisci(prestitoId: string) {
  return new NextRequest("http://localhost/api/admin/prestiti", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ azione: "RESTITUISCI", prestitoId }),
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
});

beforeEach(async () => {
  await prisma.logEvento.deleteMany({ where: { userId: STUDENTE_ID } });
  await prisma.notifica.deleteMany({ where: { userId: STUDENTE_ID } });
  await prisma.prestito.deleteMany({ where: { libroId: LIBRO_ID } });
  await prisma.libro.deleteMany({ where: { id: LIBRO_ID } });
  mocks.auth.mockReset();
  mocks.auth.mockResolvedValue({ user: STAFF });
});

afterAll(async () => {
  await pulisci();
  await prisma.$disconnect();
});

describe("POST /api/admin/prestiti · RESTITUISCI ripristina le copie", () => {
  it("incrementa copieDisponibili quando lo staff registra la restituzione", async () => {
    const libro = await prisma.libro.create({
      data: {
        id: LIBRO_ID,
        isbn: "978-88-00-00101-1",
        titolo: "Libro in prestito",
        autore: "Autore Test",
        copieTotali: 1,
        copieDisponibili: 0,
      },
    });

    const prestito = await prisma.prestito.create({
      data: { userId: STUDENTE_ID, libroId: libro.id, dataScadenza: new Date(), stato: "ATTIVO" },
    });

    const risposta = await adminPrestitiRoute.POST(richiestaRestituisci(prestito.id));
    expect(risposta.status).toBe(200);

    const libroAggiornato = await prisma.libro.findUniqueOrThrow({ where: { id: libro.id } });
    expect(libroAggiornato.copieDisponibili).toBe(1);

    const prestitoAggiornato = await prisma.prestito.findUniqueOrThrow({ where: { id: prestito.id } });
    expect(prestitoAggiornato.stato).toBe("RESTITUITO");
    expect(prestitoAggiornato.dataRestituzione).not.toBeNull();
  });

  it("rifiuta con 400 la restituzione di un prestito già RESTITUITO, senza toccare le copie", async () => {
    const libro = await prisma.libro.create({
      data: {
        id: LIBRO_ID,
        isbn: "978-88-00-00101-2",
        titolo: "Libro già restituito",
        autore: "Autore Test",
        copieTotali: 1,
        copieDisponibili: 1,
      },
    });

    const prestito = await prisma.prestito.create({
      data: {
        userId: STUDENTE_ID,
        libroId: libro.id,
        dataScadenza: new Date(),
        dataRestituzione: new Date(),
        stato: "RESTITUITO",
      },
    });

    const risposta = await adminPrestitiRoute.POST(richiestaRestituisci(prestito.id));
    expect(risposta.status).toBe(400);

    const libroInvariato = await prisma.libro.findUniqueOrThrow({ where: { id: libro.id } });
    expect(libroInvariato.copieDisponibili).toBe(1);
  });

  it("con N richieste concorrenti sullo stesso prestito, copieDisponibili aumenta di UNO solo (niente doppio incremento da doppio click)", async () => {
    const libro = await prisma.libro.create({
      data: {
        id: LIBRO_ID,
        isbn: "978-88-00-00101-3",
        titolo: "Libro conteso in restituzione",
        autore: "Autore Test",
        copieTotali: 1,
        copieDisponibili: 0,
      },
    });

    const prestito = await prisma.prestito.create({
      data: { userId: STUDENTE_ID, libroId: libro.id, dataScadenza: new Date(), stato: "ATTIVO" },
    });

    const N = 5;
    const risposte = await Promise.all(
      Array.from({ length: N }, () => adminPrestitiRoute.POST(richiestaRestituisci(prestito.id))),
    );
    const stati = risposte.map((r) => r.status);

    // Esattamente UNA richiesta ha davvero registrato la restituzione.
    expect(stati.filter((s) => s === 200)).toHaveLength(1);
    expect(stati.filter((s) => s === 400)).toHaveLength(N - 1);

    const libroAggiornato = await prisma.libro.findUniqueOrThrow({ where: { id: libro.id } });
    // MAI più di 1: e' esattamente il sintomo del difetto (doppio incremento).
    expect(libroAggiornato.copieDisponibili).toBe(1);
  });
});
