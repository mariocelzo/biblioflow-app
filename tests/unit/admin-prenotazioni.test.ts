import { NextRequest } from "next/server";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  prisma: {
    prenotazione: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    posto: {
      update: vi.fn(),
    },
    user: {
      // BIB-50 / CA-06: lookup del nome dell'utente promosso per il feedback admin.
      findUnique: vi.fn(),
    },
    logEvento: {
      create: vi.fn(),
    },
    notifica: {
      create: vi.fn(),
    },
  },
  promuoviPrimoInCoda: vi.fn(),
  emitCodaPromozione: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/prisma", () => ({ default: mocks.prisma }));
vi.mock("@/lib/prenotazioni-service", () => ({
  promuoviPrimoInCoda: mocks.promuoviPrimoInCoda,
}));
vi.mock("@/lib/realtime-events", () => ({
  emitCodaPromozione: mocks.emitCodaPromozione,
}));

type AdminReservationsRoute = typeof import("@/app/api/admin/prenotazioni/route");

let route: AdminReservationsRoute;

const bibliotecario = {
  id: "bibliotecario-1",
  email: "bibliotecario@biblioflow.test",
  ruolo: "BIBLIOTECARIO",
};

const prenotazione = {
  id: "prenotazione-da-cancellare",
  userId: "utente-originario",
  postoId: "posto-a1",
  data: new Date("2030-01-15T00:00:00.000Z"),
  oraInizio: new Date("1970-01-01T09:00:00.000Z"),
  oraFine: new Date("1970-01-01T11:00:00.000Z"),
  stato: "CONFERMATA",
  user: {
    id: "utente-originario",
    email: "originario@biblioflow.test",
  },
  posto: {
    id: "posto-a1",
    numero: "A1",
    stato: "OCCUPATO",
  },
};

const promozione = {
  richiestaId: "coda-1",
  prenotazione: {
    id: "prenotazione-promossa",
    userId: "utente-promosso",
    postoId: prenotazione.postoId,
    data: prenotazione.data,
    oraInizio: prenotazione.oraInizio,
    oraFine: prenotazione.oraFine,
  },
};

function request(body: object) {
  return new NextRequest("http://localhost/api/admin/prenotazioni", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeAll(async () => {
  route = await import("@/app/api/admin/prenotazioni/route");
});

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ user: bibliotecario });
  mocks.prisma.prenotazione.update.mockResolvedValue({
    ...prenotazione,
    stato: "CANCELLATA",
  });
  mocks.prisma.posto.update.mockResolvedValue({
    ...prenotazione.posto,
    stato: "DISPONIBILE",
  });
  mocks.prisma.logEvento.create.mockResolvedValue({ id: "log-1" });
  mocks.prisma.notifica.create.mockResolvedValue({ id: "notifica-1" });
  mocks.prisma.user.findUnique.mockResolvedValue({
    nome: "Ada",
    cognome: "Lovelace",
  });
});

describe("BIB-49 · cancellazione admin e promozione dalla coda", () => {
  it("[TC-BIB49-001] promuove e notifica il primo in coda dopo la cancellazione singola", async () => {
    mocks.prisma.prenotazione.findUnique.mockResolvedValue(prenotazione);
    mocks.promuoviPrimoInCoda.mockResolvedValue(promozione);

    const response = await route.POST(
      request({
        azione: "ANNULLA_SINGOLA",
        prenotazioneId: prenotazione.id,
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      promozione: {
        richiestaId: promozione.richiestaId,
        prenotazioneId: promozione.prenotazione.id,
        userId: promozione.prenotazione.userId,
        postoId: prenotazione.postoId,
        // BIB-50 / CA-06: l'esito porta con sé nome e cognome dell'utente promosso.
        utente: { nome: "Ada", cognome: "Lovelace" },
      },
    });
    expect(mocks.prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: promozione.prenotazione.userId },
      select: { nome: true, cognome: true },
    });
    expect(mocks.promuoviPrimoInCoda).toHaveBeenCalledWith(
      {
        postoId: prenotazione.postoId,
        data: prenotazione.data,
        oraInizio: prenotazione.oraInizio,
        oraFine: prenotazione.oraFine,
      },
      mocks.prisma,
    );
    expect(mocks.prisma.notifica.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: promozione.prenotazione.userId,
        tipo: "CODA_PROMOZIONE",
        actionUrl: `/prenotazioni/${promozione.prenotazione.id}`,
      }),
    });
    expect(mocks.prisma.logEvento.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tipo: "OVERRIDE_BIBLIOTECARIO",
        userId: bibliotecario.id,
        targetUserId: promozione.prenotazione.userId,
        prenotazioneId: promozione.prenotazione.id,
        dettagli: expect.objectContaining({
          azione: "CANCELLAZIONE_ADMIN",
          prenotazioneCancellataId: prenotazione.id,
          attore: {
            tipo: "personale",
            userId: bibliotecario.id,
            email: bibliotecario.email,
            ruolo: bibliotecario.ruolo,
          },
        }),
      }),
    });
    expect(mocks.emitCodaPromozione).toHaveBeenCalledWith({
      userId: promozione.prenotazione.userId,
      postoId: prenotazione.postoId,
      numero: prenotazione.posto.numero,
      prenotazioneId: promozione.prenotazione.id,
      data: "2030-01-15",
      oraInizio: "09:00",
      oraFine: "11:00",
    });
  });

  it("[TC-BIB49-002] tenta la promozione per ogni slot cancellato in massa", async () => {
    const secondaPrenotazione = {
      ...prenotazione,
      id: "prenotazione-2",
      postoId: "posto-b2",
      posto: { id: "posto-b2", numero: "B2", stato: "OCCUPATO" },
    };
    mocks.prisma.prenotazione.findMany.mockResolvedValue([
      prenotazione,
      secondaPrenotazione,
    ]);
    mocks.promuoviPrimoInCoda
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        ...promozione,
        prenotazione: {
          ...promozione.prenotazione,
          id: "prenotazione-promossa-2",
          postoId: secondaPrenotazione.postoId,
        },
      });

    const response = await route.POST(
      request({
        azione: "ANNULLA_MULTIPLE",
        prenotazioneIds: [prenotazione.id, secondaPrenotazione.id],
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.promuoviPrimoInCoda).toHaveBeenCalledTimes(2);
    expect(payload.promozioni).toHaveLength(1);
    expect(payload.promozioni[0]).toMatchObject({
      prenotazioneId: "prenotazione-promossa-2",
      userId: promozione.prenotazione.userId,
      postoId: secondaPrenotazione.postoId,
    });
  });

  it("[TC-BIB49-003] lascia un esito esplicito quando la coda e vuota", async () => {
    mocks.prisma.prenotazione.findUnique.mockResolvedValue(prenotazione);
    mocks.promuoviPrimoInCoda.mockResolvedValue(null);

    const response = await route.POST(
      request({
        azione: "ANNULLA_SINGOLA",
        prenotazioneId: prenotazione.id,
      }),
    );

    await expect(response.json()).resolves.toMatchObject({
      success: true,
      promozione: null,
    });
    expect(mocks.prisma.notifica.create).not.toHaveBeenCalledWith({
      data: expect.objectContaining({ tipo: "CODA_PROMOZIONE" }),
    });
    expect(mocks.emitCodaPromozione).not.toHaveBeenCalled();
  });

  it("[TC-BIB49-004] se il dominio rifiuta lo slot (es. data passata) la cancellazione resta valida", async () => {
    mocks.prisma.prenotazione.findUnique.mockResolvedValue(prenotazione);
    // promuoviPrimoInCoda valida l'intervallo e può lanciare per uno slot nel
    // passato: la cancellazione non deve andare in 500.
    mocks.promuoviPrimoInCoda.mockRejectedValue(
      new Error("Scegli una data di oggi o successiva"),
    );

    const response = await route.POST(
      request({
        azione: "ANNULLA_SINGOLA",
        prenotazioneId: prenotazione.id,
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      promozione: null,
    });
    expect(mocks.prisma.prenotazione.update).toHaveBeenCalledWith({
      where: { id: prenotazione.id },
      data: { stato: "CANCELLATA" },
    });
    expect(mocks.emitCodaPromozione).not.toHaveBeenCalled();
  });
});
