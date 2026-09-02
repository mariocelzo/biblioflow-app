import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  promuoviPrimoInCoda: vi.fn(),
  prisma: {
    prenotazione: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
    posto: { update: vi.fn() },
    notifica: { create: vi.fn() },
    logEvento: { create: vi.fn() },
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: mocks.prisma,
}));

vi.mock("@/lib/prenotazioni-service", () => ({
  promuoviPrimoInCoda: mocks.promuoviPrimoInCoda,
}));

import { releaseNoShowReservations } from "@/lib/automation-service";

const prenotazione = {
  id: "prenotazione-bib40-001",
  userId: "utente-bib40-001",
  postoId: "posto-bib40-001",
  data: new Date("2030-01-15T00:00:00.000Z"),
  oraInizio: new Date("1970-01-01T09:00:00.000Z"),
  oraFine: new Date("1970-01-01T11:00:00.000Z"),
  user: { id: "utente-bib40-001" },
  posto: {
    id: "posto-bib40-001",
    numero: "A1",
    sala: { id: "sala-bib40-001", nome: "Sala test" },
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2030-01-15T10:00:00.000Z"));
  mocks.prisma.prenotazione.findMany.mockResolvedValue([prenotazione]);
  mocks.prisma.prenotazione.update.mockResolvedValue({
    ...prenotazione,
    stato: "NO_SHOW",
  });
  mocks.prisma.posto.update.mockResolvedValue({
    ...prenotazione.posto,
    stato: "DISPONIBILE",
  });
  mocks.prisma.notifica.create.mockResolvedValue({ id: "notifica-bib40-001" });
  mocks.prisma.logEvento.create.mockResolvedValue({ id: "evento-bib40-no-show" });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("promozione automatica dopo no-show (CA-04)", () => {
  it("[TC-BIB40-001] invoca il servizio sullo stesso posto e intervallo liberato", async () => {
    mocks.promuoviPrimoInCoda.mockResolvedValue({
      richiestaId: "coda-bib40-001",
      prenotazione: { id: "prenotazione-bib40-promossa" },
    });

    await expect(releaseNoShowReservations()).resolves.toMatchObject({
      released: 1,
      promoted: 1,
    });

    expect(mocks.promuoviPrimoInCoda).toHaveBeenCalledOnce();
    expect(mocks.promuoviPrimoInCoda).toHaveBeenCalledWith(
      {
        postoId: prenotazione.postoId,
        data: prenotazione.data,
        oraInizio: prenotazione.oraInizio,
        oraFine: prenotazione.oraFine,
        adesso: new Date("2030-01-15T10:00:00.000Z"),
      },
      mocks.prisma,
    );
  });

  it("[TC-BIB40-002] delega al servizio il LogEvento di promozione", async () => {
    mocks.promuoviPrimoInCoda.mockImplementation(async (_input, client) => {
      await client.logEvento.create({
        data: {
          tipo: "CODA_PROMOZIONE",
          prenotazioneId: "prenotazione-bib40-promossa",
        },
      });
      return {
        richiestaId: "coda-bib40-001",
        prenotazione: { id: "prenotazione-bib40-promossa" },
      };
    });

    await releaseNoShowReservations();

    expect(mocks.prisma.logEvento.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tipo: "CODA_PROMOZIONE",
        prenotazioneId: "prenotazione-bib40-promossa",
      }),
    });
  });

  it("[TC-BIB40-003] gestisce senza errori una coda vuota", async () => {
    mocks.promuoviPrimoInCoda.mockResolvedValue(null);

    await expect(releaseNoShowReservations()).resolves.toMatchObject({
      released: 1,
      promoted: 0,
    });
  });
});
