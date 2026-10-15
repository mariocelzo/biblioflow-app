// ============================================================================
// Test di /api/notifiche — creazione da staff, lettura, segna come lette, elimina
// ============================================================================
// COSA: rami di POST, PATCH, DELETE e GET non coperti dai test di
//       autorizzazione e paginazione esistenti.
// PERCHE': la pagina /notifiche e il badge dell'intestazione dipendono da
//       queste operazioni; dopo la rimozione del canale SSE sono anche il solo
//       modo con cui lo studente scopre una promozione dalla lista d'attesa.
//       In piu' un `tipo` fuori enum arrivava a Prisma e diventava un 500
//       (D-08): ora 422.

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
    apiRateLimiter: vi.fn(),
    prisma: {
      notifica: {
        findMany: vi.fn(),
        count: vi.fn(),
        create: vi.fn(),
        updateMany: vi.fn(),
        findUnique: vi.fn(),
        delete: vi.fn(),
      },
      user: { findUnique: vi.fn() },
    },
  };
});

vi.mock("@/lib/auth", () => ({
  AuthError: mocks.AuthError,
  requireUser: mocks.requireUser,
  isStaff: (ruolo: string) => ruolo === "BIBLIOTECARIO" || ruolo === "ADMIN",
  assertOwnership: (risorsa: { userId: string }, utente: { id: string; ruolo: string }) => {
    if (risorsa.userId === utente.id) return;
    throw new mocks.AuthError(
      utente.ruolo === "STUDENTE" ? 404 : 403,
      "RISORSA_NON_TROVATA",
      "La risorsa richiesta non esiste",
    );
  },
}));
vi.mock("@/lib/prisma", () => ({ default: mocks.prisma, prisma: mocks.prisma }));
vi.mock("@/lib/rate-limit", () => ({ apiRateLimiter: mocks.apiRateLimiter }));

const route = await import("@/app/api/notifiche/route");

const studente = { id: "studente-1", ruolo: "STUDENTE" };
const admin = { id: "admin-1", ruolo: "ADMIN" };

function richiesta(metodo: string, corpo?: unknown, query = "") {
  return new NextRequest(`http://localhost/api/notifiche${query}`, {
    method: metodo,
    headers: corpo ? { "content-type": "application/json" } : undefined,
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
}

const notificaValida = {
  userId: "studente-1",
  tipo: "SISTEMA",
  titolo: "Chiusura straordinaria",
  messaggio: "La biblioteca chiude alle 14",
  actionUrl: "/prenotazioni",
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireUser.mockResolvedValue(studente);
  mocks.apiRateLimiter.mockResolvedValue(null);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("POST /api/notifiche", () => {
  it("[TC-NOT-POST-001] solo lo staff crea notifiche: studente 403", async () => {
    const risposta = await route.POST(richiesta("POST", notificaValida));
    expect(risposta.status).toBe(403);
    expect(mocks.prisma.notifica.create).not.toHaveBeenCalled();
  });

  it("[TC-NOT-POST-002] campi mancanti 400, tipo fuori enum 422 (D-08), link esterno 422", async () => {
    mocks.requireUser.mockResolvedValue(admin);
    expect((await route.POST(richiesta("POST", { userId: "studente-1" }))).status).toBe(400);
    expect((await route.POST(richiesta("POST", { ...notificaValida, tipo: "SPAM" }))).status).toBe(422);
    expect((await route.POST(richiesta("POST", { ...notificaValida, actionUrl: "https://phishing.example" }))).status).toBe(422);
    expect((await route.POST(richiesta("POST", { ...notificaValida, actionUrl: "javascript:alert(1)" }))).status).toBe(422);
    expect(mocks.prisma.notifica.create).not.toHaveBeenCalled();
  });

  it("[TC-NOT-POST-003] destinatario inesistente 404; destinatario valido 201", async () => {
    mocks.requireUser.mockResolvedValue(admin);
    mocks.prisma.user.findUnique.mockResolvedValueOnce(null);
    expect((await route.POST(richiesta("POST", notificaValida))).status).toBe(404);

    mocks.prisma.user.findUnique.mockResolvedValueOnce({ id: "studente-1" });
    mocks.prisma.notifica.create.mockResolvedValueOnce({ id: "n1", ...notificaValida });
    const creata = await route.POST(richiesta("POST", notificaValida));
    expect(creata.status).toBe(201);
    expect(mocks.prisma.notifica.create.mock.calls[0][0].data).toMatchObject(notificaValida);
  });

  it("[TC-NOT-POST-004] il limitatore viene applicato prima di tutto", async () => {
    mocks.requireUser.mockResolvedValue(admin);
    mocks.apiRateLimiter.mockResolvedValueOnce(new Response(null, { status: 429 }));
    expect((await route.POST(richiesta("POST", notificaValida))).status).toBe(429);
  });
});

describe("PATCH /api/notifiche", () => {
  it("[TC-NOT-PATCH-001] segna tutte le proprie notifiche come lette", async () => {
    mocks.prisma.notifica.updateMany.mockResolvedValue({ count: 4 });
    const corpo = await (await route.PATCH(richiesta("PATCH", { segnaTutteLette: true }))).json();
    expect(corpo).toMatchObject({ success: true, aggiornate: 4 });
    expect(mocks.prisma.notifica.updateMany.mock.calls[0][0].where).toEqual({ userId: "studente-1", letta: false });
  });

  it("[TC-NOT-PATCH-002] rimette come non lette solo notifiche proprie, azzerando lettaAt", async () => {
    mocks.prisma.notifica.updateMany.mockResolvedValue({ count: 1 });
    await route.PATCH(richiesta("PATCH", { ids: ["n1", "n-altrui"], segnaLetta: false }));
    expect(mocks.prisma.notifica.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["n1", "n-altrui"] }, userId: "studente-1" },
      data: { letta: false, lettaAt: null },
    });
  });

  it("[TC-NOT-PATCH-003] senza ids ne' segnaTutteLette risponde 400", async () => {
    expect((await route.PATCH(richiesta("PATCH", { ids: [] }))).status).toBe(400);
  });
});

describe("DELETE /api/notifiche", () => {
  it("[TC-NOT-DEL-001] id mancante 400, inesistente 404", async () => {
    expect((await route.DELETE(richiesta("DELETE"))).status).toBe(400);
    mocks.prisma.notifica.findUnique.mockResolvedValue(null);
    expect((await route.DELETE(richiesta("DELETE", undefined, "?id=x"))).status).toBe(404);
  });

  it("[TC-NOT-DEL-002] la notifica di un altro studente risulta inesistente e non viene cancellata", async () => {
    mocks.prisma.notifica.findUnique.mockResolvedValue({ id: "n2", userId: "studente-2" });
    expect((await route.DELETE(richiesta("DELETE", undefined, "?id=n2"))).status).toBe(404);
    expect(mocks.prisma.notifica.delete).not.toHaveBeenCalled();
  });

  it("[TC-NOT-DEL-003] elimina la propria notifica", async () => {
    mocks.prisma.notifica.findUnique.mockResolvedValue({ id: "n1", userId: "studente-1" });
    mocks.prisma.notifica.delete.mockResolvedValue({});
    const risposta = await route.DELETE(richiesta("DELETE", undefined, "?id=n1"));
    expect(risposta.status).toBe(200);
    expect(mocks.prisma.notifica.delete).toHaveBeenCalledWith({ where: { id: "n1" } });
  });

  it("[TC-NOT-DEL-004] un errore del database diventa 500 generico", async () => {
    mocks.prisma.notifica.findUnique.mockRejectedValue(new Error("boom"));
    const risposta = await route.DELETE(richiesta("DELETE", undefined, "?id=n1"));
    expect(risposta.status).toBe(500);
    await expect(risposta.json()).resolves.toEqual({ success: false, error: "Errore nell'eliminazione della notifica" });
  });
});

describe("GET /api/notifiche", () => {
  it("[TC-NOT-GET-001] il filtro letta=true restringe l'elenco, i conteggi restano dell'utente", async () => {
    mocks.prisma.notifica.findMany.mockResolvedValue([]);
    mocks.prisma.notifica.count.mockResolvedValue(0);
    await route.GET(richiesta("GET", undefined, "?letta=true&userId=altro"));
    expect(mocks.prisma.notifica.findMany.mock.calls[0][0].where).toEqual({ userId: "studente-1", letta: true });
  });

  it("[TC-NOT-GET-002] senza sessione 401", async () => {
    mocks.requireUser.mockRejectedValue(new mocks.AuthError(401, "NON_AUTENTICATO", "Accesso richiesto"));
    expect((await route.GET(richiesta("GET"))).status).toBe(401);
  });
});
