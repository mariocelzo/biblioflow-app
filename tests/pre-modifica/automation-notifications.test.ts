import { spawnSync } from "node:child_process";
import path from "node:path";
import { NextRequest } from "next/server";
import type { PrismaClient } from "@prisma/client";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import {
  assertTestDatabaseUrl,
  DEFAULT_TEST_DATABASE_URL,
} from "../fixtures/database";

type AutomationService = typeof import("@/lib/automation-service");
type NotificationsRoute = typeof import("@/app/api/notifiche/route");

const databaseUrl = process.env.DATABASE_URL ?? DEFAULT_TEST_DATABASE_URL;

let prisma: PrismaClient;
let automationService: AutomationService;
let notificationsRoute: NotificationsRoute;

function synchronizeTestSchema(): void {
  assertTestDatabaseUrl(databaseUrl);

  const executable = path.resolve(
    process.cwd(),
    "node_modules",
    ".bin",
    process.platform === "win32" ? "prisma.cmd" : "prisma",
  );
  const result = spawnSync(executable, ["db", "push"], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: databaseUrl },
    encoding: "utf8",
    shell: process.platform === "win32",
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `Sincronizzazione schema del DB di test fallita:\n${result.stdout}\n${result.stderr}`,
    );
  }
}

async function resetAutomationTestData(): Promise<void> {
  // La CI applica le migrazioni versionate, che non contengono ancora tutti i
  // modelli dello schema corrente. La suite pulisce soltanto le tabelle che usa.
  await prisma.$transaction([
    prisma.logEvento.deleteMany(),
    prisma.notifica.deleteMany(),
    prisma.prenotazione.deleteMany(),
    prisma.posto.deleteMany(),
    prisma.sala.deleteMany(),
    prisma.user.deleteMany(),
  ]);
}

function today(): Date {
  const value = new Date();
  value.setHours(0, 0, 0, 0);
  return value;
}

function timeAtOffset(minutes: number): Date {
  const value = new Date(Date.now() + minutes * 60_000);
  return new Date(Date.UTC(
    1970,
    0,
    1,
    value.getUTCHours(),
    value.getUTCMinutes(),
    value.getUTCSeconds(),
    0,
  ));
}

async function createStudentSeat(prefix: string, seatState: "DISPONIBILE" | "OCCUPATO" = "DISPONIBILE") {
  const user = await prisma.user.create({
    data: {
      id: `${prefix}-user`,
      email: `${prefix}@biblioflow.test`,
      nome: "Utente",
      cognome: prefix,
      matricola: `${prefix.toUpperCase()}-M`,
      ruolo: "STUDENTE",
      emailVerificata: true,
    },
  });

  const sala = await prisma.sala.create({
    data: {
      id: `${prefix}-sala`,
      nome: `Sala ${prefix}`,
      piano: 1,
      capienzaMax: 1,
    },
  });

  const posto = await prisma.posto.create({
    data: {
      id: `${prefix}-posto`,
      numero: "A1",
      salaId: sala.id,
      coordinataX: 10,
      coordinataY: 20,
      stato: seatState,
    },
  });

  return { user, sala, posto };
}

async function createReservation(input: {
  id: string;
  userId: string;
  postoId: string;
  startOffsetMinutes: number;
  stato?: "CONFERMATA" | "SCADUTA";
}) {
  return prisma.prenotazione.create({
    data: {
      id: input.id,
      userId: input.userId,
      postoId: input.postoId,
      data: today(),
      oraInizio: timeAtOffset(input.startOffsetMinutes),
      oraFine: timeAtOffset(input.startOffsetMinutes + 60),
      stato: input.stato ?? "CONFERMATA",
    },
  });
}

beforeAll(async () => {
  process.env.DATABASE_URL = databaseUrl;
  synchronizeTestSchema();

  ({ prisma } = await import("@/lib/prisma"));
  automationService = await import("@/lib/automation-service");
  notificationsRoute = await import("@/app/api/notifiche/route");
});

beforeEach(async () => {
  await resetAutomationTestData();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("automazioni pre-modifica", () => {
  it("[PRE-AUT-001] genera il promemoria di check-in con notifica e log correnti", async () => {
    const { user, posto } = await createStudentSeat("aut001");
    const prenotazione = await createReservation({
      id: "aut001-prenotazione",
      userId: user.id,
      postoId: posto.id,
      startOffsetMinutes: 17,
    });

    const result = await automationService.sendCheckInReminders();

    expect(result.sent).toBe(1);
    await expect(
      prisma.notifica.findFirstOrThrow({ where: { userId: user.id } }),
    ).resolves.toMatchObject({
      tipo: "CHECK_IN_REMINDER",
      actionUrl: `/prenotazioni/${prenotazione.id}`,
      actionLabel: "Fai check-in",
      letta: false,
    });
    await expect(
      prisma.logEvento.findFirstOrThrow({
        where: { tipo: "AUTOMATION" },
      }),
    ).resolves.toMatchObject({
      descrizione: `Reminder check-in inviato per prenotazione ${prenotazione.id}`,
    });
  });

  it("[PRE-AUT-002] non duplica il promemoria nella seconda esecuzione giornaliera", async () => {
    const { user, posto } = await createStudentSeat("aut002");
    await createReservation({
      id: "aut002-prenotazione",
      userId: user.id,
      postoId: posto.id,
      startOffsetMinutes: 17,
    });

    const firstRun = await automationService.sendCheckInReminders();
    const secondRun = await automationService.sendCheckInReminders();

    expect(firstRun.sent).toBe(1);
    expect(secondRun.sent).toBe(0);
    await expect(
      prisma.notifica.count({
        where: { userId: user.id, tipo: "CHECK_IN_REMINDER" },
      }),
    ).resolves.toBe(1);
  });

  it("[PRE-AUT-003] trasforma una prenotazione oltre margine in NO_SHOW e libera il posto", async () => {
    const { user, posto } = await createStudentSeat("aut003", "OCCUPATO");
    const prenotazione = await createReservation({
      id: "aut003-prenotazione",
      userId: user.id,
      postoId: posto.id,
      startOffsetMinutes: -30,
    });

    const result = await automationService.releaseNoShowReservations();

    expect(result.released).toBe(1);
    await expect(
      prisma.prenotazione.findUniqueOrThrow({ where: { id: prenotazione.id } }),
    ).resolves.toMatchObject({ stato: "NO_SHOW" });
    await expect(
      prisma.posto.findUniqueOrThrow({ where: { id: posto.id } }),
    ).resolves.toMatchObject({ stato: "DISPONIBILE" });
    await expect(
      prisma.notifica.findFirstOrThrow({ where: { userId: user.id } }),
    ).resolves.toMatchObject({
      tipo: "ALERT",
      actionUrl: "/prenotazioni",
    });
    await expect(
      prisma.logEvento.findFirstOrThrow({ where: { tipo: "NO_SHOW_AUTO" } }),
    ).resolves.toMatchObject({
      dettagli: expect.objectContaining({
        prenotazioneId: prenotazione.id,
        userId: user.id,
        postoId: posto.id,
      }),
    });
  });

  it("[PRE-AUT-004] ignora SCADUTA senza produrre nuove transizioni o notifiche", async () => {
    const { user, posto } = await createStudentSeat("aut004", "OCCUPATO");
    const prenotazione = await createReservation({
      id: "aut004-prenotazione",
      userId: user.id,
      postoId: posto.id,
      startOffsetMinutes: -60,
      stato: "SCADUTA",
    });

    const result = await automationService.releaseNoShowReservations();

    expect(result.released).toBe(0);
    await expect(
      prisma.prenotazione.findUniqueOrThrow({ where: { id: prenotazione.id } }),
    ).resolves.toMatchObject({ stato: "SCADUTA" });
    await expect(
      prisma.posto.findUniqueOrThrow({ where: { id: posto.id } }),
    ).resolves.toMatchObject({ stato: "OCCUPATO" });
    await expect(prisma.notifica.count()).resolves.toBe(0);
    await expect(prisma.logEvento.count()).resolves.toBe(0);
  });
});

describe("notifiche pre-modifica", () => {
  it("[PRE-NOT-001] notifica gli utenti con preferenze simili quando un posto si libera", async () => {
    const { user, sala, posto } = await createStudentSeat("not001");
    await createReservation({
      id: "not001-storico",
      userId: user.id,
      postoId: posto.id,
      startOffsetMinutes: -120,
    });

    const result = await automationService.notifyAvailableSeat({
      id: "not001-liberata",
      data: today(),
      oraInizio: timeAtOffset(60),
      oraFine: timeAtOffset(120),
      posto: {
        id: posto.id,
        numero: 1,
        sala: { id: sala.id, nome: sala.nome },
        presaElettrica: false,
        vistaFinestra: false,
        accessibile: false,
      },
    });

    expect(result.notified).toBe(1);
    await expect(
      prisma.notifica.findFirstOrThrow({ where: { userId: user.id } }),
    ).resolves.toMatchObject({
      tipo: "INFO",
      actionUrl: "/prenota",
      letta: false,
    });
  });

  it("[PRE-NOT-002] mantiene il contratto GET con filtro, paginazione e conteggi", async () => {
    const { user } = await createStudentSeat("not002");
    await prisma.notifica.createMany({
      data: [
        {
          id: "not002-unread",
          userId: user.id,
          tipo: "SISTEMA",
          titolo: "Non letta",
          messaggio: "Messaggio non letto",
          letta: false,
        },
        {
          id: "not002-read",
          userId: user.id,
          tipo: "SISTEMA",
          titolo: "Letta",
          messaggio: "Messaggio letto",
          letta: true,
          lettaAt: new Date(),
        },
      ],
    });

    const request = new NextRequest(
      `http://localhost/api/notifiche?userId=${user.id}&letta=false&limit=1&offset=0`,
    );
    const response = await notificationsRoute.GET(request);
    const payload = (await response.json()) as {
      success: boolean;
      data: Array<{ id: string; letta: boolean }>;
      count: number;
      totale: number;
      nonLette: number;
    };

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      success: true,
      count: 1,
      totale: 2,
      nonLette: 1,
    });
    expect(payload.data).toEqual([
      expect.objectContaining({ id: "not002-unread", letta: false }),
    ]);
  });
});
