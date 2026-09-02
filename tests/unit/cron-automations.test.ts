import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  locked: false,
  info: vi.fn(),
  queryRaw: vi.fn(),
  transaction: vi.fn(),
  runAllAutomations: vi.fn(),
}));

vi.mock("@/lib/env", () => ({
  env: { CRON_SECRET: "cron-test-secret" },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { $transaction: mocks.transaction },
}));

vi.mock("@/lib/automation-service", () => ({
  runAllAutomations: mocks.runAllAutomations,
}));

import { GET } from "@/app/api/cron/automations/route";

function request(token = "cron-test-secret") {
  return new NextRequest("http://localhost/api/cron/automations", {
    headers: { authorization: `Bearer ${token}` },
  });
}

function automationResult() {
  return {
    timestamp: new Date("2030-01-15T10:00:00.000Z"),
    reminders: { sent: 0 },
    loanAlerts: { sent: 0 },
    noShows: { released: 1, promoted: 1 },
    errors: [] as string[],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "info").mockImplementation(mocks.info);
  mocks.locked = false;
  mocks.queryRaw.mockImplementation(async () => {
    if (mocks.locked) return [{ acquired: false }];
    mocks.locked = true;
    return [{ acquired: true }];
  });
  mocks.transaction.mockImplementation(async (callback) => {
    try {
      return await callback({ $queryRaw: mocks.queryRaw });
    } finally {
      mocks.locked = false;
    }
  });
  mocks.runAllAutomations.mockResolvedValue(automationResult());
});

describe("idempotenza cron automazioni (CA-04)", () => {
  it("[TC-BIB41-001] due run sovrapposti eseguono le automazioni una sola volta", async () => {
    let completeFirstRun!: () => void;
    mocks.runAllAutomations.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          completeFirstRun = () => resolve(automationResult());
        }),
    );

    const firstResponsePromise = GET(request());
    await vi.waitFor(() => expect(mocks.runAllAutomations).toHaveBeenCalledOnce());

    const secondResponse = await GET(request());
    completeFirstRun();
    const firstResponse = await firstResponsePromise;

    expect(firstResponse.status).toBe(200);
    expect(await firstResponse.json()).toMatchObject({
      success: true,
      skipped: false,
    });
    expect(await secondResponse.json()).toMatchObject({
      success: true,
      skipped: true,
      message: "Automazioni già in esecuzione",
    });
    expect(mocks.runAllAutomations).toHaveBeenCalledOnce();
    expect(mocks.info).toHaveBeenCalledWith(
      "Cron automazioni saltato: esecuzione gia' attiva",
      expect.objectContaining({ runId: expect.any(String) }),
    );
    expect(mocks.info).toHaveBeenCalledWith(
      "Cron automazioni completato",
      expect.objectContaining({
        runId: expect.any(String),
        noShows: 1,
        promotions: 1,
      }),
    );
  });

  it("[TC-BIB41-002] dopo il rilascio del lock un nuovo run controlla di nuovo lo stato", async () => {
    const firstResponse = await GET(request());
    const secondResponse = await GET(request());

    expect(await firstResponse.json()).toMatchObject({ skipped: false });
    expect(await secondResponse.json()).toMatchObject({ skipped: false });
    expect(mocks.runAllAutomations).toHaveBeenCalledTimes(2);
  });

  it("[TC-BIB41-003] mantiene protetto il cron senza aprire transazioni", async () => {
    const response = await GET(request("token-errato"));

    expect(response.status).toBe(401);
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.runAllAutomations).not.toHaveBeenCalled();
  });
});
