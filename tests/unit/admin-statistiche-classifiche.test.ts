// ============================================================================
// Test di GET /api/admin/statistiche — classifiche e casi d'errore
// ============================================================================
// COSA: tipi `utenti-attivi` e `libri-prestati`, tipo sconosciuto, accesso,
//       errore del database.
// PERCHE': le due classifiche della pagina Statistiche non avevano test: un
//       utente o un libro cancellato dopo aver generato dati deve comparire
//       come "Sconosciuto", non far fallire l'intera pagina.

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  prisma: {
    prenotazione: { groupBy: vi.fn() },
    prestito: { groupBy: vi.fn() },
    user: { findMany: vi.fn() },
    libro: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/prisma", () => ({ default: mocks.prisma, prisma: mocks.prisma }));

const route = await import("@/app/api/admin/statistiche/route");

const chiama = (tipo: string) =>
  route.GET(new NextRequest(`http://localhost/api/admin/statistiche?tipo=${tipo}`));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: "admin-1", ruolo: "ADMIN" } });
});

describe("GET /api/admin/statistiche", () => {
  it("[TC-STAT-CL-001] utenti-attivi: top 10 per numero di prenotazioni, con nome e ripiego", async () => {
    mocks.prisma.prenotazione.groupBy.mockResolvedValue([
      { userId: "u1", _count: { id: 12 } },
      { userId: "u-cancellato", _count: { id: 3 } },
    ]);
    mocks.prisma.user.findMany.mockResolvedValue([{ id: "u1", nome: "Ada", cognome: "Lovelace" }]);

    const risposta = await chiama("utenti-attivi");
    expect(risposta.status).toBe(200);
    await expect(risposta.json()).resolves.toEqual({
      data: [
        { nome: "Ada Lovelace", prenotazioni: 12 },
        { nome: "Sconosciuto", prenotazioni: 3 },
      ],
    });
    expect(mocks.prisma.prenotazione.groupBy.mock.calls[0][0]).toMatchObject({ by: ["userId"], take: 10 });
    expect(mocks.prisma.user.findMany.mock.calls[0][0].where).toEqual({ id: { in: ["u1", "u-cancellato"] } });
  });

  it("[TC-STAT-CL-002] libri-prestati: top 10 per numero di prestiti, con titolo e autore", async () => {
    mocks.prisma.prestito.groupBy.mockResolvedValue([
      { libroId: "l1", _count: { id: 7 } },
      { libroId: "l-rimosso", _count: { id: 1 } },
    ]);
    mocks.prisma.libro.findMany.mockResolvedValue([{ id: "l1", titolo: "Dune", autore: "Herbert" }]);

    await expect((await chiama("libri-prestati")).json()).resolves.toEqual({
      data: [
        { titolo: "Dune", autore: "Herbert", prestiti: 7 },
        { titolo: "Sconosciuto", autore: "", prestiti: 1 },
      ],
    });
  });

  it("[TC-STAT-CL-003] un tipo sconosciuto o assente risponde 400", async () => {
    expect((await chiama("fantasia")).status).toBe(400);
    expect((await route.GET(new NextRequest("http://localhost/api/admin/statistiche"))).status).toBe(400);
  });

  it("[TC-STAT-CL-004] anonimo 401, studente 403, senza query", async () => {
    mocks.auth.mockResolvedValueOnce(null);
    expect((await chiama("utenti-attivi")).status).toBe(401);
    mocks.auth.mockResolvedValueOnce({ user: { id: "s1", ruolo: "STUDENTE" } });
    expect((await chiama("utenti-attivi")).status).toBe(403);
    expect(mocks.prisma.prenotazione.groupBy).not.toHaveBeenCalled();
  });

  it("[TC-STAT-CL-005] un errore del database diventa un 500 generico", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.prisma.prestito.groupBy.mockRejectedValue(new Error("timeout"));
    const risposta = await chiama("libri-prestati");
    expect(risposta.status).toBe(500);
    await expect(risposta.json()).resolves.toEqual({ error: "Errore interno del server" });
  });
});
