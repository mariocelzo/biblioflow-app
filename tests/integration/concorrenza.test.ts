import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  assertTestDatabaseUrl,
  DEFAULT_TEST_DATABASE_URL,
} from "../fixtures/database";

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
}));

const databaseUrl = process.env.DATABASE_URL ?? DEFAULT_TEST_DATABASE_URL;
assertTestDatabaseUrl(databaseUrl);

const { prisma } = await import("@/lib/prisma");
const reservationRoute = await import("@/app/api/prenotazioni/route");

const salaId = "bib38-sala";
const postoId = "bib38-posto";
const userIds = Array.from({ length: 5 }, (_, index) => `bib38-user-${index + 1}`);

function authenticatedUser(id: string) {
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

function request() {
  return new NextRequest("http://localhost/api/prenotazioni", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      postoId,
      data: "2031-03-10",
      oraInizio: "09:00",
      oraFine: "11:00",
    }),
  });
}

async function pulisciPrenotazioni() {
  await prisma.logEvento.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.notifica.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.prenotazione.deleteMany({ where: { userId: { in: userIds } } });
}

async function eseguiRound(numeroRichieste: number) {
  await pulisciPrenotazioni();
  mocks.requireUser.mockReset();
  for (const userId of userIds.slice(0, numeroRichieste)) {
    mocks.requireUser.mockResolvedValueOnce(authenticatedUser(userId));
  }

  const responses = await Promise.all(
    Array.from({ length: numeroRichieste }, () => reservationRoute.POST(request())),
  );
  const statuses = responses.map((response) => response.status);
  const confermate = await prisma.prenotazione.findMany({
    where: {
      postoId,
      data: new Date("2031-03-10T00:00:00.000Z"),
      stato: "CONFERMATA",
    },
  });

  expect(statuses.filter((status) => status === 201)).toHaveLength(1);
  expect(statuses.filter((status) => status === 409)).toHaveLength(
    numeroRichieste - 1,
  );
  expect(confermate).toHaveLength(1);
  expect(
    await prisma.prenotazione.count({ where: { userId: { in: userIds } } }),
  ).toBe(1);
}

beforeAll(async () => {
  await prisma.user.createMany({
    data: userIds.map((id) => ({
      id,
      email: `${id}@biblioflow.test`,
      nome: "Test",
      cognome: id,
      ruolo: "STUDENTE",
      matricola: id,
      emailVerificata: true,
    })),
    skipDuplicates: true,
  });
  await prisma.sala.upsert({
    where: { id: salaId },
    update: {},
    create: { id: salaId, nome: "Sala BIB-38", piano: 1, capienzaMax: 1 },
  });
  await prisma.posto.upsert({
    where: { id: postoId },
    update: {},
    create: {
      id: postoId,
      numero: "B38",
      salaId,
      coordinataX: 0,
      coordinataY: 0,
    },
  });
});

beforeEach(async () => {
  await pulisciPrenotazioni();
});

afterAll(async () => {
  await pulisciPrenotazioni();
  await prisma.posto.deleteMany({ where: { id: postoId } });
  await prisma.sala.deleteMany({ where: { id: salaId } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

describe("concorrenza sulla creazione prenotazione (CA-02)", () => {
  it("accetta esattamente una di due richieste simultanee in tre round", async () => {
    for (let round = 0; round < 3; round += 1) {
      await eseguiRound(2);
    }
  });

  it("accetta esattamente una di N richieste e non lascia record fantasma", async () => {
    for (let round = 0; round < 3; round += 1) {
      await eseguiRound(5);
    }
  });
});
