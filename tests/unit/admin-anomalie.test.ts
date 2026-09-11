// ============================================================================
// Test di POST /api/admin/anomalie (rilievi #1 e #3 dell'audit)
// ============================================================================
// COSA: due difetti nella stessa route.
//
// Rilievo #3 - SOLLECITA_PRESTITI_SCADUTI filtrava su `stato: "SCADUTO"`, ma
// nessun punto del codice scrive mai quello stato (e' un valore dell'enum
// mai usato in una `update`/`create`): il bibliotecario premeva il bottone
// con decine di prestiti in ritardo a video e leggeva "Inviati 0 solleciti".
// La scadenza va calcolata sullo stato reale (ATTIVO/RINNOVATO) confrontato
// con `dataScadenza`.
//
// Rilievo #1 (meta') - Il bottone "Alert" della dashboard-anomalie-card
// mostrava "Alert inviati" dopo un `setTimeout`, senza nessuna azione reale.
// AVVISA_PRESTITI_IN_SCADENZA e' la nuova azione che lo sostituisce: notifica
// per davvero gli utenti con un prestito che scade entro domani, la stessa
// definizione usata da src/app/admin/page.tsx per calcolare `prestitiInScadenza`.
//
// PERCHE' QUESTI TEST: senza asserire sul `where` passato a Prisma, un mock
// generico continuerebbe a "trovare" prestiti indipendentemente dal filtro
// usato, mascherando la regressione.

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  prisma: {
    logEvento: {
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    notifica: {
      create: vi.fn(),
    },
    prestito: {
      findMany: vi.fn(),
    },
    prenotazione: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
    posto: {
      update: vi.fn(),
    },
    user: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/prisma", () => ({ default: mocks.prisma }));

type AdminAnomalieRoute = typeof import("@/app/api/admin/anomalie/route");

let route: AdminAnomalieRoute;

const bibliotecario = {
  id: "bibliotecario-1",
  email: "bibliotecario@biblioflow.test",
  ruolo: "BIBLIOTECARIO",
};

function request(body: object) {
  return new NextRequest("http://localhost/api/admin/anomalie", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(async () => {
  vi.resetAllMocks();
  route = await import("@/app/api/admin/anomalie/route");
  mocks.auth.mockResolvedValue({ user: bibliotecario });
  mocks.prisma.logEvento.create.mockResolvedValue({ id: "log-1" });
  mocks.prisma.prestito.findMany.mockResolvedValue([]);
  mocks.prisma.notifica.create.mockResolvedValue({ id: "notifica-1" });
});

describe("SOLLECITA_PRESTITI_SCADUTI", () => {
  it("[TC-ANOM-SCADUTI-001] filtra per stato attivo/rinnovato scaduto per data, non per uno stato mai scritto in DB", async () => {
    await route.POST(request({ azione: "SOLLECITA_PRESTITI_SCADUTI" }));

    expect(mocks.prisma.prestito.findMany).toHaveBeenCalledTimes(1);
    const chiamata = mocks.prisma.prestito.findMany.mock.calls[0][0];

    // Il difetto originale: `where: { stato: "SCADUTO" }`. Nessuna riga in
    // tutto il repository scrive mai quello stato, quindi la query tornava
    // sempre vuota. La query corretta guarda i prestiti realmente in corso
    // (ATTIVO o RINNOVATO) la cui scadenza e' nel passato.
    expect(chiamata.where).not.toEqual({ stato: "SCADUTO" });
    expect(chiamata.where.stato).toEqual({ in: ["ATTIVO", "RINNOVATO"] });
    expect(chiamata.where.dataScadenza).toHaveProperty("lt");
    expect(chiamata.where.dataScadenza.lt).toBeInstanceOf(Date);
  });

  it("[TC-ANOM-SCADUTI-002] invia un sollecito per ogni prestito realmente in ritardo trovato", async () => {
    mocks.prisma.prestito.findMany.mockResolvedValue([
      {
        id: "prestito-1",
        userId: "utente-1",
        libro: { titolo: "Il nome della rosa" },
        user: { id: "utente-1" },
      },
      {
        id: "prestito-2",
        userId: "utente-2",
        libro: { titolo: "1984" },
        user: { id: "utente-2" },
      },
    ]);

    const response = await route.POST(request({ azione: "SOLLECITA_PRESTITI_SCADUTI" }));
    const data = await response.json();

    expect(mocks.prisma.notifica.create).toHaveBeenCalledTimes(2);
    expect(data.count).toBe(2);
    expect(data.message).toContain("2");
  });
});

describe("AVVISA_PRESTITI_IN_SCADENZA", () => {
  it("[TC-ANOM-ALERT-001] usa la stessa definizione di 'in scadenza' della dashboard (non ancora restituiti, entro domani)", async () => {
    mocks.prisma.prestito.findMany.mockResolvedValue([]);

    await route.POST(request({ azione: "AVVISA_PRESTITI_IN_SCADENZA" }));

    expect(mocks.prisma.prestito.findMany).toHaveBeenCalledTimes(1);
    const chiamata = mocks.prisma.prestito.findMany.mock.calls[0][0];

    expect(chiamata.where.dataRestituzione).toBeNull();
    expect(chiamata.where.dataScadenza).toHaveProperty("lte");
    expect(chiamata.where.dataScadenza.lte).toBeInstanceOf(Date);
  });

  it("[TC-ANOM-ALERT-002] crea davvero una notifica per ogni utente con un prestito in scadenza (non un successo finto)", async () => {
    mocks.prisma.prestito.findMany.mockResolvedValue([
      { id: "prestito-1", userId: "utente-1", libro: { titolo: "Fahrenheit 451" } },
    ]);

    const response = await route.POST(request({ azione: "AVVISA_PRESTITI_IN_SCADENZA" }));
    const data = await response.json();

    expect(mocks.prisma.notifica.create).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.notifica.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: "utente-1" }),
      })
    );
    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.count).toBe(1);
  });
});
