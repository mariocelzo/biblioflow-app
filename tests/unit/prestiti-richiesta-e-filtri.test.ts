// ============================================================================
// Test di /api/prestiti — richiesta di prestito e filtri dell'elenco
// ============================================================================
// COSA: rami di POST e GET non coperti dai test di autorizzazione esistenti.
// PERCHE':
//   - D-06: la durata del prestito (`durataDays`) arrivava dal client senza
//     controlli: uno studente poteva chiedere un prestito di dieci anni, una
//     durata negativa (prestito gia' scaduto) o non numerica (data non
//     valida, errore 500). Ora lo studente riceve sempre 30 giorni; lo staff
//     puo' indicare una durata intera tra 1 e 60.
//   - D-07: `GET /api/prestiti?stato=XYZ` passava il valore a Prisma e
//     rispondeva 500; ora 422, come gia' per prenotazioni, posti e richieste.

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
    prisma: {
      $transaction: vi.fn(),
      user: { findUnique: vi.fn() },
      libro: { findUnique: vi.fn(), updateMany: vi.fn() },
      prestito: { findMany: vi.fn(), findFirst: vi.fn(), count: vi.fn(), create: vi.fn() },
      logEvento: { create: vi.fn() },
      notifica: { create: vi.fn() },
    },
  };
});

vi.mock("@/lib/auth", () => ({
  AuthError: mocks.AuthError,
  requireUser: mocks.requireUser,
  isStaff: (ruolo: string) => ruolo === "BIBLIOTECARIO" || ruolo === "ADMIN",
}));
vi.mock("@/lib/prisma", () => ({ default: mocks.prisma, prisma: mocks.prisma }));
vi.mock("@/lib/rate-limit", () => ({
  readApiRateLimiter: vi.fn(async () => null),
  loanRequestRateLimiter: vi.fn(async () => null),
}));

const route = await import("@/app/api/prestiti/route");

const GIORNO = 24 * 60 * 60 * 1000;
const studente = { id: "studente-1", ruolo: "STUDENTE" };
const bibliotecario = { id: "staff-1", ruolo: "BIBLIOTECARIO" };
const libro = { id: "libro-1", titolo: "Dune", copieDisponibili: 2 };

function post(corpo: unknown) {
  return new NextRequest("http://localhost/api/prestiti", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(corpo),
  });
}

function preparaPrestitoPossibile() {
  mocks.prisma.user.findUnique.mockImplementation(async ({ where }) => ({ id: where.id }));
  mocks.prisma.libro.findUnique.mockResolvedValue(libro);
  mocks.prisma.prestito.findFirst.mockResolvedValue(null);
  mocks.prisma.prestito.count.mockResolvedValue(0);
  mocks.prisma.libro.updateMany.mockResolvedValue({ count: 1 });
  mocks.prisma.prestito.create.mockImplementation(async ({ data }) => ({ id: "nuovo", ...data }));
  mocks.prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(mocks.prisma));
}

function giorniDiDurata() {
  const { dataScadenza } = mocks.prisma.prestito.create.mock.calls[0][0].data;
  return Math.round((dataScadenza.getTime() - Date.now()) / GIORNO);
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireUser.mockResolvedValue(studente);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("POST /api/prestiti — durata (D-06)", () => {
  it("[TC-PREST-DUR-001] lo studente riceve sempre 30 giorni, qualunque durata chieda", async () => {
    preparaPrestitoPossibile();
    for (const durataDays of [3650, -5, "molti"]) {
      mocks.prisma.prestito.create.mockClear();
      const risposta = await route.POST(post({ libroId: "libro-1", durataDays }));
      expect(risposta.status).toBe(201);
      expect(giorniDiDurata()).toBe(30);
    }
  });

  it("[TC-PREST-DUR-002] lo staff puo' indicare una durata tra 1 e 60 giorni", async () => {
    mocks.requireUser.mockResolvedValue(bibliotecario);
    preparaPrestitoPossibile();
    const risposta = await route.POST(post({ libroId: "libro-1", userId: "studente-9", durataDays: 7 }));
    expect(risposta.status).toBe(201);
    expect(giorniDiDurata()).toBe(7);
    // Prestito al banco: l'intestatario e' quello indicato dallo staff.
    expect(mocks.prisma.prestito.create.mock.calls[0][0].data.userId).toBe("studente-9");
  });

  it.each([0, 61, 2.5, "15"])("[TC-PREST-DUR-003] durata %s richiesta dallo staff: 422 senza scritture", async (durataDays) => {
    mocks.requireUser.mockResolvedValue(bibliotecario);
    preparaPrestitoPossibile();
    const risposta = await route.POST(post({ libroId: "libro-1", durataDays }));
    expect(risposta.status).toBe(422);
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe("POST /api/prestiti — controlli preliminari", () => {
  it("[TC-PREST-POST-001] libroId mancante 400", async () => {
    expect((await route.POST(post({}))).status).toBe(400);
  });

  it("[TC-PREST-POST-002] utente o libro inesistente 404", async () => {
    mocks.prisma.user.findUnique.mockResolvedValueOnce(null);
    expect((await route.POST(post({ libroId: "libro-1" }))).status).toBe(404);

    mocks.prisma.user.findUnique.mockResolvedValueOnce({ id: "studente-1" });
    mocks.prisma.libro.findUnique.mockResolvedValueOnce(null);
    expect((await route.POST(post({ libroId: "x" }))).status).toBe(404);
  });

  it("[TC-PREST-POST-003] nessuna copia, libro gia' in prestito o tetto di 5 raggiunto: 409", async () => {
    preparaPrestitoPossibile();
    mocks.prisma.libro.findUnique.mockResolvedValueOnce({ ...libro, copieDisponibili: 0 });
    expect((await route.POST(post({ libroId: "libro-1" }))).status).toBe(409);

    mocks.prisma.prestito.findFirst.mockResolvedValueOnce({ id: "gia" });
    const duplicato = await route.POST(post({ libroId: "libro-1" }));
    expect(duplicato.status).toBe(409);
    await expect(duplicato.json()).resolves.toMatchObject({ error: "Hai già questo libro in prestito" });

    mocks.prisma.prestito.count.mockResolvedValueOnce(5);
    const tetto = await route.POST(post({ libroId: "libro-1" }));
    expect(tetto.status).toBe(409);
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("[TC-PREST-POST-004] se l'ultima copia sparisce durante la transazione risponde 409, non 500", async () => {
    preparaPrestitoPossibile();
    mocks.prisma.libro.updateMany.mockResolvedValue({ count: 0 });
    const risposta = await route.POST(post({ libroId: "libro-1" }));
    expect(risposta.status).toBe(409);
    expect(mocks.prisma.prestito.create).not.toHaveBeenCalled();
  });

  it("[TC-PREST-POST-005] un errore imprevisto nella transazione diventa 500 generico", async () => {
    preparaPrestitoPossibile();
    mocks.prisma.libro.updateMany.mockRejectedValue(new Error("deadlock"));
    const risposta = await route.POST(post({ libroId: "libro-1" }));
    expect(risposta.status).toBe(500);
    expect(JSON.stringify(await risposta.json())).not.toContain("deadlock");
  });
});

describe("GET /api/prestiti — filtri", () => {
  const get = (query: string) => route.GET(new NextRequest(`http://localhost/api/prestiti${query}`));

  it("[TC-PREST-GET-001] D-07: uno stato fuori enum risponde 422 senza interrogare il database", async () => {
    const risposta = await get("?stato=PERSO");
    expect(risposta.status).toBe(422);
    expect(mocks.prisma.prestito.findMany).not.toHaveBeenCalled();
  });

  it("[TC-PREST-GET-002] lo staff filtra per utente, libro e stato; scaduti include i rinnovati", async () => {
    mocks.requireUser.mockResolvedValue(bibliotecario);
    mocks.prisma.prestito.findMany.mockResolvedValue([]);
    await get("?userId=studente-2&libroId=libro-1&stato=ATTIVO");
    expect(mocks.prisma.prestito.findMany.mock.calls[0][0].where).toEqual({
      userId: "studente-2",
      libroId: "libro-1",
      stato: "ATTIVO",
    });

    await get("?scaduti=true");
    const where = mocks.prisma.prestito.findMany.mock.calls[1][0].where;
    expect(where.stato).toEqual({ in: ["ATTIVO", "RINNOVATO"] });
    expect(where.dataScadenza.lt).toBeInstanceOf(Date);
  });

  it("[TC-PREST-GET-003] calcola giorni rimanenti, ritardo e scadenza imminente", async () => {
    mocks.prisma.prestito.findMany.mockResolvedValue([
      { id: "a", stato: "ATTIVO", dataScadenza: new Date(Date.now() - 2 * GIORNO) },
      { id: "b", stato: "RINNOVATO", dataScadenza: new Date(Date.now() + 2 * GIORNO) },
      { id: "c", stato: "RESTITUITO", dataScadenza: new Date(Date.now() - 9 * GIORNO) },
    ]);
    const corpo = await (await get("")).json();
    expect(corpo.count).toBe(3);
    expect(corpo.data.map((p: { id: string; isScaduto: boolean; inScadenza: boolean }) => [p.id, p.isScaduto, p.inScadenza])).toEqual([
      ["a", true, false],
      ["b", false, true],
      // Un prestito restituito non e' "in ritardo" anche se la scadenza e' passata.
      ["c", false, false],
    ]);
  });

  it("[TC-PREST-GET-004] senza sessione 401; errore del database 500", async () => {
    mocks.requireUser.mockRejectedValueOnce(new mocks.AuthError(401, "NON_AUTENTICATO", "Accesso richiesto"));
    expect((await get("")).status).toBe(401);
    mocks.prisma.prestito.findMany.mockRejectedValueOnce(new Error("boom"));
    expect((await get("")).status).toBe(500);
  });
});
