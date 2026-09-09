/**
 * Test di integrita' dei dati per `PATCH /api/prestiti/[id]` (azione "restituisci").
 *
 * COSA verifica: la restituzione di un prestito e' riservata allo staff
 * (BIBLIOTECARIO/ADMIN); allo studente proprietario resta consentito solo il
 * rinnovo.
 *
 * PERCHE': la restituzione e' un fatto FISICO che avviene al banco, e infatti
 * esiste gia' un endpoint staff-only equivalente (`/api/admin/prestiti`, azione
 * "RESTITUISCI"). Finche' anche lo studente poteva invocarla, poteva dichiarare
 * restituito un libro che teneva in mano: il prestito passava a RESTITUITO e
 * `copieDisponibili` veniva incrementato, cosi' il catalogo mostrava una copia
 * disponibile inesistente che un altro utente poteva prendere in prestito.
 * La stessa operazione fisica non deve avere due percorsi con requisiti di
 * autorizzazione diversi.
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
    prisma: {
      $transaction: vi.fn(),
      prestito: { findUnique: vi.fn(), update: vi.fn() },
      libro: { update: vi.fn() },
      logEvento: { create: vi.fn() },
      notifica: { create: vi.fn() },
    },
  };
});

vi.mock("@/lib/auth", () => ({
  AuthError: mocks.MockAuthError,
  requireUser: mocks.requireUser,
  isStaff: (ruolo: string) => ruolo === "BIBLIOTECARIO" || ruolo === "ADMIN",
  assertOwnership: (resource: { userId: string }, user: { id: string; ruolo: string }) => {
    if (resource.userId === user.id) return;
    throw new mocks.MockAuthError(
      user.ruolo === "STUDENTE" ? 404 : 403,
      user.ruolo === "STUDENTE" ? "RISORSA_NON_TROVATA" : "RISORSA_NON_AUTORIZZATA",
      "accesso negato",
    );
  },
}));
vi.mock("@/lib/prisma", () => ({ default: mocks.prisma, prisma: mocks.prisma }));

type Route = typeof import("@/app/api/prestiti/[id]/route");
let route: Route;

const studente = { id: "studente-1", ruolo: "STUDENTE" as const };
const bibliotecario = { id: "staff-1", ruolo: "BIBLIOTECARIO" as const };

const prestito = {
  id: "prestito-1",
  userId: studente.id,
  libroId: "libro-1",
  stato: "ATTIVO",
  rinnovi: 0,
  maxRinnovi: 2,
  dataScadenza: new Date("2030-07-01T00:00:00.000Z"),
  libro: { id: "libro-1", titolo: "Il nome della rosa", autore: "Eco" },
};

function request(body: unknown) {
  return new NextRequest("http://localhost/api/prestiti/prestito-1", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
const params = { params: Promise.resolve({ id: "prestito-1" }) };

// Il tx passato a $transaction riusa gli stessi mock, cosi' un incremento di
// copieDisponibili dentro la transazione resta osservabile dal test.
const tx = {
  prestito: { update: mocks.prisma.prestito.update },
  libro: { update: mocks.prisma.libro.update },
};

beforeAll(async () => {
  route = await import("@/app/api/prestiti/[id]/route");
});

beforeEach(() => {
  vi.resetAllMocks();
  mocks.prisma.prestito.findUnique.mockResolvedValue(prestito);
  mocks.prisma.prestito.update.mockImplementation(
    async ({ data }: { data: Record<string, unknown> }) => ({ ...prestito, ...data }),
  );
  mocks.prisma.libro.update.mockResolvedValue({ id: "libro-1" });
  mocks.prisma.logEvento.create.mockResolvedValue({ id: "log-1" });
  mocks.prisma.notifica.create.mockResolvedValue({ id: "notifica-1" });
  mocks.prisma.$transaction.mockImplementation(
    async (cb: (client: typeof tx) => Promise<unknown>) => cb(tx),
  );
});

describe("Integrita' dati - la restituzione di un prestito e' un'operazione di banco", () => {
  it("[TC-INT-PREST-001] lo studente proprietario non puo' auto-restituire il prestito", async () => {
    mocks.requireUser.mockResolvedValue(studente);

    const response = await route.PATCH(request({ azione: "restituisci" }), params);

    expect(response.status).toBe(403);
    // Il punto critico: nessuna copia fantasma deve rientrare in catalogo.
    expect(mocks.prisma.libro.update).not.toHaveBeenCalled();
    expect(mocks.prisma.prestito.update).not.toHaveBeenCalled();
  });

  it("[TC-INT-PREST-002] il bibliotecario puo' registrare la restituzione", async () => {
    mocks.requireUser.mockResolvedValue(bibliotecario);
    mocks.prisma.prestito.findUnique.mockResolvedValue(prestito);

    const response = await route.PATCH(request({ azione: "restituisci" }), params);

    expect(response.status).toBe(200);
    expect(mocks.prisma.libro.update).toHaveBeenCalledWith({
      where: { id: "libro-1" },
      data: { copieDisponibili: { increment: 1 } },
    });
  });

  it("[TC-INT-PREST-003] allo studente proprietario resta consentito il rinnovo", async () => {
    // Il divieto deve colpire SOLO la restituzione: nessuna regressione sul
    // rinnovo, che e' l'unica azione self-service legittima.
    mocks.requireUser.mockResolvedValue(studente);

    const response = await route.PATCH(request({ azione: "rinnova" }), params);

    expect(response.status).toBe(200);
    expect(mocks.prisma.prestito.update).toHaveBeenCalledTimes(1);
  });
});
