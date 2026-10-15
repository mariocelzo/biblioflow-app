// ============================================================================
// Test delle route di consultazione staff su posti e utenti
// ============================================================================
// COSA: PATCH/GET `/api/admin/posti/[id]`, GET `/api/admin/posti/[id]/dettagli`,
//       GET `/api/admin/utenti/[id]`, GET `/api/admin/utenti/[id]/profilo` e
//       GET `/api/admin/utenti/[id]/storico`.
// PERCHE': erano a copertura bassa o nulla e due di esse contenevano difetti:
//   - D-02: il dettaglio posto cercava la "prenotazione attuale" con la data
//     del server (UTC su Vercel). Tra mezzanotte e le 02:00 di Roma la colonna
//     `@db.Date` non coincideva e la prenotazione in corso spariva.
//   - D-03: i contatori no-show contavano solo `NO_SHOW` e ignoravano i
//     rilasci automatici del cron (`NO_SHOW_AUTO`).

import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  rateLimit: vi.fn(),
  prisma: {
    posto: { findUnique: vi.fn(), update: vi.fn() },
    prenotazione: { count: vi.fn(), findMany: vi.fn(), findFirst: vi.fn() },
    prestito: { count: vi.fn() },
    logEvento: { create: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    user: { findUnique: vi.fn() },
  },
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/prisma", () => ({ default: mocks.prisma, prisma: mocks.prisma }));
vi.mock("@/lib/rate-limit", () => ({ staffCriticalApiRateLimiter: mocks.rateLimit }));

const postoRoute = await import("@/app/api/admin/posti/[id]/route");
const dettagliRoute = await import("@/app/api/admin/posti/[id]/dettagli/route");
const utenteRoute = await import("@/app/api/admin/utenti/[id]/route");
const profiloRoute = await import("@/app/api/admin/utenti/[id]/profilo/route");
const storicoRoute = await import("@/app/api/admin/utenti/[id]/storico/route");

const bibliotecario = { id: "staff-1", ruolo: "BIBLIOTECARIO" };
const studente = { id: "studente-1", ruolo: "STUDENTE" };
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const get = (url: string) => new NextRequest(url);
const patch = (url: string, corpo: unknown) =>
  new NextRequest(url, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(corpo),
  });

const postoA1 = {
  id: "posto-a1",
  numero: "A1",
  stato: "DISPONIBILE",
  sala: { id: "sala-1", nome: "Sala Studio Nord" },
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ user: bibliotecario });
  mocks.rateLimit.mockResolvedValue(null);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("autorizzazione comune", () => {
  const chiamate: Array<[string, () => Promise<Response>]> = [
    ["PATCH posto", () => postoRoute.PATCH(patch("http://localhost/api/admin/posti/posto-a1", { stato: "MANUTENZIONE" }), params("posto-a1"))],
    ["GET posto", () => postoRoute.GET(get("http://localhost/api/admin/posti/posto-a1"), params("posto-a1"))],
    ["GET dettagli posto", () => dettagliRoute.GET(get("http://localhost/api/admin/posti/posto-a1/dettagli"), params("posto-a1"))],
    ["GET utente", () => utenteRoute.GET(get("http://localhost/api/admin/utenti/u1"), params("u1"))],
    ["GET profilo utente", () => profiloRoute.GET(get("http://localhost/api/admin/utenti/u1/profilo"), params("u1"))],
    ["GET storico utente", () => storicoRoute.GET(get("http://localhost/api/admin/utenti/u1/storico"), params("u1"))],
  ];

  it.each(chiamate)("[TC-ADM-DET-001] %s senza sessione risponde 401 senza leggere il database", async (_nome, chiama) => {
    mocks.auth.mockResolvedValue(null);
    expect((await chiama()).status).toBe(401);
    for (const modello of Object.values(mocks.prisma)) {
      for (const metodo of Object.values(modello)) expect(metodo).not.toHaveBeenCalled();
    }
  });

  it.each(chiamate)("[TC-ADM-DET-002] %s per uno studente risponde 403 senza leggere il database", async (_nome, chiama) => {
    mocks.auth.mockResolvedValue({ user: studente });
    expect((await chiama()).status).toBe(403);
    for (const modello of Object.values(mocks.prisma)) {
      for (const metodo of Object.values(modello)) expect(metodo).not.toHaveBeenCalled();
    }
  });
});

describe("PATCH /api/admin/posti/[id]", () => {
  it("[TC-ADM-POSTO-001] rifiuta uno stato fuori elenco", async () => {
    const risposta = await postoRoute.PATCH(
      patch("http://localhost/api/admin/posti/posto-a1", { stato: "OCCUPATO" }),
      params("posto-a1"),
    );
    expect(risposta.status).toBe(400);
    expect(mocks.prisma.posto.update).not.toHaveBeenCalled();
  });

  it("[TC-ADM-POSTO-002] risponde 404 per un posto inesistente", async () => {
    mocks.prisma.posto.findUnique.mockResolvedValue(null);
    const risposta = await postoRoute.PATCH(
      patch("http://localhost/api/admin/posti/x", { stato: "MANUTENZIONE" }),
      params("x"),
    );
    expect(risposta.status).toBe(404);
  });

  it("[TC-ADM-POSTO-003] non cambia lo stato di un posto occupato", async () => {
    mocks.prisma.posto.findUnique.mockResolvedValue({ ...postoA1, stato: "OCCUPATO" });
    const risposta = await postoRoute.PATCH(
      patch("http://localhost/api/admin/posti/posto-a1", { stato: "MANUTENZIONE" }),
      params("posto-a1"),
    );
    expect(risposta.status).toBe(400);
    expect(mocks.prisma.posto.update).not.toHaveBeenCalled();
  });

  it("[TC-ADM-POSTO-004] mette in manutenzione e lascia traccia di attore, stato precedente e motivo", async () => {
    mocks.prisma.posto.findUnique.mockResolvedValue(postoA1);
    mocks.prisma.posto.update.mockResolvedValue({ ...postoA1, stato: "MANUTENZIONE" });
    mocks.prisma.logEvento.create.mockResolvedValue({ id: "log-1" });

    const risposta = await postoRoute.PATCH(
      patch("http://localhost/api/admin/posti/posto-a1", { stato: "MANUTENZIONE", motivo: "Presa rotta" }),
      params("posto-a1"),
    );

    expect(risposta.status).toBe(200);
    await expect(risposta.json()).resolves.toMatchObject({ success: true, message: "Posto A1 aggiornato a MANUTENZIONE" });
    expect(mocks.prisma.logEvento.create).toHaveBeenCalledWith({
      data: {
        tipo: "OVERRIDE_BIBLIOTECARIO",
        userId: "staff-1",
        dettagli: expect.objectContaining({
          azione: "CAMBIO_STATO_POSTO",
          statoVecchio: "DISPONIBILE",
          statoNuovo: "MANUTENZIONE",
          motivo: "Presa rotta",
        }),
      },
    });
  });

  it("[TC-ADM-POSTO-005] rispetta il limitatore dello staff", async () => {
    mocks.rateLimit.mockResolvedValue(new Response(null, { status: 429 }));
    const risposta = await postoRoute.PATCH(
      patch("http://localhost/api/admin/posti/posto-a1", { stato: "DISPONIBILE" }),
      params("posto-a1"),
    );
    expect(risposta.status).toBe(429);
    expect(mocks.prisma.posto.findUnique).not.toHaveBeenCalled();
  });

  it("[TC-ADM-POSTO-006] un errore del database diventa un 500 senza dettagli interni", async () => {
    mocks.prisma.posto.findUnique.mockRejectedValue(new Error("connessione persa"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const risposta = await postoRoute.PATCH(
      patch("http://localhost/api/admin/posti/posto-a1", { stato: "DISPONIBILE" }),
      params("posto-a1"),
    );
    expect(risposta.status).toBe(500);
    expect(JSON.stringify(await risposta.json())).not.toContain("connessione persa");
  });
});

describe("GET /api/admin/posti/[id]", () => {
  it("[TC-ADM-POSTO-010] restituisce il posto con le ultime prenotazioni o 404", async () => {
    mocks.prisma.posto.findUnique.mockResolvedValueOnce({ ...postoA1, prenotazioni: [], _count: { prenotazioni: 0 } });
    const trovato = await postoRoute.GET(get("http://localhost/api/admin/posti/posto-a1"), params("posto-a1"));
    expect(trovato.status).toBe(200);
    await expect(trovato.json()).resolves.toMatchObject({ posto: { numero: "A1" } });

    mocks.prisma.posto.findUnique.mockResolvedValueOnce(null);
    const assente = await postoRoute.GET(get("http://localhost/api/admin/posti/x"), params("x"));
    expect(assente.status).toBe(404);
  });
});

describe("GET /api/admin/posti/[id]/dettagli", () => {
  function preparaPosto() {
    mocks.prisma.posto.findUnique.mockResolvedValue(postoA1);
    mocks.prisma.prenotazione.count
      .mockResolvedValueOnce(8) // totali
      .mockResolvedValueOnce(6) // completate
      .mockResolvedValueOnce(1); // no-show
    mocks.prisma.prenotazione.findMany.mockResolvedValue([]);
    mocks.prisma.prenotazione.findFirst.mockResolvedValue(null);
    mocks.prisma.logEvento.findMany.mockResolvedValue([]);
  }

  it("[TC-ADM-DET-010] calcola tasso di utilizzo e di no-show sul totale", async () => {
    preparaPosto();
    const risposta = await dettagliRoute.GET(get("http://localhost/api/admin/posti/posto-a1/dettagli"), params("posto-a1"));
    expect(risposta.status).toBe(200);
    await expect(risposta.json()).resolves.toMatchObject({
      statistiche: { prenotazioniTotali: 8, prenotazioniCompletate: 6, noShowCount: 1, tassoUtilizzo: 75, tassoNoShow: 13 },
    });
  });

  it("[TC-ADM-DET-011] con zero prenotazioni i tassi valgono 0 e non NaN", async () => {
    mocks.prisma.posto.findUnique.mockResolvedValue(postoA1);
    mocks.prisma.prenotazione.count.mockResolvedValue(0);
    mocks.prisma.prenotazione.findMany.mockResolvedValue([]);
    mocks.prisma.prenotazione.findFirst.mockResolvedValue(null);
    mocks.prisma.logEvento.findMany.mockResolvedValue([]);
    const corpo = await (await dettagliRoute.GET(get("http://localhost/x"), params("posto-a1"))).json();
    expect(corpo.statistiche).toMatchObject({ tassoUtilizzo: 0, tassoNoShow: 0 });
  });

  it("[TC-ADM-DET-012] D-02: alle 00:30 di Roma cerca la prenotazione attuale con la data di Roma, non quella UTC", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    // 15 ottobre 2026, 22:30 UTC = 16 ottobre 2026, 00:30 a Roma (ora legale).
    vi.setSystemTime(new Date("2026-10-15T22:30:00.000Z"));
    preparaPosto();

    await dettagliRoute.GET(get("http://localhost/x"), params("posto-a1"));

    const filtro = mocks.prisma.prenotazione.findFirst.mock.calls[0][0].where;
    expect(filtro.data).toEqual(new Date("2026-10-16T00:00:00.000Z"));
    expect(filtro.stato).toEqual({ in: ["CHECK_IN", "CONFERMATA"] });
  });

  it("[TC-ADM-DET-013] risponde 404 se il posto non esiste e 500 su errore", async () => {
    mocks.prisma.posto.findUnique.mockResolvedValueOnce(null);
    expect((await dettagliRoute.GET(get("http://localhost/x"), params("x"))).status).toBe(404);

    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.prisma.posto.findUnique.mockRejectedValueOnce(new Error("boom"));
    expect((await dettagliRoute.GET(get("http://localhost/x"), params("x"))).status).toBe(500);
  });
});

describe("contatori no-show dell'utente (D-03)", () => {
  const utente = {
    id: "u1",
    nome: "Ada",
    cognome: "Lovelace",
    prenotazioni: [],
    prestiti: [],
    notifiche: [],
    _count: { prenotazioni: 4, prestiti: 2, notifiche: 1 },
  };

  it("[TC-ADM-USR-001] il dettaglio utente conta sia i no-show manuali sia quelli automatici", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(utente);
    mocks.prisma.logEvento.count.mockResolvedValue(3);

    const risposta = await utenteRoute.GET(get("http://localhost/api/admin/utenti/u1"), params("u1"));
    expect(risposta.status).toBe(200);
    await expect(risposta.json()).resolves.toMatchObject({
      statistiche: { totalePrenotazioni: 4, totalePrestiti: 2, noShow: 3 },
    });
    expect(mocks.prisma.logEvento.count).toHaveBeenCalledWith({
      where: { userId: "u1", tipo: { in: ["NO_SHOW", "NO_SHOW_AUTO"] } },
    });
  });

  it("[TC-ADM-USR-002] il profilo utente usa lo stesso filtro e restituisce le statistiche", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(utente);
    mocks.prisma.prenotazione.count.mockResolvedValue(5);
    mocks.prisma.prestito.count.mockResolvedValue(2);
    mocks.prisma.logEvento.count.mockResolvedValue(1);

    const risposta = await profiloRoute.GET(get("http://localhost/x"), params("u1"));
    expect(risposta.status).toBe(200);
    await expect(risposta.json()).resolves.toMatchObject({
      statistiche: { prenotazioniCompletate: 5, prestitiCompletati: 2, noShowCount: 1 },
    });
    expect(mocks.prisma.logEvento.count.mock.calls[0][0].where.tipo).toEqual({ in: ["NO_SHOW", "NO_SHOW_AUTO"] });
  });

  it("[TC-ADM-USR-003] utente inesistente: 404 da dettaglio e profilo", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(null);
    expect((await utenteRoute.GET(get("http://localhost/x"), params("x"))).status).toBe(404);
    expect((await profiloRoute.GET(get("http://localhost/x"), params("x"))).status).toBe(404);
  });

  it("[TC-ADM-USR-004] errore del database: 500 da dettaglio e profilo", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.prisma.user.findUnique.mockRejectedValue(new Error("boom"));
    expect((await utenteRoute.GET(get("http://localhost/x"), params("x"))).status).toBe(500);
    expect((await profiloRoute.GET(get("http://localhost/x"), params("x"))).status).toBe(500);
  });
});

describe("GET /api/admin/utenti/[id]/storico", () => {
  it("[TC-ADM-STO-001] restituisce gli ultimi 50 eventi in cui l'utente e' attore o destinatario", async () => {
    mocks.prisma.logEvento.findMany.mockResolvedValue([{ id: "e1", tipo: "NO_SHOW_AUTO" }]);
    const risposta = await storicoRoute.GET(get("http://localhost/x"), params("u1"));
    expect(risposta.status).toBe(200);
    await expect(risposta.json()).resolves.toEqual({ eventi: [{ id: "e1", tipo: "NO_SHOW_AUTO" }] });
    const query = mocks.prisma.logEvento.findMany.mock.calls[0][0];
    expect(query.where).toEqual({ OR: [{ userId: "u1" }, { targetUserId: "u1" }] });
    expect(query.take).toBe(50);
    expect(query.orderBy).toEqual({ createdAt: "desc" });
  });

  it("[TC-ADM-STO-002] errore del database: 500", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.prisma.logEvento.findMany.mockRejectedValue(new Error("boom"));
    expect((await storicoRoute.GET(get("http://localhost/x"), params("u1"))).status).toBe(500);
  });
});
