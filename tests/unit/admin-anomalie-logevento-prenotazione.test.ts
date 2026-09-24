/**
 * Test per il case ANNULLA_PRENOTAZIONI_SENZA_CHECKIN di POST /api/admin/anomalie.
 *
 * STORIA: questo file verificava in origine il difetto
 * "logevento-prenotazione-non-collegato" (`LogEvento.prenotazioneId` scritto
 * solo dentro `dettagli`, mai come colonna relazionale — invisibile nella
 * cronologia di GET /api/prenotazioni/[id]). Quella correzione vive ancora,
 * ma non piu' qui: la vecchia query duplicata di questo case aveva ANCHE lo
 * stesso difetto di fuso/tipo gia' risolto altrove in
 * `releaseNoShowReservations` (confronto fra una colonna `@db.Time` e un
 * `Date` assoluto, "oggi" calcolato nel fuso del server invece che in quello
 * della biblioteca) — corretto DELEGANDO alla stessa funzione di dominio
 * gia' corretta e gia' testata che il cron invoca ogni 5 minuti (vedi
 * `src/lib/automation-service.ts`), non riscrivendo la query qui.
 *
 * La regressione "prenotazioneId come colonna relazionale" resta blindata
 * alla fonte: `tests/unit/automation-service.test.ts`
 * (TC-BIB40-001, `releaseNoShowReservations`). Qui si verifica solo che la
 * route deleghi per davvero e relayi correttamente il risultato.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  releaseNoShowReservations: vi.fn(),
  prisma: {
    prenotazione: { findMany: vi.fn(), update: vi.fn() },
    posto: { update: vi.fn() },
    logEvento: { create: vi.fn() },
    notifica: { create: vi.fn() },
  },
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/prisma", () => ({ default: mocks.prisma }));
vi.mock("@/lib/automation-service", () => ({
  releaseNoShowReservations: mocks.releaseNoShowReservations,
}));

type AdminAnomalieRoute = typeof import("@/app/api/admin/anomalie/route");
let route: AdminAnomalieRoute;

const bibliotecario = {
  id: "bibliotecario-1",
  email: "bibliotecario@biblioflow.test",
  ruolo: "BIBLIOTECARIO",
};

function request(body: object) {
  return new NextRequest("http://localhost/api/admin/anomalie", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(async () => {
  vi.resetAllMocks();
  route = await import("@/app/api/admin/anomalie/route");
  mocks.auth.mockResolvedValue({ user: bibliotecario });
  mocks.releaseNoShowReservations.mockResolvedValue({
    released: 1,
    promoted: 0,
    message: "1 posti liberati per no-show, 0 promozioni dalla lista d'attesa",
  });
});

describe("ANNULLA_PRENOTAZIONI_SENZA_CHECKIN · delega a releaseNoShowReservations", () => {
  it("[TC-ANOM-LOGEVT-001] invoca la STESSA funzione di dominio del cron (non una query duplicata)", async () => {
    const response = await route.POST(
      request({ azione: "ANNULLA_PRENOTAZIONI_SENZA_CHECKIN" }),
    );

    expect(response.status).toBe(200);
    expect(mocks.releaseNoShowReservations).toHaveBeenCalledTimes(1);
    // Nessuna query duplicata sulla prenotazione: la route non tocca piu'
    // `prisma.prenotazione.findMany` per questo case.
    expect(mocks.prisma.prenotazione.findMany).not.toHaveBeenCalled();
  });

  it("[TC-ANOM-LOGEVT-002] relaya il conteggio dei rilasci nella risposta", async () => {
    mocks.releaseNoShowReservations.mockResolvedValue({
      released: 3,
      promoted: 1,
      message: "3 posti liberati per no-show, 1 promozioni dalla lista d'attesa",
    });

    const response = await route.POST(
      request({ azione: "ANNULLA_PRENOTAZIONI_SENZA_CHECKIN" }),
    );
    const data = await response.json();

    expect(data).toMatchObject({
      success: true,
      count: 3,
      message: expect.stringContaining("3"),
    });
  });

  it("[TC-ANOM-LOGEVT-003] nessun rilascio: risposta coerente con conteggio zero", async () => {
    mocks.releaseNoShowReservations.mockResolvedValue({
      released: 0,
      promoted: 0,
      message: "0 posti liberati per no-show, 0 promozioni dalla lista d'attesa",
    });

    const response = await route.POST(
      request({ azione: "ANNULLA_PRENOTAZIONI_SENZA_CHECKIN" }),
    );
    const data = await response.json();

    expect(data).toMatchObject({ success: true, count: 0 });
  });
});
