import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest } from "next/server";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const prisma = {
    user: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    prestito: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      groupBy: vi.fn(),
      update: vi.fn(),
    },
    prenotazione: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      groupBy: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    posto: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    libro: {
      findMany: vi.fn(),
    },
    logEvento: {
      count: vi.fn(),
      create: vi.fn(),
    },
    notifica: {
      create: vi.fn(),
    },
  };

  return {
    auth: vi.fn(),
    prisma,
  };
});

vi.mock("@/lib/auth", () => ({
  auth: mocks.auth,
}));

vi.mock("@/lib/prisma", () => ({
  default: mocks.prisma,
  prisma: mocks.prisma,
}));

type UsersRoute = typeof import("@/app/api/admin/utenti/[id]/route");
type LoansRoute = typeof import("@/app/api/admin/prestiti/route");
type AdminReservationsRoute = typeof import("@/app/api/admin/prenotazioni/route");
type StatisticsRoute = typeof import("@/app/api/admin/statistiche/route");
type ReservationsRoute = typeof import("@/app/api/prenotazioni/route");
type Middleware = typeof import("@/middleware");

let usersRoute: UsersRoute;
let loansRoute: LoansRoute;
let adminReservationsRoute: AdminReservationsRoute;
let statisticsRoute: StatisticsRoute;
let reservationsRoute: ReservationsRoute;
let appMiddleware: Middleware;

const admin = {
  id: "pre-admin",
  email: "admin@biblioflow.test",
  ruolo: "ADMIN",
};

const librarian = {
  id: "pre-bibliotecario",
  email: "bibliotecario@biblioflow.test",
  ruolo: "BIBLIOTECARIO",
};

const student = {
  id: "pre-studente",
  email: "studente@biblioflow.test",
  nome: "Studente",
  cognome: "Baseline",
  ruolo: "STUDENTE",
};

const seat = {
  id: "pre-posto-ui",
  numero: "A1",
  stato: "DISPONIBILE",
  sala: {
    id: "pre-sala-ui",
    nome: "Sala UI",
    piano: 1,
    orarioApertura: "08:00",
    orarioChiusura: "18:00",
  },
};

function request(
  url: string,
  method: "GET" | "POST" | "PATCH" = "GET",
  body?: object,
  cookie?: string,
) {
  return new NextRequest(url, {
    method,
    headers: {
      ...(body ? { "content-type": "application/json" } : {}),
      ...(cookie ? { cookie } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

function sessionFor(user: typeof admin | typeof librarian | typeof student) {
  mocks.auth.mockResolvedValue({ user });
}

beforeAll(async () => {
  usersRoute = await import("@/app/api/admin/utenti/[id]/route");
  loansRoute = await import("@/app/api/admin/prestiti/route");
  adminReservationsRoute = await import("@/app/api/admin/prenotazioni/route");
  statisticsRoute = await import("@/app/api/admin/statistiche/route");
  reservationsRoute = await import("@/app/api/prenotazioni/route");
  appMiddleware = await import("@/middleware");
});

beforeEach(() => {
  vi.resetAllMocks();
});

describe("autorizzazione admin e UI pre-modifica", () => {
  it("[TC-PRE-014] reindirizza una pagina protetta anonima al login", () => {
    const response = appMiddleware.middleware(
      request("http://localhost/admin/prenotazioni"),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost/login?callbackUrl=%2Fadmin%2Fprenotazioni",
    );
  });

  it("[TC-PRE-015] rifiuta una API protetta anonima con 401", async () => {
    const response = appMiddleware.middleware(
      request("http://localhost/api/admin/statistiche?tipo=tasso-noshow"),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: "Non autenticato",
    });
  });

  it("[TC-PRE-016] lascia proseguire la UI prenotazione con cookie di sessione", () => {
    const response = appMiddleware.middleware(
      request(
        "http://localhost/prenota",
        "GET",
        undefined,
        "authjs.session-token=token-baseline",
      ),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("[TC-PRE-017] rifiuta uno studente sulle statistiche admin", async () => {
    sessionFor(student);

    const response = await statisticsRoute.GET(
      request("http://localhost/api/admin/statistiche?tipo=tasso-noshow"),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Accesso negato" });
    expect(mocks.prisma.prenotazione.groupBy).not.toHaveBeenCalled();
  });

  it("[TC-PRE-018] rifiuta un bibliotecario nella modifica dello stato utente", async () => {
    sessionFor(librarian);

    const response = await usersRoute.PATCH(
      request(
        `http://localhost/api/admin/utenti/${student.id}`,
        "PATCH",
        { attivo: false },
      ),
      { params: Promise.resolve({ id: student.id }) },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Solo gli amministratori possono modificare gli utenti",
    });
    expect(mocks.prisma.user.update).not.toHaveBeenCalled();
  });
});

describe("funzioni area admin pre-modifica", () => {
  it("[TC-PRE-019] restituisce a un bibliotecario dettagli e statistiche utente", async () => {
    sessionFor(librarian);
    mocks.prisma.user.findUnique.mockResolvedValue({
      ...student,
      prenotazioni: [],
      prestiti: [],
      _count: { prenotazioni: 4, prestiti: 2, notifiche: 1 },
    });
    mocks.prisma.logEvento.count.mockResolvedValue(1);

    const response = await usersRoute.GET(
      request(`http://localhost/api/admin/utenti/${student.id}`),
      { params: Promise.resolve({ id: student.id }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      utente: { id: student.id },
      statistiche: {
        totalePrenotazioni: 4,
        totalePrestiti: 2,
        noShow: 1,
      },
    });
  });

  it("[TC-PRE-020] registra la restituzione di un prestito dall'area admin", async () => {
    sessionFor(admin);
    const loan = {
      id: "pre-prestito",
      stato: "ATTIVO",
      dataScadenza: new Date(Date.now() + 86_400_000),
      user: student,
      libro: { id: "pre-libro", titolo: "Libro baseline" },
    };
    mocks.prisma.prestito.findUnique.mockResolvedValue(loan);
    mocks.prisma.prestito.update.mockResolvedValue({
      ...loan,
      stato: "RESTITUITO",
    });
    mocks.prisma.logEvento.create.mockResolvedValue({ id: "pre-log-prestito" });
    mocks.prisma.notifica.create.mockResolvedValue({ id: "pre-notifica-prestito" });

    const response = await loansRoute.POST(
      request("http://localhost/api/admin/prestiti", "POST", {
        azione: "RESTITUISCI",
        prestitoId: loan.id,
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      message: "Prestito restituito",
      giorniRitardo: 0,
    });
    expect(mocks.prisma.prestito.update).toHaveBeenCalledWith({
      where: { id: loan.id },
      data: {
        stato: "RESTITUITO",
        dataRestituzione: expect.any(Date),
      },
    });
  });

  it("[TC-PRE-021] cancella una prenotazione e libera il posto dall'area admin", async () => {
    sessionFor(librarian);
    const reservation = {
      id: "pre-prenotazione-admin",
      userId: student.id,
      postoId: seat.id,
      data: new Date("2030-01-15T00:00:00.000Z"),
      stato: "CHECK_IN",
      user: student,
      posto: { ...seat, stato: "OCCUPATO" },
    };
    mocks.prisma.prenotazione.findUnique.mockResolvedValue(reservation);
    mocks.prisma.prenotazione.update.mockResolvedValue({
      ...reservation,
      stato: "CANCELLATA",
    });
    mocks.prisma.posto.update.mockResolvedValue({ ...seat, stato: "DISPONIBILE" });
    mocks.prisma.logEvento.create.mockResolvedValue({ id: "pre-log-prenotazione" });
    mocks.prisma.notifica.create.mockResolvedValue({ id: "pre-notifica-prenotazione" });

    const response = await adminReservationsRoute.POST(
      request("http://localhost/api/admin/prenotazioni", "POST", {
        azione: "ANNULLA_SINGOLA",
        prenotazioneId: reservation.id,
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.prisma.prenotazione.update).toHaveBeenCalledWith({
      where: { id: reservation.id },
      data: { stato: "CANCELLATA" },
    });
    expect(mocks.prisma.posto.update).toHaveBeenCalledWith({
      where: { id: seat.id },
      data: { stato: "DISPONIBILE" },
    });
  });

  it("[TC-PRE-022] calcola la distribuzione del tasso no-show", async () => {
    sessionFor(librarian);
    mocks.prisma.prenotazione.groupBy.mockResolvedValue([
      { stato: "NO_SHOW", _count: { id: 2 } },
      { stato: "COMPLETATA", _count: { id: 6 } },
      { stato: "CANCELLATA", _count: { id: 2 } },
    ]);

    const response = await statisticsRoute.GET(
      request("http://localhost/api/admin/statistiche?tipo=tasso-noshow"),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: [
        { nome: "No-show", valore: 2, percentuale: "20.0" },
        { nome: "Completate", valore: 6, percentuale: "60.0" },
        { nome: "Altre", valore: 2, percentuale: "20.0" },
      ],
    });
  });
});

describe("flusso prenotazione UI pre-modifica", () => {
  it("[TC-PRE-023] mantiene il contratto del payload inviato dalla pagina prenota", async () => {
    const source = await readFile(
      path.resolve(process.cwd(), "src", "app", "prenota", "page.tsx"),
      "utf8",
    );

    expect(source).toContain('fetch("/api/prenotazioni"');
    expect(source).toMatch(/userId:\s*session\.user\.id/);
    expect(source).toMatch(/postoId:\s*postoSelezionato\.id/);
    expect(source).toMatch(/data:\s*dataPrenotazione/);
    expect(source).toMatch(/oraInizio,\s*\r?\n\s*oraFine/);
    expect(source).toMatch(/marginePendolare:\s*isPendolare\s*&&\s*marginePendolare/);
  });

  it("[TC-PRE-024] crea la prenotazione con il payload prodotto dalla UI", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(student);
    mocks.prisma.posto.findUnique.mockResolvedValue(seat);
    mocks.prisma.prenotazione.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    mocks.prisma.prenotazione.create.mockResolvedValue({
      id: "pre-prenotazione-ui",
      userId: student.id,
      postoId: seat.id,
      data: new Date("2030-01-15T00:00:00.000Z"),
      oraInizio: new Date("1970-01-01T09:00:00.000Z"),
      oraFine: new Date("1970-01-01T11:00:00.000Z"),
      stato: "CONFERMATA",
      user: student,
      posto: seat,
    });
    mocks.prisma.logEvento.create.mockResolvedValue({ id: "pre-log-ui" });
    mocks.prisma.notifica.create.mockResolvedValue({ id: "pre-notifica-ui" });

    const response = await reservationsRoute.POST(
      request("http://localhost/api/prenotazioni", "POST", {
        userId: student.id,
        postoId: seat.id,
        data: "2030-01-15",
        oraInizio: "09:00",
        oraFine: "11:00",
        marginePendolare: false,
      }),
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: { id: "pre-prenotazione-ui", stato: "CONFERMATA" },
    });
  });
});
