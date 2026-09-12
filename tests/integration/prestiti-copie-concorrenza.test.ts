/**
 * 🧪 TEST DI INTEGRAZIONE — CORSA CRITICA SU `copieDisponibili` (POST /api/prestiti)
 *
 * BUG VERIFICATO: `POST /api/prestiti` (src/app/api/prestiti/route.ts) leggeva
 * `libro.copieDisponibili` PRIMA di aprire la transazione, e dentro la
 * transazione eseguiva `decrement: 1` senza alcuna condizione sulla riga
 * aggiornata. Due richieste quasi simultanee per l'ULTIMA copia disponibile
 * leggono entrambe `copieDisponibili === 1`, superano il controllo, ed
 * entrambe decrementano: nessun vincolo impedisce a Postgres di eseguire
 * entrambe le UPDATE, quindi il risultato e' `copieDisponibili = -1` con DUE
 * prestiti attivi per una sola copia fisica.
 *
 * Si esercita l'endpoint reale (non la logica isolata) con due utenti diversi
 * che richiedono in parallelo l'unica copia rimasta dello stesso libro,
 * usando il database di test reale (container `biblioflow-test-db`,
 * 127.0.0.1:5433): il difetto e' una corsa a livello di riga Postgres, che un
 * mock di Prisma non potrebbe mai riprodurre.
 */

import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class MockAuthError extends Error {
    constructor(
      public readonly status: 401 | 403 | 404,
      public readonly code: string,
      message: string,
    ) {
      super(message);
    }
  }
  return { MockAuthError, requireUser: vi.fn() };
});

vi.mock("@/lib/auth", () => ({
  AuthError: mocks.MockAuthError,
  requireUser: mocks.requireUser,
  isStaff: (ruolo: string) => ruolo === "BIBLIOTECARIO" || ruolo === "ADMIN",
}));

// Rate limiting disattivato: qui si esercita solo la corsa su `copieDisponibili`.
vi.mock("@/lib/rate-limit", () => ({
  readApiRateLimiter: vi.fn(async () => null),
  loanRequestRateLimiter: vi.fn(async () => null),
}));

const { prisma } = await import("@/lib/prisma");
const prestitiRoute = await import("@/app/api/prestiti/route");

const LIBRO_ID = "bibcopie-libro";
const UTENTI = ["bibcopie-u1", "bibcopie-u2", "bibcopie-u3", "bibcopie-u4", "bibcopie-u5"];

function utenteAutenticato(id: string) {
  return {
    id,
    email: `${id}@biblioflow.test`,
    nome: "Test",
    cognome: id,
    ruolo: "STUDENTE" as const,
    matricola: id,
    isPendolare: false,
    necessitaAccessibilita: false,
  };
}

function richiestaPrestito() {
  return new NextRequest("http://localhost/api/prestiti", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ libroId: LIBRO_ID }),
  });
}

async function pulisci() {
  await prisma.logEvento.deleteMany({ where: { userId: { in: UTENTI } } });
  await prisma.notifica.deleteMany({ where: { userId: { in: UTENTI } } });
  await prisma.prestito.deleteMany({ where: { libroId: LIBRO_ID } });
  await prisma.libro.deleteMany({ where: { id: LIBRO_ID } });
  await prisma.user.deleteMany({ where: { id: { in: UTENTI } } });
}

beforeAll(async () => {
  await pulisci();
  await prisma.user.createMany({
    data: UTENTI.map((id) => ({
      id,
      email: `${id}@biblioflow.test`,
      nome: "Test",
      cognome: id,
      ruolo: "STUDENTE",
      matricola: id,
      emailVerificata: true,
    })),
  });
});

beforeEach(async () => {
  await prisma.logEvento.deleteMany({ where: { userId: { in: UTENTI } } });
  await prisma.notifica.deleteMany({ where: { userId: { in: UTENTI } } });
  await prisma.prestito.deleteMany({ where: { libroId: LIBRO_ID } });
  await prisma.libro.deleteMany({ where: { id: LIBRO_ID } });
  mocks.requireUser.mockReset();
});

afterAll(async () => {
  await pulisci();
  await prisma.$disconnect();
});

describe("POST /api/prestiti · corsa critica su copieDisponibili", () => {
  it("con UNA sola copia disponibile, N richieste concorrenti producono UN SOLO prestito e copieDisponibili non scende sotto zero", async () => {
    await prisma.libro.create({
      data: {
        id: LIBRO_ID,
        isbn: "978-88-00-00000-1",
        titolo: "Libro conteso",
        autore: "Autore Test",
        copieTotali: 1,
        copieDisponibili: 1,
      },
    });

    for (const id of UTENTI) {
      mocks.requireUser.mockResolvedValueOnce(utenteAutenticato(id));
    }

    const risposte = await Promise.all(
      UTENTI.map(() => prestitiRoute.POST(richiestaPrestito())),
    );
    const stati = risposte.map((r) => r.status);

    expect(stati.filter((s) => s === 201)).toHaveLength(1);
    expect(stati.filter((s) => s === 409)).toHaveLength(UTENTI.length - 1);

    const libro = await prisma.libro.findUniqueOrThrow({ where: { id: LIBRO_ID } });
    // MAI negativo: e' esattamente questo il sintomo del bug (-1).
    expect(libro.copieDisponibili).toBe(0);
    expect(libro.copieDisponibili).toBeGreaterThanOrEqual(0);

    expect(
      await prisma.prestito.count({ where: { libroId: LIBRO_ID, stato: "ATTIVO" } }),
    ).toBe(1);
  });
});
