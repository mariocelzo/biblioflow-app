/**
 * Test unitari — difetto "cancellazione-titolare-non-promuove-coda".
 *
 * COSA: quando il titolare cancella la propria prenotazione (DELETE
 * /api/prenotazioni/[id], o PATCH con azione "cancella"), se qualcuno e'
 * primo in lista d'attesa per lo stesso posto/fascia deve essere promosso
 * SUBITO — esattamente come gia' avviene per il rilascio automatico da
 * no-show (`releaseNoShowReservations` in src/lib/automation-service.ts).
 *
 * PERCHE' ERA ROTTO: sia la DELETE sia il case "cancella" della PATCH si
 * limitavano a marcare CANCELLATA e (se era CHECK_IN) liberare il posto,
 * senza mai invocare `processaCodaPerPosto`: la promozione avveniva SOLO per
 * il rilascio automatico da no-show, mai per la cancellazione volontaria.
 *
 * Strategia: si mocka `@/lib/automation-service` (processaCodaPerPosto,
 * notificaEventoCoda) — la vera promozione (`promuoviPrimoInCoda`, in
 * src/lib/prenotazioni-service.ts) e' testata a parte, sia unitariamente sia
 * dagli integration test della coda; qui si verifica solo IL CONTRATTO della
 * route: che `promuoviCodaDopoCancellazione` (src/app/api/prenotazioni/[id]/route.ts)
 * chiami l'helper con lo slot giusto, DOPO che la prenotazione risulta gia'
 * CANCELLATA a DB, e solo per l'azione di cancellazione (non per check-in/out).
 */
import { NextRequest } from "next/server";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

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
      prenotazione: { findUnique: vi.fn(), update: vi.fn() },
      posto: { update: vi.fn() },
      logEvento: { create: vi.fn() },
    },
    processaCodaPerPosto: vi.fn(),
    notificaEventoCoda: vi.fn(),
  };
});

vi.mock("@/lib/auth", () => ({
  AuthError: mocks.MockAuthError,
  requireUser: mocks.requireUser,
  assertOwnership: mocks.assertOwnership,
}));
vi.mock("@/lib/prisma", () => ({ default: mocks.prisma, prisma: mocks.prisma }));
vi.mock("@/lib/rate-limit", () => ({
  criticalApiRateLimiter: vi.fn(async () => null),
}));
vi.mock("@/lib/automation-service", () => ({
  processaCodaPerPosto: mocks.processaCodaPerPosto,
  notificaEventoCoda: mocks.notificaEventoCoda,
}));

type Route = typeof import("@/app/api/prenotazioni/[id]/route");
let route: Route;

const user = { id: "titolare-1", ruolo: "STUDENTE" as const };

function prenotazioneConStato(stato: string) {
  return {
    id: "pren-1",
    userId: user.id,
    postoId: "posto-1",
    data: new Date("2030-06-14T00:00:00.000Z"),
    oraInizio: new Date("1970-01-01T09:00:00.000Z"),
    oraFine: new Date("1970-01-01T11:00:00.000Z"),
    stato,
    posto: { id: "posto-1", numero: "A1", sala: { nome: "Sala Studio" } },
  };
}

const slotAtteso = {
  postoId: "posto-1",
  data: new Date("2030-06-14T00:00:00.000Z"),
  oraInizio: new Date("1970-01-01T09:00:00.000Z"),
  oraFine: new Date("1970-01-01T11:00:00.000Z"),
};

function requestDelete() {
  return new NextRequest("http://localhost/api/prenotazioni/pren-1", { method: "DELETE" });
}
function requestPatch(body: unknown) {
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
  mocks.prisma.prenotazione.findUnique.mockResolvedValue(prenotazioneConStato("CONFERMATA"));
  mocks.prisma.prenotazione.update.mockImplementation(
    async ({ data }: { data: Record<string, unknown> }) => ({
      ...prenotazioneConStato("CONFERMATA"),
      ...data,
    }),
  );
  mocks.prisma.posto.update.mockResolvedValue({ id: "posto-1", stato: "DISPONIBILE" });
  mocks.prisma.logEvento.create.mockResolvedValue({ id: "log-1" });
  mocks.processaCodaPerPosto.mockResolvedValue({ promossa: false });
  mocks.notificaEventoCoda.mockResolvedValue({ notificaCreata: true });
});

describe("DELETE /api/prenotazioni/[id] — promuove la coda dopo la cancellazione", () => {
  it("[TC-CODA-DEL-001] invoca processaCodaPerPosto con lo slot esatto della prenotazione cancellata", async () => {
    const response = await route.DELETE(requestDelete(), params);

    expect(response.status).toBe(200);
    expect(mocks.processaCodaPerPosto).toHaveBeenCalledTimes(1);
    expect(mocks.processaCodaPerPosto).toHaveBeenCalledWith(slotAtteso);
  });

  it("[TC-CODA-DEL-002] la promozione avviene DOPO che la prenotazione risulta gia' CANCELLATA a DB", async () => {
    await route.DELETE(requestDelete(), params);

    const ordinePrenotazioneUpdate = mocks.prisma.prenotazione.update.mock.invocationCallOrder[0];
    const ordineProcessaCoda = mocks.processaCodaPerPosto.mock.invocationCallOrder[0];
    expect(ordinePrenotazioneUpdate).toBeLessThan(ordineProcessaCoda);
  });

  it("[TC-CODA-DEL-003] se qualcuno viene promosso, invia la notifica CODA_PROMOZIONE con posto/sala corretti", async () => {
    mocks.processaCodaPerPosto.mockResolvedValue({
      promossa: true,
      prenotazioneId: "pren-coda-1",
      userId: "utente-promosso",
    });

    await route.DELETE(requestDelete(), params);

    expect(mocks.notificaEventoCoda).toHaveBeenCalledWith({
      userId: "utente-promosso",
      tipo: "CODA_PROMOZIONE",
      posto: { numero: "A1", salaNome: "Sala Studio" },
      prenotazioneId: "pren-coda-1",
    });
  });

  it("[TC-CODA-DEL-004] coda vuota (nessuna promozione): nessuna notifica CODA_PROMOZIONE", async () => {
    await route.DELETE(requestDelete(), params);

    expect(mocks.notificaEventoCoda).not.toHaveBeenCalled();
  });

  it("[TC-CODA-DEL-005] una prenotazione gia' conclusa non promuove nulla (la cancellazione stessa e' rifiutata)", async () => {
    mocks.prisma.prenotazione.findUnique.mockResolvedValue(prenotazioneConStato("COMPLETATA"));

    const response = await route.DELETE(requestDelete(), params);

    expect(response.status).toBe(400);
    expect(mocks.processaCodaPerPosto).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/prenotazioni/[id] azione:\"cancella\" — stesso comportamento della DELETE", () => {
  it("[TC-CODA-PATCH-001] invoca processaCodaPerPosto con lo slot esatto", async () => {
    const response = await route.PATCH(requestPatch({ azione: "cancella" }), params);

    expect(response.status).toBe(200);
    expect(mocks.processaCodaPerPosto).toHaveBeenCalledTimes(1);
    expect(mocks.processaCodaPerPosto).toHaveBeenCalledWith(slotAtteso);
  });

  it("[TC-CODA-PATCH-002] se promosso, invia la notifica CODA_PROMOZIONE", async () => {
    mocks.processaCodaPerPosto.mockResolvedValue({
      promossa: true,
      prenotazioneId: "pren-coda-2",
      userId: "utente-promosso-2",
    });

    await route.PATCH(requestPatch({ azione: "cancella" }), params);

    expect(mocks.notificaEventoCoda).toHaveBeenCalledWith({
      userId: "utente-promosso-2",
      tipo: "CODA_PROMOZIONE",
      posto: { numero: "A1", salaNome: "Sala Studio" },
      prenotazioneId: "pren-coda-2",
    });
  });

  it("[TC-CODA-PATCH-003] azione \"check-in\" NON promuove la coda (solo la cancellazione lo fa)", async () => {
    // Ora server dentro la finestra di check-in della fixture (09:00 Roma,
    // giugno = CEST +2h → reale 07:00 UTC; finestra [06:45,07:00] UTC).
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2030-06-14T06:50:00.000Z"));

    const response = await route.PATCH(requestPatch({ azione: "check-in" }), params);

    expect(response.status).toBe(200);
    expect(mocks.processaCodaPerPosto).not.toHaveBeenCalled();
    expect(mocks.notificaEventoCoda).not.toHaveBeenCalled();

    vi.useRealTimers();
  });

  it("[TC-CODA-PATCH-004] azione \"check-out\" NON promuove la coda", async () => {
    mocks.prisma.prenotazione.findUnique.mockResolvedValue(prenotazioneConStato("CHECK_IN"));

    const response = await route.PATCH(requestPatch({ azione: "check-out" }), params);

    expect(response.status).toBe(200);
    expect(mocks.processaCodaPerPosto).not.toHaveBeenCalled();
  });
});
