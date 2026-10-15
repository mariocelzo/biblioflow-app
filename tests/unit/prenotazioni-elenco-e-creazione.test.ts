// ============================================================================
// Test di /api/prenotazioni — filtri dell'elenco e rami della creazione
// ============================================================================
// COSA: GET con filtri per posto, stato e date; POST con campi mancanti,
//       errore di dominio, errore imprevisto e percorso riuscito.
// PERCHE': i filtri per data non erano mai stati eseguiti e una data non
//       valida produceva un 500 (D-09: ora 422). Il percorso riuscito della
//       POST fissa anche la promessa principale di CR01: l'intestatario e'
//       sempre l'utente di sessione, qualunque `userId` arrivi dal client.

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class AuthError extends Error {
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
    AuthError,
    requireUser: vi.fn(),
    creaPrenotazioneAtomica: vi.fn(),
    prisma: {
      prenotazione: { findMany: vi.fn() },
      posto: { findUnique: vi.fn() },
      logEvento: { create: vi.fn() },
      notifica: { create: vi.fn() },
    },
  };
});

vi.mock("@/lib/auth", () => ({ AuthError: mocks.AuthError, requireUser: mocks.requireUser }));
vi.mock("@/lib/prisma", () => ({ default: mocks.prisma, prisma: mocks.prisma }));
vi.mock("@/lib/rate-limit", () => ({
  readApiRateLimiter: vi.fn(async () => null),
  bookingRateLimiter: vi.fn(async () => null),
}));
vi.mock("@/lib/prenotazioni-service", async () => {
  const reale = await vi.importActual<typeof import("@/lib/prenotazioni-service")>("@/lib/prenotazioni-service");
  return { ...reale, creaPrenotazioneAtomica: mocks.creaPrenotazioneAtomica };
});

const { ConflittoDisponibilita } = await import("@/lib/prenotazioni-errors");
const route = await import("@/app/api/prenotazioni/route");

const studente = { id: "studente-1", ruolo: "STUDENTE" };

const get = (query: string) => route.GET(new NextRequest(`http://localhost/api/prenotazioni${query}`));
const post = (corpo: unknown) =>
  route.POST(
    new NextRequest("http://localhost/api/prenotazioni", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(corpo),
    }),
  );

const richiestaValida = {
  userId: "qualcun-altro",
  postoId: "posto-a1",
  data: "2030-01-15",
  oraInizio: "09:00",
  oraFine: "11:00",
  marginePendolare: true,
  note: "Vicino alla finestra",
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireUser.mockResolvedValue(studente);
  mocks.prisma.prenotazione.findMany.mockResolvedValue([]);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("GET /api/prenotazioni — filtri", () => {
  it("[TC-PREN-GET-001] applica posto, stato e giorno, sempre ristretti all'utente di sessione", async () => {
    await get("?postoId=posto-a1&stato=CONFERMATA&data=2030-01-15&userId=qualcun-altro");
    expect(mocks.prisma.prenotazione.findMany.mock.calls[0][0].where).toEqual({
      userId: "studente-1",
      postoId: "posto-a1",
      stato: "CONFERMATA",
      data: { gte: new Date("2030-01-15T00:00:00.000Z"), lt: new Date("2030-01-16T00:00:00.000Z") },
    });
  });

  it("[TC-PREN-GET-002] intervallo dataInizio/dataFine, anche aperto da un lato", async () => {
    await get("?dataInizio=2030-01-01&dataFine=2030-01-31");
    expect(mocks.prisma.prenotazione.findMany.mock.calls[0][0].where.data).toEqual({
      gte: new Date("2030-01-01"),
      lte: new Date("2030-01-31"),
    });
    await get("?dataFine=2030-01-31");
    expect(mocks.prisma.prenotazione.findMany.mock.calls[1][0].where.data).toEqual({ lte: new Date("2030-01-31") });
  });

  it.each(["?data=domani", "?data=2030-13-45", "?dataInizio=ieri", "?dataFine=boh"])(
    "[TC-PREN-GET-003] D-09: %s risponde 422 senza interrogare il database",
    async (query) => {
      const risposta = await get(query);
      expect(risposta.status).toBe(422);
      expect(mocks.prisma.prenotazione.findMany).not.toHaveBeenCalled();
    },
  );

  it("[TC-PREN-GET-004] un errore del database diventa 500 generico", async () => {
    mocks.prisma.prenotazione.findMany.mockRejectedValue(new Error("boom"));
    const risposta = await get("");
    expect(risposta.status).toBe(500);
    expect(JSON.stringify(await risposta.json())).not.toContain("boom");
  });
});

describe("POST /api/prenotazioni", () => {
  it("[TC-PREN-POST-001] campi obbligatori mancanti: 422 senza proporre la coda", async () => {
    const risposta = await post({ postoId: "posto-a1" });
    expect(risposta.status).toBe(422);
    await expect(risposta.json()).resolves.toMatchObject({ code: "CAMPI_OBBLIGATORI_MANCANTI", suggerisciCoda: false });
    expect(mocks.creaPrenotazioneAtomica).not.toHaveBeenCalled();
  });

  it("[TC-PREN-POST-002] crea per l'utente di sessione, ignora lo userId del client, registra log e notifica", async () => {
    mocks.creaPrenotazioneAtomica.mockResolvedValue({ id: "pren-1", postoId: "posto-a1", stato: "CONFERMATA" });
    mocks.prisma.posto.findUnique.mockResolvedValue({ numero: "A1" });

    const risposta = await post(richiestaValida);
    expect(risposta.status).toBe(201);

    const [input] = mocks.creaPrenotazioneAtomica.mock.calls[0];
    expect(input).toEqual({
      userId: "studente-1",
      postoId: "posto-a1",
      data: "2030-01-15",
      oraInizio: "09:00",
      oraFine: "11:00",
      marginePendolare: true,
      note: "Vicino alla finestra",
    });
    expect(mocks.prisma.logEvento.create.mock.calls[0][0].data).toMatchObject({
      tipo: "PRENOTAZIONE_CREATA",
      userId: "studente-1",
      prenotazioneId: "pren-1",
      descrizione: "Prenotazione creata per posto A1",
    });
    expect(mocks.prisma.notifica.create.mock.calls[0][0].data).toMatchObject({ userId: "studente-1", tipo: "PRENOTAZIONE" });
  });

  it("[TC-PREN-POST-003] il conflitto di dominio arriva al client come 409 con proposta di coda", async () => {
    mocks.creaPrenotazioneAtomica.mockRejectedValue(new ConflittoDisponibilita());
    const risposta = await post(richiestaValida);
    expect(risposta.status).toBe(409);
    await expect(risposta.json()).resolves.toMatchObject({ success: false, suggerisciCoda: true });
  });

  it("[TC-PREN-POST-004] senza sessione 401; errore imprevisto 500 generico", async () => {
    mocks.requireUser.mockRejectedValueOnce(new mocks.AuthError(401, "NON_AUTENTICATO", "Accesso richiesto"));
    expect((await post(richiestaValida)).status).toBe(401);

    mocks.creaPrenotazioneAtomica.mockRejectedValueOnce(new Error("pool esaurito"));
    const errore = await post(richiestaValida);
    expect(errore.status).toBe(500);
    expect(JSON.stringify(await errore.json())).not.toContain("pool");
  });
});
