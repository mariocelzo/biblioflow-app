import { NextRequest } from "next/server";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const prisma = {
    user: {
      findUnique: vi.fn(),
    },
    posto: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    prenotazione: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    logEvento: {
      create: vi.fn(),
    },
    notifica: {
      create: vi.fn(),
    },
  };

  return {
    auth: vi.fn(),
    prisma,
  };
});

vi.mock("@/lib/prisma", () => ({
  default: mocks.prisma,
  prisma: mocks.prisma,
}));

vi.mock("@/lib/auth", () => ({
  auth: mocks.auth,
}));

type CollectionRoute = typeof import("@/app/api/prenotazioni/route");
type DetailRoute = typeof import("@/app/api/prenotazioni/[id]/route");
type CheckInRoute = typeof import("@/app/api/prenotazioni/[id]/check-in/route");
type ExtensionRoute = typeof import("@/app/api/prenotazioni/[id]/estendi/route");

let collectionRoute: CollectionRoute;
let detailRoute: DetailRoute;
let checkInRoute: CheckInRoute;
let extensionRoute: ExtensionRoute;

const user = {
  id: "pre-user-1",
  nome: "Mario",
  cognome: "Rossi",
  email: "mario.rossi@biblioflow.test",
};

const seat = {
  id: "pre-posto-a1",
  numero: "A1",
  stato: "DISPONIBILE",
  sala: {
    id: "pre-sala-1",
    nome: "Sala test",
    piano: 1,
    orarioApertura: "08:00",
    orarioChiusura: "18:00",
  },
};

function jsonRequest(url: string, method: "POST" | "PATCH", body: object) {
  return new NextRequest(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function reservation(overrides: Record<string, unknown> = {}) {
  return {
    id: "pre-prenotazione-1",
    userId: user.id,
    postoId: seat.id,
    data: new Date("2030-01-15T00:00:00.000Z"),
    oraInizio: new Date("1970-01-01T09:00:00.000Z"),
    oraFine: new Date("1970-01-01T11:00:00.000Z"),
    stato: "CONFERMATA",
    user,
    posto: seat,
    ...overrides,
  };
}

function arrangeSuccessfulCreation() {
  const created = reservation();

  mocks.prisma.user.findUnique.mockResolvedValue(user);
  mocks.prisma.posto.findUnique.mockResolvedValue(seat);
  mocks.prisma.prenotazione.findMany
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([]);
  mocks.prisma.prenotazione.create.mockResolvedValue(created);
  mocks.prisma.logEvento.create.mockResolvedValue({ id: "pre-log-1" });
  mocks.prisma.notifica.create.mockResolvedValue({ id: "pre-notifica-1" });

  return created;
}

beforeAll(async () => {
  collectionRoute = await import("@/app/api/prenotazioni/route");
  detailRoute = await import("@/app/api/prenotazioni/[id]/route");
  checkInRoute = await import("@/app/api/prenotazioni/[id]/check-in/route");
  extensionRoute = await import("@/app/api/prenotazioni/[id]/estendi/route");
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("prenotazioni pre-modifica", () => {
  it("[TC-PRE-001] crea una prenotazione valida con log e notifica", async () => {
    const created = arrangeSuccessfulCreation();
    const response = await collectionRoute.POST(
      jsonRequest("http://localhost/api/prenotazioni", "POST", {
        userId: user.id,
        postoId: seat.id,
        data: "2030-01-15",
        oraInizio: "09:00",
        oraFine: "11:00",
      }),
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: { id: created.id, stato: "CONFERMATA" },
    });
    expect(mocks.prisma.prenotazione.create).toHaveBeenCalledOnce();
    expect(mocks.prisma.logEvento.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tipo: "PRENOTAZIONE_CREATA",
        userId: user.id,
      }),
    });
    expect(mocks.prisma.notifica.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tipo: "PRENOTAZIONE",
        userId: user.id,
      }),
    });
  });

  it("[TC-PRE-002] rifiuta una creazione con campi obbligatori mancanti", async () => {
    const response = await collectionRoute.POST(
      jsonRequest("http://localhost/api/prenotazioni", "POST", {
        userId: user.id,
        postoId: seat.id,
        data: "2030-01-15",
        oraInizio: "09:00",
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining("Campi obbligatori mancanti"),
    });
    expect(mocks.prisma.prenotazione.create).not.toHaveBeenCalled();
  });

  it("[TC-PRE-003] rifiuta un intervallo fuori dall'orario della sala", async () => {
    arrangeSuccessfulCreation();
    const response = await collectionRoute.POST(
      jsonRequest("http://localhost/api/prenotazioni", "POST", {
        userId: user.id,
        postoId: seat.id,
        data: "2030-01-15",
        oraInizio: "07:30",
        oraFine: "09:00",
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: "La sala è aperta dalle 08:00 alle 18:00",
    });
    expect(mocks.prisma.prenotazione.create).not.toHaveBeenCalled();
  });

  it("[TC-PRE-004] caratterizza l'accettazione anomala di un intervallo invertito", async () => {
    arrangeSuccessfulCreation();
    const response = await collectionRoute.POST(
      jsonRequest("http://localhost/api/prenotazioni", "POST", {
        userId: user.id,
        postoId: seat.id,
        data: "2030-01-15",
        oraInizio: "11:00",
        oraFine: "09:00",
      }),
    );

    expect(response.status).toBe(201);
    expect(mocks.prisma.prenotazione.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          oraInizio: expect.any(Date),
          oraFine: expect.any(Date),
        }),
      }),
    );
  });

  it("[TC-PRE-005] rifiuta la sovrapposizione sullo stesso posto", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(user);
    mocks.prisma.posto.findUnique.mockResolvedValue(seat);
    mocks.prisma.prenotazione.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        reservation({
          id: "pre-prenotazione-conflitto",
          oraInizio: new Date(1970, 0, 1, 10, 0),
          oraFine: new Date(1970, 0, 1, 12, 0),
        }),
      ]);

    const response = await collectionRoute.POST(
      jsonRequest("http://localhost/api/prenotazioni", "POST", {
        userId: user.id,
        postoId: seat.id,
        data: "2030-01-15",
        oraInizio: "09:00",
        oraFine: "11:00",
      }),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: "Il posto è già prenotato per questo orario",
    });
    expect(mocks.prisma.prenotazione.create).not.toHaveBeenCalled();
  });

  it("[TC-PRE-006] cancella logicamente una prenotazione attiva e registra l'evento", async () => {
    const current = reservation();
    mocks.prisma.prenotazione.findUnique.mockResolvedValue(current);
    mocks.prisma.prenotazione.update.mockResolvedValue(
      reservation({ stato: "CANCELLATA" }),
    );
    mocks.prisma.logEvento.create.mockResolvedValue({ id: "pre-log-cancellazione" });

    const response = await detailRoute.PATCH(
      jsonRequest(
        `http://localhost/api/prenotazioni/${current.id}`,
        "PATCH",
        { azione: "cancella", userId: user.id },
      ),
      { params: Promise.resolve({ id: current.id }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.prisma.prenotazione.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: current.id },
        data: { stato: "CANCELLATA" },
      }),
    );
    expect(mocks.prisma.logEvento.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tipo: "PRENOTAZIONE_CANCELLATA",
        prenotazioneId: current.id,
      }),
    });
  });

  it("[TC-PRE-007] caratterizza il check-in dedicato scaduto per il confronto data/time", async () => {
    const current = reservation();
    mocks.auth.mockResolvedValue({ user: { id: user.id } });
    mocks.prisma.prenotazione.findUnique.mockResolvedValue(current);

    const response = await checkInRoute.POST(
      jsonRequest(
        `http://localhost/api/prenotazioni/${current.id}/check-in`,
        "POST",
        { timestamp: "2030-01-15T08:50:00.000Z" },
      ),
      { params: Promise.resolve({ id: current.id }) },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Il periodo di check-in è scaduto",
    });
    expect(mocks.prisma.prenotazione.update).not.toHaveBeenCalled();
  });

  it("[TC-PRE-008] effettua il check-in tramite l'azione PATCH legacy", async () => {
    const current = reservation();
    mocks.prisma.prenotazione.findUnique.mockResolvedValue(current);
    mocks.prisma.prenotazione.update.mockResolvedValue(
      reservation({ stato: "CHECK_IN", checkInAt: new Date() }),
    );
    mocks.prisma.posto.update.mockResolvedValue({ ...seat, stato: "OCCUPATO" });
    mocks.prisma.logEvento.create.mockResolvedValue({ id: "pre-log-check-in" });

    const response = await detailRoute.PATCH(
      jsonRequest(
        `http://localhost/api/prenotazioni/${current.id}`,
        "PATCH",
        { azione: "check-in", userId: user.id },
      ),
      { params: Promise.resolve({ id: current.id }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.prisma.posto.update).toHaveBeenCalledWith({
      where: { id: seat.id },
      data: { stato: "OCCUPATO" },
    });
    expect(mocks.prisma.logEvento.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ tipo: "CHECK_IN" }),
    });
  });

  it("[TC-PRE-009] rifiuta un'estensione in conflitto con la prenotazione successiva", async () => {
    const sameDay = new Date(1970, 0, 1, 0, 0);
    const current = reservation({
      data: sameDay,
      oraInizio: new Date(1970, 0, 1, 9, 0),
      oraFine: new Date(1970, 0, 1, 11, 0),
    });
    mocks.prisma.prenotazione.findUnique.mockResolvedValue(current);
    mocks.prisma.prenotazione.findFirst.mockResolvedValue(
      reservation({ id: "pre-prenotazione-successiva" }),
    );

    const response = await extensionRoute.POST(
      jsonRequest(
        `http://localhost/api/prenotazioni/${current.id}/estendi`,
        "POST",
        { nuovaOraFine: "13:00" },
      ),
      { params: Promise.resolve({ id: current.id }) },
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining("non è disponibile"),
    });
    expect(mocks.prisma.prenotazione.update).not.toHaveBeenCalled();
  });

  it("[TC-PRE-010] caratterizza il rifiuto anomalo dell'estensione con data e time Prisma", async () => {
    const current = reservation();
    mocks.prisma.prenotazione.findUnique.mockResolvedValue(current);
    mocks.prisma.prenotazione.findFirst.mockResolvedValue(null);

    const response = await extensionRoute.POST(
      jsonRequest(
        `http://localhost/api/prenotazioni/${current.id}/estendi`,
        "POST",
        { nuovaOraFine: "13:00" },
      ),
      { params: Promise.resolve({ id: current.id }) },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: "La durata massima di una prenotazione è 8 ore",
    });
    expect(mocks.prisma.prenotazione.update).not.toHaveBeenCalled();
  });
});
