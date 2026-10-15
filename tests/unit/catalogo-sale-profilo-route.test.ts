// ============================================================================
// Test delle route di consultazione per lo studente: catalogo, sale, profilo
// ============================================================================
// COSA: GET/OPTIONS `/api/libri`, GET `/api/libri/[id]`, GET `/api/sale`,
//       GET/PATCH `/api/profilo`.
// PERCHE': `libri/[id]` e `profilo` erano a copertura zero; di `libri` e `sale`
//       erano verificati solo i casi limite dei parametri. Qui si fissano i
//       contratti usati dalle pagine: filtri, statistiche di disponibilita',
//       whitelist dei campi modificabili del profilo, risposte d'errore senza
//       dettagli interni.

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
    auth: vi.fn(),
    apiRateLimiter: vi.fn(),
    prisma: {
      libro: { count: vi.fn(), findMany: vi.fn(), findUnique: vi.fn() },
      prestito: { count: vi.fn() },
      sala: { findMany: vi.fn() },
      user: { findUnique: vi.fn(), update: vi.fn() },
    },
  };
});

vi.mock("@/lib/auth", () => ({
  AuthError: mocks.AuthError,
  requireUser: mocks.requireUser,
  auth: mocks.auth,
}));
vi.mock("@/lib/prisma", () => ({ default: mocks.prisma, prisma: mocks.prisma }));
vi.mock("@/lib/rate-limit", () => ({ apiRateLimiter: mocks.apiRateLimiter }));

const libriRoute = await import("@/app/api/libri/route");
const libroRoute = await import("@/app/api/libri/[id]/route");
const saleRoute = await import("@/app/api/sale/route");
const profiloRoute = await import("@/app/api/profilo/route");

const studente = { id: "studente-1", ruolo: "STUDENTE" };
const nonAutenticato = () => new mocks.AuthError(401, "NON_AUTENTICATO", "Accesso richiesto");

const libro = {
  id: "libro-1",
  titolo: "Ingegneria del software",
  autore: "Sommerville",
  isbn: "9788891902245",
  anno: 2017,
  categoria: "Informatica",
  copieTotali: 3,
  copieDisponibili: 1,
  scaffale: "B3",
  piano: 2,
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireUser.mockResolvedValue(studente);
  mocks.auth.mockResolvedValue({ user: studente });
  mocks.apiRateLimiter.mockResolvedValue(null);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("GET /api/libri", () => {
  it("[TC-LIBRI-010] cerca su titolo, autore e ISBN, filtra per categoria e disponibilita'", async () => {
    mocks.prisma.libro.count.mockResolvedValue(1);
    mocks.prisma.libro.findMany.mockResolvedValue([libro]);

    const risposta = await libriRoute.GET(
      new NextRequest("http://localhost/api/libri?q=somm&categoria=Informatica&disponibile=true&piano=2"),
    );
    expect(risposta.status).toBe(200);
    const corpo = await risposta.json();

    const where = mocks.prisma.libro.findMany.mock.calls[0][0].where;
    expect(where.OR).toEqual(
      expect.arrayContaining([
        { titolo: { contains: "somm", mode: "insensitive" } },
        { isbn: { contains: "somm", mode: "insensitive" } },
      ]),
    );
    expect(where).toMatchObject({ categoria: "Informatica", copieDisponibili: { gt: 0 }, piano: 2 });
    expect(corpo.pagination).toEqual({ page: 1, limit: 20, total: 1, totalPages: 1 });
    // I campi arricchiti sono quelli letti dalla pagina /libri.
    expect(corpo.data[0]).toMatchObject({ disponibile: true, annoPubblicazione: 2017, posizione: "Piano 2 - Scaffale B3" });
  });

  it("[TC-LIBRI-011] un errore del database diventa 500 senza dettagli", async () => {
    mocks.prisma.libro.count.mockRejectedValue(new Error("relation does not exist"));
    const risposta = await libriRoute.GET(new NextRequest("http://localhost/api/libri"));
    expect(risposta.status).toBe(500);
    expect(JSON.stringify(await risposta.json())).not.toContain("relation");
  });

  it("[TC-LIBRI-012] OPTIONS elenca le categorie distinte, senza valori nulli", async () => {
    mocks.prisma.libro.findMany.mockResolvedValue([{ categoria: "Informatica" }, { categoria: null }, { categoria: "Storia" }]);
    const risposta = await libriRoute.OPTIONS();
    await expect(risposta.json()).resolves.toEqual({ success: true, data: ["Informatica", "Storia"] });
  });

  it("[TC-LIBRI-013] OPTIONS richiede la sessione e gestisce gli errori", async () => {
    mocks.requireUser.mockRejectedValueOnce(nonAutenticato());
    expect((await libriRoute.OPTIONS()).status).toBe(401);
    mocks.prisma.libro.findMany.mockRejectedValueOnce(new Error("boom"));
    expect((await libriRoute.OPTIONS()).status).toBe(500);
  });
});

describe("GET /api/libri/[id]", () => {
  const params = (id: string) => ({ params: Promise.resolve({ id }) });

  it("[TC-LIBRO-001] restituisce il libro arricchito con prestiti attivi e storici", async () => {
    mocks.prisma.libro.findUnique.mockResolvedValue(libro);
    mocks.prisma.prestito.count.mockResolvedValueOnce(2).mockResolvedValueOnce(17);

    const risposta = await libroRoute.GET(new NextRequest("http://localhost/api/libri/libro-1"), params("libro-1"));
    expect(risposta.status).toBe(200);
    await expect(risposta.json()).resolves.toMatchObject({
      success: true,
      data: { id: "libro-1", disponibile: true, prestitiAttivi: 2, prestitiTotali: 17 },
    });
    expect(mocks.prisma.prestito.count.mock.calls[0][0]).toEqual({ where: { libroId: "libro-1", stato: "ATTIVO" } });
  });

  it("[TC-LIBRO-002] 404 per un libro inesistente", async () => {
    mocks.prisma.libro.findUnique.mockResolvedValue(null);
    expect((await libroRoute.GET(new NextRequest("http://localhost/x"), params("x"))).status).toBe(404);
    expect(mocks.prisma.prestito.count).not.toHaveBeenCalled();
  });

  it("[TC-LIBRO-003] senza sessione 401 e nessuna lettura; errore del database 500", async () => {
    mocks.requireUser.mockRejectedValueOnce(nonAutenticato());
    expect((await libroRoute.GET(new NextRequest("http://localhost/x"), params("x"))).status).toBe(401);
    expect(mocks.prisma.libro.findUnique).not.toHaveBeenCalled();

    mocks.prisma.libro.findUnique.mockRejectedValueOnce(new Error("boom"));
    expect((await libroRoute.GET(new NextRequest("http://localhost/x"), params("x"))).status).toBe(500);
  });
});

describe("GET /api/sale", () => {
  const sala = {
    id: "sala-1",
    nome: "Sala Nord",
    piano: 1,
    descrizione: null,
    isSilenziosa: true,
    isGruppi: false,
    capienzaMax: 4,
    orarioApertura: "08:00",
    orarioChiusura: "22:00",
    _count: { posti: 4 },
    posti: [{ stato: "DISPONIBILE" }, { stato: "OCCUPATO" }, { stato: "OCCUPATO" }, { stato: "MANUTENZIONE" }],
  };

  it("[TC-SALE-001] applica i filtri booleani e calcola le statistiche per sala", async () => {
    mocks.prisma.sala.findMany.mockResolvedValue([sala]);
    const risposta = await saleRoute.GET(new NextRequest("http://localhost/api/sale?isSilenziosa=true&isGruppi=false"));
    const corpo = await risposta.json();

    expect(mocks.prisma.sala.findMany.mock.calls[0][0].where).toEqual({ attiva: true, isSilenziosa: true, isGruppi: false });
    expect(corpo.count).toBe(1);
    expect(corpo.data[0].stats).toEqual({
      postiTotali: 4,
      postiDisponibili: 1,
      postiOccupati: 2,
      percentualeOccupazione: 50,
    });
    // Il dettaglio dei posti non esce dalla rotta: solo i conteggi.
    expect(corpo.data[0]).not.toHaveProperty("posti");
  });

  it("[TC-SALE-002] una sala senza posti attivi ha occupazione 0", async () => {
    mocks.prisma.sala.findMany.mockResolvedValue([{ ...sala, posti: [] }]);
    const corpo = await (await saleRoute.GET(new NextRequest("http://localhost/api/sale"))).json();
    expect(corpo.data[0].stats.percentualeOccupazione).toBe(0);
  });

  it("[TC-SALE-003] senza sessione 401; errore del database 500", async () => {
    mocks.requireUser.mockRejectedValueOnce(nonAutenticato());
    expect((await saleRoute.GET(new NextRequest("http://localhost/api/sale"))).status).toBe(401);
    mocks.prisma.sala.findMany.mockRejectedValueOnce(new Error("boom"));
    expect((await saleRoute.GET(new NextRequest("http://localhost/api/sale"))).status).toBe(500);
  });
});

describe("/api/profilo", () => {
  function patch(corpo: unknown) {
    return new NextRequest("http://localhost/api/profilo", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(corpo),
    });
  }

  it("[TC-PROF-001] GET restituisce solo i campi del profilo dell'utente in sessione", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({ id: "studente-1", nome: "Ada" });
    const risposta = await profiloRoute.GET();
    expect(risposta.status).toBe(200);
    const query = mocks.prisma.user.findUnique.mock.calls[0][0];
    expect(query.where).toEqual({ id: "studente-1" });
    expect(query.select).not.toHaveProperty("passwordHash");
    expect(query.select).toMatchObject({ isPendolare: true, preferenzeAccessibilita: true });
  });

  it("[TC-PROF-002] GET: 401 senza sessione, 404 se l'utente non esiste piu', 500 su errore", async () => {
    mocks.auth.mockResolvedValueOnce(null);
    expect((await profiloRoute.GET()).status).toBe(401);
    mocks.prisma.user.findUnique.mockResolvedValueOnce(null);
    expect((await profiloRoute.GET()).status).toBe(404);
    mocks.prisma.user.findUnique.mockRejectedValueOnce(new Error("boom"));
    const errore = await profiloRoute.GET();
    expect(errore.status).toBe(500);
    expect(JSON.stringify(await errore.json())).not.toContain("boom");
  });

  it("[TC-PROF-003] PATCH aggiorna solo i campi ammessi: ruolo ed email non passano", async () => {
    mocks.prisma.user.update.mockResolvedValue({ id: "studente-1", darkMode: true });
    const risposta = await profiloRoute.PATCH(
      patch({ darkMode: true, altoContrasto: false, ruolo: "ADMIN", email: "x@y.it", attivo: true }),
    );
    expect(risposta.status).toBe(200);
    expect(mocks.prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "studente-1" }, data: { darkMode: true, altoContrasto: false } }),
    );
  });

  it("[TC-PROF-004] PATCH: 401 senza sessione, 429 dal limitatore, 500 su errore", async () => {
    mocks.auth.mockResolvedValueOnce(null);
    expect((await profiloRoute.PATCH(patch({ darkMode: true }))).status).toBe(401);

    mocks.apiRateLimiter.mockResolvedValueOnce(new Response(null, { status: 429 }));
    expect((await profiloRoute.PATCH(patch({ darkMode: true }))).status).toBe(429);
    expect(mocks.prisma.user.update).not.toHaveBeenCalled();

    mocks.prisma.user.update.mockRejectedValueOnce(new Error("boom"));
    expect((await profiloRoute.PATCH(patch({ darkMode: true }))).status).toBe(500);
  });
});
