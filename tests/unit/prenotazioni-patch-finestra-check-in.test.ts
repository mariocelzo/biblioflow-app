/**
 * Test di integrita' dei dati per `PATCH /api/prenotazioni/[id]` (azione "check-in").
 *
 * COSA verifica: la PATCH applica la STESSA finestra temporale
 * [inizio - 15 minuti, inizio] gia' imposta dall'endpoint dedicato
 * `POST /api/prenotazioni/[id]/check-in`, e ignora qualunque timestamp
 * proveniente dal client (coerenza con l'hardening M-2).
 *
 * PERCHE': la PATCH controllava solo `stato === "CONFERMATA"`, senza alcun
 * vincolo temporale. Uno studente poteva prenotare per venerdi' e fare check-in
 * il lunedi': il posto passava a OCCUPATO con giorni di anticipo, usciva dal
 * bacino del rilascio automatico per no-show e restava bloccato per tutti gli
 * altri utenti. La stessa operazione fisica aveva due percorsi con regole
 * diverse; questo test blinda il percorso permissivo.
 *
 * L'orologio del server e' congelato con i fake timers di vitest.
 *
 * NOTA SUGLI ORARI: `oraInizio` (fixture qui sotto) salva le CIFRE di Roma
 * ("09:00"), non un istante UTC (vedi src/lib/prenotazioni-regole.ts,
 * `valutaFinestraCheckIn`). Il 14 giugno 2030 e' in ora legale (CEST, Roma =
 * UTC+2): la finestra "reale" [08:45, 09:00] di Roma corrisponde quindi a
 * [06:45, 07:00] UTC.
 */
import { NextRequest } from "next/server";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class MockAuthError extends Error {
    constructor(
      public readonly status: 401 | 403 | 404,
      public readonly code: string,
      message: string,
    ) {
      super(message);
      this.name = "AuthError";
    }
  }
  return {
    MockAuthError,
    requireUser: vi.fn(),
    assertOwnership: vi.fn(),
    prisma: {
      prenotazione: { findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
      posto: { update: vi.fn() },
      logEvento: { create: vi.fn(), deleteMany: vi.fn() },
    },
  };
});

vi.mock("@/lib/auth", () => ({
  AuthError: mocks.MockAuthError,
  requireUser: mocks.requireUser,
  assertOwnership: mocks.assertOwnership,
}));
vi.mock("@/lib/prisma", () => ({ default: mocks.prisma, prisma: mocks.prisma }));
// Il rate limiting sulle route critiche non è oggetto di questo file: viene
// mockato per non far scattare 429 con le ripetute chiamate a route.PATCH
// nei test qui sotto (stesso pattern di prestiti-stato-rinnovato.test.ts).
vi.mock("@/lib/rate-limit", () => ({
  criticalApiRateLimiter: vi.fn(async () => null),
}));

type Route = typeof import("@/app/api/prenotazioni/[id]/route");
let route: Route;

const user = { id: "studente-1", ruolo: "STUDENTE" as const };

// Prenotazione per venerdi' 2030-06-14, slot 09:00-11:00 (Date @db.Date / @db.Time).
// `marginePendolare: false`: finestra NORMALE. Il margine pendolare (30 min)
// e' coperto a parte piu' sotto (describe "Margine Pendolare").
const prenotazione = {
  id: "pren-1",
  userId: user.id,
  postoId: "posto-1",
  data: new Date("2030-06-14T00:00:00.000Z"),
  oraInizio: new Date("1970-01-01T09:00:00.000Z"),
  oraFine: new Date("1970-01-01T11:00:00.000Z"),
  stato: "CONFERMATA",
  marginePendolare: false,
  posto: { id: "posto-1", numero: "A1" },
};

function request(body: unknown) {
  return new NextRequest("http://localhost/api/prenotazioni/pren-1", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
const params = { params: Promise.resolve({ id: "pren-1" }) };

beforeAll(async () => {
  route = await import("@/app/api/prenotazioni/[id]/route");
});

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireUser.mockResolvedValue(user);
  mocks.prisma.prenotazione.findUnique.mockResolvedValue(prenotazione);
  mocks.prisma.prenotazione.update.mockImplementation(
    async ({ data }: { data: Record<string, unknown> }) => ({
      ...prenotazione,
      ...data,
    }),
  );
  mocks.prisma.posto.update.mockResolvedValue({ ...prenotazione.posto, stato: "OCCUPATO" });
  mocks.prisma.logEvento.create.mockResolvedValue({ id: "log-1" });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Integrita' dati - finestra di check-in sulla PATCH prenotazione", () => {
  it("[TC-INT-CHECKIN-001] check-in con giorni di anticipo respinto: il posto NON viene occupato", async () => {
    // Scenario del difetto: prenotazione per venerdi' 14, check-in il lunedi' 10.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2030-06-10T09:00:00.000Z"));

    const response = await route.PATCH(request({ azione: "check-in" }), params);

    expect(response.status).toBe(400);
    // Il punto critico: il posto non deve MAI passare a OCCUPATO fuori finestra,
    // altrimenti resta bloccato per gli altri utenti per giorni.
    expect(mocks.prisma.posto.update).not.toHaveBeenCalled();
    expect(mocks.prisma.prenotazione.update).not.toHaveBeenCalled();
  });

  it("[TC-INT-CHECKIN-002] check-in dopo l'inizio dello slot respinto (periodo scaduto)", async () => {
    // 09:30Z e' comunque ben oltre la chiusura reale (07:00Z = 09:00 Roma):
    // la finestra e' chiusa, come nell'endpoint dedicato.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2030-06-14T09:30:00.000Z"));

    const response = await route.PATCH(request({ azione: "check-in" }), params);

    expect(response.status).toBe(400);
    expect(mocks.prisma.posto.update).not.toHaveBeenCalled();
    expect(mocks.prisma.prenotazione.update).not.toHaveBeenCalled();
  });

  it("[TC-INT-CHECKIN-003] check-in dentro la finestra dei 15 minuti: consentito", async () => {
    // 06:50Z = 08:50 di Roma (CEST, +2h), dentro la finestra reale
    // [08:45, 09:00] di Roma: il flusso legittimo non deve regredire.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2030-06-14T06:50:00.000Z"));

    const response = await route.PATCH(request({ azione: "check-in" }), params);

    expect(response.status).toBe(200);
    const arg = mocks.prisma.prenotazione.update.mock.calls[0][0] as {
      data: { stato: string };
    };
    expect(arg.data.stato).toBe("CHECK_IN");
    expect(mocks.prisma.posto.update).toHaveBeenCalledWith({
      where: { id: "posto-1" },
      data: { stato: "OCCUPATO" },
    });
  });

  it("[TC-INT-CHECKIN-004] un timestamp fasullo nel body non apre la finestra (coerenza con M-2)", async () => {
    // Ora server fuori finestra; il client prova a barare dichiarando 08:50.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2030-06-10T09:00:00.000Z"));

    const response = await route.PATCH(
      request({ azione: "check-in", timestamp: "2030-06-14T08:50:00.000Z" }),
      params,
    );

    expect(response.status).toBe(400);
    expect(mocks.prisma.posto.update).not.toHaveBeenCalled();
  });
});

describe("Margine Pendolare · la PATCH check-in estende la finestra a 30 minuti quando marginePendolare e' vero", () => {
  it("[TC-MP-PATCH-001] marginePendolare:true — +20 minuti dall'inizio: consentito (oltre i 15 normali)", async () => {
    mocks.prisma.prenotazione.findUnique.mockResolvedValue({
      ...prenotazione,
      marginePendolare: true,
    });
    // 07:20Z = 09:20 di Roma → +20 minuti dall'inizio (09:00).
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2030-06-14T07:20:00.000Z"));

    const response = await route.PATCH(request({ azione: "check-in" }), params);

    expect(response.status).toBe(200);
    expect(mocks.prisma.posto.update).toHaveBeenCalledWith({
      where: { id: "posto-1" },
      data: { stato: "OCCUPATO" },
    });
  });

  it("[TC-MP-PATCH-002] marginePendolare:false — stessi +20 minuti: scaduto (la finestra normale è già chiusa)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2030-06-14T07:20:00.000Z"));

    const response = await route.PATCH(request({ azione: "check-in" }), params);

    expect(response.status).toBe(400);
    expect(mocks.prisma.posto.update).not.toHaveBeenCalled();
  });
});
