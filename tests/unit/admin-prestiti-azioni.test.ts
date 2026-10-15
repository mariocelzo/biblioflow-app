// ============================================================================
// Test di POST /api/admin/prestiti — azioni dello staff sui prestiti
// ============================================================================
// COSA: RESTITUISCI, RINNOVA, SOLLECITA_SINGOLO, SOLLECITA_MULTIPLI nei rami
//       non coperti dai test esistenti, piu' accesso e corpo non valido.
// PERCHE' (D-05): rinnovo e sollecito venivano registrati con il tipo di
//       evento di un'altra azione (PRESTITO_CREATO e PRESTITO_RESTITUITO): la
//       dashboard admin mostrava un sollecito come "ha restituito un libro" e
//       un rinnovo come "ha preso un libro in prestito". Inoltre il sollecito
//       singolo, a differenza di quello multiplo, non controllava lato server
//       che il prestito fosse in corso, scaduto e non gia' sollecitato.

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  rateLimit: vi.fn(),
  prisma: {
    $transaction: vi.fn(),
    prestito: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    libro: { update: vi.fn() },
    notifica: { create: vi.fn() },
    logEvento: { create: vi.fn(), findMany: vi.fn() },
  },
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/prisma", () => ({ default: mocks.prisma, prisma: mocks.prisma }));
vi.mock("@/lib/rate-limit", () => ({ staffCriticalApiRateLimiter: mocks.rateLimit }));

const route = await import("@/app/api/admin/prestiti/route");

const GIORNO = 24 * 60 * 60 * 1000;
const staff = { id: "staff-1", email: "staff@biblioflow.test", ruolo: "BIBLIOTECARIO" };

function prestito(sovrascritture: Record<string, unknown> = {}) {
  return {
    id: "prestito-1",
    libroId: "libro-1",
    stato: "ATTIVO",
    rinnovi: 0,
    maxRinnovi: 2,
    dataScadenza: new Date(Date.now() - 5 * GIORNO),
    user: { id: "studente-1" },
    libro: { id: "libro-1", titolo: "Il nome della rosa" },
    ...sovrascritture,
  };
}

function richiesta(corpo: unknown, grezzo = false) {
  return new NextRequest("http://localhost/api/admin/prestiti", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: grezzo ? (corpo as string) : JSON.stringify(corpo),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ user: staff });
  mocks.rateLimit.mockResolvedValue(null);
  mocks.prisma.logEvento.findMany.mockResolvedValue([]);
  mocks.prisma.logEvento.create.mockResolvedValue({ id: "log-1" });
  mocks.prisma.notifica.create.mockResolvedValue({ id: "notifica-1" });
  mocks.prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(mocks.prisma));
});

describe("accesso e richiesta", () => {
  it("[TC-ADM-PREST-001] anonimo 401, studente 403, limitatore 429", async () => {
    mocks.auth.mockResolvedValueOnce(null);
    expect((await route.POST(richiesta({ azione: "RINNOVA" }))).status).toBe(401);
    mocks.auth.mockResolvedValueOnce({ user: { id: "s", ruolo: "STUDENTE" } });
    expect((await route.POST(richiesta({ azione: "RINNOVA" }))).status).toBe(403);
    mocks.rateLimit.mockResolvedValueOnce(new Response(null, { status: 429 }));
    expect((await route.POST(richiesta({ azione: "RINNOVA" }))).status).toBe(429);
    expect(mocks.prisma.prestito.findUnique).not.toHaveBeenCalled();
  });

  it("[TC-ADM-PREST-002] corpo non JSON 400, azione sconosciuta 400, errore del database 500", async () => {
    expect((await route.POST(richiesta("azione=RINNOVA", true))).status).toBe(400);
    expect((await route.POST(richiesta({ azione: "ELIMINA" }))).status).toBe(400);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.prisma.prestito.findUnique.mockRejectedValueOnce(new Error("boom"));
    expect((await route.POST(richiesta({ azione: "RINNOVA", prestitoId: "p" }))).status).toBe(500);
  });

  it.each(["RESTITUISCI", "RINNOVA", "SOLLECITA_SINGOLO"])(
    "[TC-ADM-PREST-003] %s senza prestitoId 400, prestito inesistente 404",
    async (azione) => {
      expect((await route.POST(richiesta({ azione }))).status).toBe(400);
      mocks.prisma.prestito.findUnique.mockResolvedValueOnce(null);
      expect((await route.POST(richiesta({ azione, prestitoId: "x" }))).status).toBe(404);
    },
  );
});

describe("RESTITUISCI", () => {
  it("[TC-ADM-PREST-010] un prestito gia' restituito non viene restituito due volte", async () => {
    mocks.prisma.prestito.findUnique.mockResolvedValue(prestito({ stato: "RESTITUITO" }));
    expect((await route.POST(richiesta({ azione: "RESTITUISCI", prestitoId: "prestito-1" }))).status).toBe(400);
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("[TC-ADM-PREST-011] calcola i giorni di ritardo e restituisce la copia al catalogo", async () => {
    mocks.prisma.prestito.findUnique.mockResolvedValue(prestito());
    mocks.prisma.prestito.updateMany.mockResolvedValue({ count: 1 });
    const corpo = await (await route.POST(richiesta({ azione: "RESTITUISCI", prestitoId: "prestito-1" }))).json();
    expect(corpo).toMatchObject({ success: true, giorniRitardo: 5 });
    expect(mocks.prisma.libro.update).toHaveBeenCalledWith({
      where: { id: "libro-1" },
      data: { copieDisponibili: { increment: 1 } },
    });
  });
});

describe("RINNOVA", () => {
  it("[TC-ADM-PREST-020] non rinnova un prestito concluso ne' oltre il tetto", async () => {
    mocks.prisma.prestito.findUnique.mockResolvedValueOnce(prestito({ stato: "RESTITUITO" }));
    expect((await route.POST(richiesta({ azione: "RINNOVA", prestitoId: "prestito-1" }))).status).toBe(400);

    mocks.prisma.prestito.findUnique.mockResolvedValueOnce(prestito({ stato: "RINNOVATO", rinnovi: 2 }));
    const oltre = await route.POST(richiesta({ azione: "RINNOVA", prestitoId: "prestito-1" }));
    expect(oltre.status).toBe(400);
    await expect(oltre.json()).resolves.toMatchObject({ error: expect.stringContaining("2 rinnovi") });
    expect(mocks.prisma.prestito.update).not.toHaveBeenCalled();
  });

  it("[TC-ADM-PREST-021] D-05: rinnova di 14 giorni e registra PRESTITO_RINNOVATO, non PRESTITO_CREATO", async () => {
    mocks.prisma.prestito.findUnique.mockResolvedValue(prestito({ stato: "RINNOVATO", rinnovi: 1 }));
    const risposta = await route.POST(richiesta({ azione: "RINNOVA", prestitoId: "prestito-1" }));
    expect(risposta.status).toBe(200);

    const aggiornamento = mocks.prisma.prestito.update.mock.calls[0][0];
    expect(aggiornamento.data).toMatchObject({ stato: "RINNOVATO", rinnovi: { increment: 1 } });
    const giorni = (aggiornamento.data.dataScadenza.getTime() - Date.now()) / GIORNO;
    expect(giorni).toBeGreaterThan(13.9);
    expect(giorni).toBeLessThan(14.1);

    expect(mocks.prisma.logEvento.create.mock.calls[0][0].data).toMatchObject({
      tipo: "PRESTITO_RINNOVATO",
      dettagli: expect.objectContaining({ azione: "rinnovo", rinnovatoDa: "staff@biblioflow.test" }),
    });
    expect(mocks.prisma.notifica.create).toHaveBeenCalledTimes(1);
  });
});

describe("SOLLECITA_SINGOLO", () => {
  it("[TC-ADM-PREST-030] non sollecita un prestito restituito", async () => {
    mocks.prisma.prestito.findUnique.mockResolvedValue(prestito({ stato: "RESTITUITO" }));
    const risposta = await route.POST(richiesta({ azione: "SOLLECITA_SINGOLO", prestitoId: "prestito-1" }));
    expect(risposta.status).toBe(400);
    expect(mocks.prisma.notifica.create).not.toHaveBeenCalled();
  });

  it("[TC-ADM-PREST-031] non sollecita un prestito non ancora scaduto", async () => {
    mocks.prisma.prestito.findUnique.mockResolvedValue(prestito({ dataScadenza: new Date(Date.now() + 3 * GIORNO) }));
    const risposta = await route.POST(richiesta({ azione: "SOLLECITA_SINGOLO", prestitoId: "prestito-1" }));
    expect(risposta.status).toBe(400);
    await expect(risposta.json()).resolves.toMatchObject({ error: "Il prestito non è ancora scaduto" });
    expect(mocks.prisma.notifica.create).not.toHaveBeenCalled();
  });

  it("[TC-ADM-PREST-032] un secondo sollecito entro 24 ore viene rifiutato con 409", async () => {
    mocks.prisma.prestito.findUnique.mockResolvedValue(prestito());
    mocks.prisma.logEvento.findMany.mockResolvedValue([
      { id: "log-precedente", dettagli: { prestitoId: "prestito-1", azione: "sollecito_batch" } },
    ]);
    const risposta = await route.POST(richiesta({ azione: "SOLLECITA_SINGOLO", prestitoId: "prestito-1" }));
    expect(risposta.status).toBe(409);
    expect(mocks.prisma.notifica.create).not.toHaveBeenCalled();
  });

  it("[TC-ADM-PREST-033] D-05: invia il sollecito e lo registra come PRESTITO_SOLLECITATO", async () => {
    mocks.prisma.prestito.findUnique.mockResolvedValue(prestito());
    const risposta = await route.POST(richiesta({ azione: "SOLLECITA_SINGOLO", prestitoId: "prestito-1" }));
    expect(risposta.status).toBe(200);
    expect(mocks.prisma.notifica.create.mock.calls[0][0].data.messaggio).toContain("scaduto 5 giorni fa");
    expect(mocks.prisma.logEvento.create.mock.calls[0][0].data).toMatchObject({
      tipo: "PRESTITO_SOLLECITATO",
      dettagli: expect.objectContaining({ prestitoId: "prestito-1", azione: "sollecito", giorniRitardo: 5 }),
    });
  });
});

describe("SOLLECITA_MULTIPLI", () => {
  it("[TC-ADM-PREST-040] senza elenco di prestiti risponde 400", async () => {
    expect((await route.POST(richiesta({ azione: "SOLLECITA_MULTIPLI", prestitoIds: "p1" }))).status).toBe(400);
  });

  it("[TC-ADM-PREST-041] D-05: registra PRESTITO_SOLLECITATO e la finestra anti-duplicato riconosce anche i log storici", async () => {
    mocks.prisma.prestito.findMany.mockResolvedValue([
      prestito(),
      prestito({ id: "prestito-2", dataScadenza: new Date(Date.now() + GIORNO) }),
    ]);
    const corpo = await (await route.POST(richiesta({ azione: "SOLLECITA_MULTIPLI", prestitoIds: ["prestito-1", "prestito-2"] }))).json();

    expect(corpo).toMatchObject({ success: true, message: "1 solleciti inviati", saltatiRecente: 0 });
    expect(mocks.prisma.logEvento.findMany.mock.calls[0][0].where.tipo).toEqual({
      in: ["PRESTITO_SOLLECITATO", "PRESTITO_RESTITUITO"],
    });
    expect(mocks.prisma.logEvento.create).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.logEvento.create.mock.calls[0][0].data.tipo).toBe("PRESTITO_SOLLECITATO");
  });
});
