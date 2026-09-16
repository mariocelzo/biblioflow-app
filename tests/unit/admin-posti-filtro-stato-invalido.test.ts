// ============================================================================
// Test di /admin/posti — filtro ?stato con un valore che non e' nell'enum
// ============================================================================
// COSA: i filtri delle liste admin (/admin/posti, /admin/prenotazioni,
// /admin/prestiti, /admin/utenti) leggono `stato`/`ruolo` dalla query string
// e li passavano a Prisma con un semplice `as EnumType`. Una URL digitata a
// mano con un valore che non appartiene all'enum (es. `/admin/posti?stato=PIPPO`)
// arrivava cosi' intatta nella clausola `where`: Prisma la rifiuta con una
// PrismaClientValidationError e la pagina rispondeva con un errore del
// server invece di ignorare semplicemente un filtro inutilizzabile.
//
// PERCHE' QUESTO TEST (e non uno per ognuna delle 4 pagine): tutte e quattro
// usano lo stesso helper condiviso `valoreEnumAmmesso` (src/lib/admin-filtri.ts),
// quindi basta dimostrare qui, end-to-end su una pagina reale, che:
//   1. un valore non ammesso NON fa esplodere il render (nessuna eccezione,
//      nessun redirect di errore);
//   2. la query a Prisma parte comunque, con un `where.stato` assente
//      (equivalente a "tutti" i posti, non "nessun posto");
//   3. un valore ammesso invece filtra davvero (test di non regressione).
//
// La pagina e' un Server Component: viene invocata direttamente come una
// normale funzione async (non renderizzata via ReactDOM), che e' sufficiente
// per eseguire tutta la logica di query prima del `return` JSX.

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  prisma: {
    sala: { findMany: vi.fn() },
    posto: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/prisma", () => ({ default: mocks.prisma }));

const admin = {
  id: "admin-1",
  email: "admin@biblioflow.test",
  ruolo: "ADMIN",
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ user: admin });
  mocks.prisma.sala.findMany.mockResolvedValue([]);
  mocks.prisma.posto.findMany.mockResolvedValue([]);
  mocks.prisma.posto.count.mockResolvedValue(0);
});

describe("GET /admin/posti — filtro ?stato non validato", () => {
  it("[TC-ADMIN-ENUM-001] un valore fuori dall'enum non fa esplodere la pagina e ignora il filtro", async () => {
    const { default: AdminPostiPage } = await import("@/app/admin/posti/page");

    // Non deve lanciare (prima: PrismaClientValidationError propagata dal
    // mock, qui riprodotta lasciando che sia lo `stato` grezzo ad arrivare
    // al `where` se il fix non fosse applicato).
    await expect(
      AdminPostiPage({ searchParams: Promise.resolve({ stato: "PIPPO" }) })
    ).resolves.toBeTruthy();

    expect(mocks.prisma.posto.findMany).toHaveBeenCalledTimes(1);
    const { where } = mocks.prisma.posto.findMany.mock.calls[0][0];
    expect(where.stato).toBeUndefined();
  });

  it("[TC-ADMIN-ENUM-002] un valore ammesso dell'enum continua a filtrare davvero", async () => {
    const { default: AdminPostiPage } = await import("@/app/admin/posti/page");

    await AdminPostiPage({ searchParams: Promise.resolve({ stato: "MANUTENZIONE" }) });

    const { where } = mocks.prisma.posto.findMany.mock.calls[0][0];
    expect(where.stato).toBe("MANUTENZIONE");
  });

  it("[TC-ADMIN-ENUM-003] il sentinel \"tutti\" usato dai filtri resta equivalente a nessun filtro", async () => {
    const { default: AdminPostiPage } = await import("@/app/admin/posti/page");

    await AdminPostiPage({ searchParams: Promise.resolve({ stato: "tutti" }) });

    const { where } = mocks.prisma.posto.findMany.mock.calls[0][0];
    expect(where.stato).toBeUndefined();
  });
});
