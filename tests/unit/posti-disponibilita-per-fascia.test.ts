/**
 * Test unitari — GET /api/posti: disponibilità PER FASCIA, non per stato
 * globale "adesso".
 *
 * 🐞 DIFETTO VERIFICATO IN PRODUZIONE: `disponibile` (e lo `stato` restituito
 * al client) dipendevano anche da `posto.stato === "DISPONIBILE"`, cioè dallo
 * stato GLOBALE del posto — "occupato adesso", non "occupato nella fascia
 * richiesta". Un posto con check-in mai chiuso (`Posto.stato = OCCUPATO`)
 * risultava quindi non prenotabile per QUALUNQUE data/fascia futura, anche a
 * mesi di distanza dalla prenotazione che lo occupava (prova in produzione:
 * prenotazioni seed `cmk465flx003z9syqorot22uf` / `cmk465fm200489syqd5ezucdh`,
 * posto A1 bloccato da gennaio 2026 — vedi src/lib/automation-service.ts,
 * `completaPrenotazioniCheckInScaduto`, per la correzione a monte).
 *
 * CORREZIONE: per una fascia specifica, la disponibilità dipende SOLO da:
 *  - le prenotazioni CONFERMATA/CHECK_IN che si sovrappongono alla fascia
 *    richiesta (query esistente, invariata);
 *  - gli stati "assoluti" impostati a mano dallo staff che rendono il posto
 *    inutilizzabile a prescindere dalla fascia: MANUTENZIONE e RISERVATO.
 * Lo stato globale OCCUPATO (check-in in corso "adesso", non nella fascia
 * richiesta) NON blocca più una fascia diversa da quella occupata.
 *
 * Strategia: si isola la route da Prisma e dall'autenticazione, così si
 * verifica solo il *contratto* — nessuna query reale, nessun DB.
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
      posto: { findMany: vi.fn() },
      $queryRaw: vi.fn(),
    },
  };
});

vi.mock("@/lib/auth", () => ({
  AuthError: mocks.MockAuthError,
  requireUser: mocks.requireUser,
}));
vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));

type Route = typeof import("@/app/api/posti/route");
let route: Route;

/** Un solo posto A1 nella sala di test, con lo `stato` globale indicato. */
function postoConStato(stato: string) {
  return [
    {
      id: "posto-a1",
      numero: "A1",
      stato,
      salaId: "sala-1",
      sala: { id: "sala-1", nome: "Sala Studio" },
    },
  ];
}

function request(query: string) {
  return new NextRequest(`http://localhost/api/posti?${query}`);
}

const FASCIA = "data=2026-09-27&oraInizio=09:00&oraFine=11:00";

beforeAll(async () => {
  route = await import("@/app/api/posti/route");
});

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireUser.mockResolvedValue({ id: "utente-1", ruolo: "STUDENTE" });
  // Default neutro: nessuna prenotazione sovrapposta sul posto (i singoli
  // test lo sovrascrivono quando serve verificare una sovrapposizione).
  mocks.prisma.$queryRaw.mockResolvedValue([]);
});

describe("GET /api/posti — disponibilità per fascia (non per stato globale)", () => {
  it("un posto globalmente OCCUPATO (check-in mai chiuso) risulta prenotabile per una fascia futura senza sovrapposizioni", async () => {
    mocks.prisma.posto.findMany.mockResolvedValue(postoConStato("OCCUPATO"));
    mocks.prisma.$queryRaw.mockResolvedValue([]); // nessuna prenotazione sovrapposta alla fascia richiesta

    const response = await route.GET(request(FASCIA));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data).toHaveLength(1);
    expect(payload.data[0].disponibile).toBe(true);
    expect(payload.data[0].stato).toBe("DISPONIBILE");
  });

  it("un posto globalmente OCCUPATO con una prenotazione CHECK_IN/CONFERMATA sovrapposta alla fascia richiesta resta occupato per quella fascia", async () => {
    mocks.prisma.posto.findMany.mockResolvedValue(postoConStato("OCCUPATO"));
    mocks.prisma.$queryRaw.mockResolvedValue([
      {
        postoId: "posto-a1",
        oraInizio: new Date("1970-01-01T08:00:00.000Z"),
        oraFine: new Date("1970-01-01T12:00:00.000Z"),
      },
    ]);

    const response = await route.GET(request(FASCIA));
    const payload = await response.json();

    expect(payload.data[0].disponibile).toBe(false);
    expect(payload.data[0].stato).toBe("OCCUPATO");
  });

  it("un posto in MANUTENZIONE non è mai prenotabile, anche senza sovrapposizioni", async () => {
    mocks.prisma.posto.findMany.mockResolvedValue(postoConStato("MANUTENZIONE"));
    mocks.prisma.$queryRaw.mockResolvedValue([]);

    const response = await route.GET(request(FASCIA));
    const payload = await response.json();

    expect(payload.data[0].disponibile).toBe(false);
    expect(payload.data[0].stato).toBe("MANUTENZIONE");
  });

  it("un posto RISERVATO dallo staff non è mai prenotabile, anche senza sovrapposizioni", async () => {
    mocks.prisma.posto.findMany.mockResolvedValue(postoConStato("RISERVATO"));
    mocks.prisma.$queryRaw.mockResolvedValue([]);

    const response = await route.GET(request(FASCIA));
    const payload = await response.json();

    expect(payload.data[0].disponibile).toBe(false);
    expect(payload.data[0].stato).toBe("RISERVATO");
  });

  it("un posto già DISPONIBILE globalmente e senza sovrapposizioni resta prenotabile (non regressione)", async () => {
    mocks.prisma.posto.findMany.mockResolvedValue(postoConStato("DISPONIBILE"));
    mocks.prisma.$queryRaw.mockResolvedValue([]);

    const response = await route.GET(request(FASCIA));
    const payload = await response.json();

    expect(payload.data[0].disponibile).toBe(true);
    expect(payload.data[0].stato).toBe("DISPONIBILE");
  });
});
