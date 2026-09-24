/**
 * Test per il difetto logevento-prenotazione-non-collegato, limitatamente al
 * case ANNULLA_PRENOTAZIONI_SENZA_CHECKIN di POST /api/admin/anomalie.
 *
 * PRIMA: `prisma.logEvento.create` scriveva `prenotazioneId` SOLO dentro il
 * JSON `dettagli`, mai come colonna relazionale (`LogEvento.prenotazioneId`).
 * GET /api/prenotazioni/[id] usa quella colonna per popolare `eventi`: un
 * annullamento per mancato check-in — pur avvenuto e notificato allo
 * studente — risultava quindi invisibile nella cronologia della sua stessa
 * prenotazione.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  prisma: {
    prenotazione: { findMany: vi.fn(), update: vi.fn() },
    posto: { update: vi.fn() },
    logEvento: { create: vi.fn() },
    notifica: { create: vi.fn() },
  },
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/prisma", () => ({ default: mocks.prisma }));

type AdminAnomalieRoute = typeof import("@/app/api/admin/anomalie/route");
let route: AdminAnomalieRoute;

const bibliotecario = {
  id: "bibliotecario-1",
  email: "bibliotecario@biblioflow.test",
  ruolo: "BIBLIOTECARIO",
};

const prenotazioneScaduta = {
  id: "pren-noshow-1",
  userId: "studente-1",
  postoId: "posto-1",
  posto: { sala: { nome: "Sala Lettura" }, numero: "A1" },
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
  mocks.prisma.prenotazione.findMany.mockResolvedValue([prenotazioneScaduta]);
  mocks.prisma.prenotazione.update.mockResolvedValue({});
  mocks.prisma.posto.update.mockResolvedValue({});
  mocks.prisma.logEvento.create.mockResolvedValue({ id: "log-1" });
  mocks.prisma.notifica.create.mockResolvedValue({ id: "notifica-1" });
});

describe("ANNULLA_PRENOTAZIONI_SENZA_CHECKIN · collega prenotazioneId al LogEvento", () => {
  it("[TC-ANOM-LOGEVT-001] LogEvento.prenotazioneId è valorizzato come colonna relazionale, non solo in dettagli", async () => {
    const response = await route.POST(
      request({ azione: "ANNULLA_PRENOTAZIONI_SENZA_CHECKIN" }),
    );

    expect(response.status).toBe(200);
    // Una create e' quella del NO_SHOW per la prenotazione, l'altra e' il
    // log generico di fine azione: qui interessa quella per la prenotazione.
    const chiamataNoShow = mocks.prisma.logEvento.create.mock.calls.find(
      (call) => call[0].data.tipo === "NO_SHOW",
    );

    expect(chiamataNoShow).toBeDefined();
    expect(chiamataNoShow![0].data.prenotazioneId).toBe(prenotazioneScaduta.id);
  });
});
