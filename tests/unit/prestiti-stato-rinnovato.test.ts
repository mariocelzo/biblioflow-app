/**
 * Test di integrita' dei dati sullo stato `RINNOVATO` dei prestiti.
 *
 * COSA verifica: un prestito RINNOVATO e' a tutti gli effetti un prestito in
 * corso, quindi deve essere trattato come ATTIVO da tutti i controlli:
 *  - secondo rinnovo (il tetto maxRinnovi = 2 deve essere raggiungibile);
 *  - anti-duplicato sullo stesso libro;
 *  - tetto dei 5 prestiti contemporanei;
 *  - calcolo di scaduto / in scadenza.
 *
 * PERCHE': il rinnovo scriveva `stato: "RINNOVATO"` mentre tutta la logica a
 * valle filtrava su `stato: "ATTIVO"`. Conseguenze concrete:
 *  1. il secondo rinnovo veniva sempre rifiutato, rendendo irraggiungibile
 *     maxRinnovi = 2;
 *  2. l'anti-duplicato non vedeva il prestito rinnovato, cosi' lo stesso utente
 *     poteva prendere in prestito DUE VOLTE lo stesso libro decrementando
 *     `copieDisponibili` due volte;
 *  3. il tetto dei 5 prestiti si sfondava semplicemente rinnovando.
 *
 * SCELTA: si mantiene lo stato RINNOVATO (informazione gia' usata dalla UI, che
 * filtra su ["ATTIVO", "RINNOVATO"] in src/app/prestiti/page.tsx e offre il
 * filtro "Rinnovato" in area admin) e si allineano TUTTI i filtri lato server.
 *
 * I mock di `findFirst`/`count` simulano un piccolo database in memoria, cosi'
 * il test osserva il COMPORTAMENTO dell'endpoint e non la forma della query.
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
      prestito: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      libro: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
      user: { findUnique: vi.fn() },
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
    throw new mocks.MockAuthError(404, "RISORSA_NON_TROVATA", "non trovata");
  },
}));
vi.mock("@/lib/prisma", () => ({ default: mocks.prisma, prisma: mocks.prisma }));
vi.mock("@/lib/rate-limit", () => ({
  readApiRateLimiter: vi.fn(async () => null),
  loanRequestRateLimiter: vi.fn(async () => null),
}));

type CollectionRoute = typeof import("@/app/api/prestiti/route");
type DetailRoute = typeof import("@/app/api/prestiti/[id]/route");
type RenewRoute = typeof import("@/app/api/prestiti/[id]/rinnova/route");
let collectionRoute: CollectionRoute;
let detailRoute: DetailRoute;
let renewRoute: RenewRoute;

const studente = { id: "studente-1", ruolo: "STUDENTE" as const };

interface PrestitoFinto {
  id: string;
  userId: string;
  libroId: string;
  stato: string;
  rinnovi: number;
  maxRinnovi: number;
  dataScadenza: Date;
  libro: { id: string; titolo: string; autore: string };
}

function prestitoFinto(over: Partial<PrestitoFinto> = {}): PrestitoFinto {
  return {
    id: "prestito-1",
    userId: studente.id,
    libroId: "libro-1",
    stato: "ATTIVO",
    rinnovi: 0,
    maxRinnovi: 2,
    dataScadenza: new Date("2030-07-01T00:00:00.000Z"),
    libro: { id: "libro-1", titolo: "Il nome della rosa", autore: "Eco" },
    ...over,
  };
}

// Database in memoria usato dai mock di findFirst/count.
let db: PrestitoFinto[] = [];

// Riproduce la semantica Prisma per il filtro `stato`, che puo' essere una
// stringa oppure `{ in: [...] }`. Cosi' il test resta valido con entrambe le
// forme e misura il risultato, non l'implementazione.
function statoCorrisponde(filtro: unknown, stato: string): boolean {
  if (filtro === undefined) return true;
  if (typeof filtro === "string") return filtro === stato;
  if (filtro && typeof filtro === "object" && Array.isArray((filtro as { in?: unknown }).in)) {
    return ((filtro as { in: string[] }).in).includes(stato);
  }
  return false;
}

function filtra(where: Record<string, unknown> = {}) {
  return db.filter(
    (p) =>
      (where.userId === undefined || where.userId === p.userId) &&
      (where.libroId === undefined || where.libroId === p.libroId) &&
      statoCorrisponde(where.stato, p.stato),
  );
}

function creaRequest(body: unknown, url = "http://localhost/api/prestiti") {
  return new NextRequest(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
const paramsPrestito = { params: Promise.resolve({ id: "prestito-1" }) };

const tx = {
  prestito: { update: mocks.prisma.prestito.update, create: mocks.prisma.prestito.create },
  libro: { update: mocks.prisma.libro.update, updateMany: mocks.prisma.libro.updateMany },
};

beforeAll(async () => {
  collectionRoute = await import("@/app/api/prestiti/route");
  detailRoute = await import("@/app/api/prestiti/[id]/route");
  renewRoute = await import("@/app/api/prestiti/[id]/rinnova/route");
});

beforeEach(() => {
  vi.resetAllMocks();
  db = [];
  mocks.requireUser.mockResolvedValue(studente);
  mocks.prisma.user.findUnique.mockResolvedValue({ id: studente.id });
  mocks.prisma.libro.findUnique.mockResolvedValue({
    id: "libro-1",
    titolo: "Il nome della rosa",
    copieDisponibili: 3,
  });
  mocks.prisma.libro.update.mockResolvedValue({ id: "libro-1" });
  // Decremento condizionato (fix corsa critica su copieDisponibili): di
  // default c'e' sempre una copia da decrementare.
  mocks.prisma.libro.updateMany.mockResolvedValue({ count: 1 });
  mocks.prisma.prestito.findFirst.mockImplementation(
    async ({ where }: { where: Record<string, unknown> }) => filtra(where)[0] ?? null,
  );
  mocks.prisma.prestito.count.mockImplementation(
    async ({ where }: { where: Record<string, unknown> }) => filtra(where).length,
  );
  mocks.prisma.prestito.create.mockImplementation(
    async ({ data }: { data: Record<string, unknown> }) => ({ id: "nuovo", ...data }),
  );
  mocks.prisma.prestito.update.mockImplementation(
    async ({ data }: { data: Record<string, unknown> }) => ({ ...prestitoFinto(), ...data }),
  );
  mocks.prisma.logEvento.create.mockResolvedValue({ id: "log-1" });
  mocks.prisma.notifica.create.mockResolvedValue({ id: "notifica-1" });
  mocks.prisma.$transaction.mockImplementation(
    async (cb: (client: typeof tx) => Promise<unknown>) => cb(tx),
  );
});

describe("Integrita' dati - un prestito RINNOVATO e' ancora un prestito in corso", () => {
  it("[TC-INT-RINN-001] il secondo rinnovo e' consentito: maxRinnovi = 2 e' raggiungibile", async () => {
    // Dopo il primo rinnovo lo stato e' RINNOVATO e rinnovi = 1.
    mocks.prisma.prestito.findUnique.mockResolvedValue(
      prestitoFinto({ stato: "RINNOVATO", rinnovi: 1 }),
    );

    const response = await renewRoute.POST(
      creaRequest({}, "http://localhost/api/prestiti/prestito-1/rinnova"),
      paramsPrestito,
    );

    expect(response.status).toBe(200);
    expect(mocks.prisma.prestito.update).toHaveBeenCalledTimes(1);
  });

  it("[TC-INT-RINN-002] esaurito il tetto dei rinnovi il terzo tentativo e' respinto", async () => {
    // Non deve trasformarsi in un rinnovo illimitato: rinnovi = 2 = maxRinnovi.
    mocks.prisma.prestito.findUnique.mockResolvedValue(
      prestitoFinto({ stato: "RINNOVATO", rinnovi: 2 }),
    );

    const response = await renewRoute.POST(
      creaRequest({}, "http://localhost/api/prestiti/prestito-1/rinnova"),
      paramsPrestito,
    );

    expect(response.status).toBe(400);
    expect(mocks.prisma.prestito.update).not.toHaveBeenCalled();
  });

  it("[TC-INT-RINN-003] un prestito RESTITUITO non puo' essere rinnovato", async () => {
    mocks.prisma.prestito.findUnique.mockResolvedValue(
      prestitoFinto({ stato: "RESTITUITO", rinnovi: 0 }),
    );

    const response = await renewRoute.POST(
      creaRequest({}, "http://localhost/api/prestiti/prestito-1/rinnova"),
      paramsPrestito,
    );

    expect(response.status).toBe(400);
    expect(mocks.prisma.prestito.update).not.toHaveBeenCalled();
  });

  it("[TC-INT-RINN-004] anche la PATCH rinnova accetta un prestito RINNOVATO", async () => {
    mocks.prisma.prestito.findUnique.mockResolvedValue(
      prestitoFinto({ stato: "RINNOVATO", rinnovi: 1 }),
    );

    const response = await detailRoute.PATCH(
      new NextRequest("http://localhost/api/prestiti/prestito-1", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ azione: "rinnova" }),
      }),
      paramsPrestito,
    );

    expect(response.status).toBe(200);
  });

  it("[TC-INT-RINN-004b] la PATCH rinnova estende di 14 giorni, non 30 (allineata a POST .../rinnova e al testo mostrato in UI)", async () => {
    // DIFETTO VERIFICATO: PATCH /api/prestiti/[id] (azione "rinnova") estendeva
    // di 30 giorni, mentre POST /api/prestiti/[id]/rinnova — l'endpoint che la
    // UI chiama davvero — estende di 14, coerente col testo del dialog di
    // conferma ("Il prestito sarà esteso di 14 giorni dalla data attuale").
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2030-01-01T00:00:00.000Z"));

    mocks.prisma.prestito.findUnique.mockResolvedValue(
      prestitoFinto({ stato: "ATTIVO", rinnovi: 0 }),
    );

    const response = await detailRoute.PATCH(
      new NextRequest("http://localhost/api/prestiti/prestito-1", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ azione: "rinnova" }),
      }),
      paramsPrestito,
    );

    expect(response.status).toBe(200);
    const chiamata = mocks.prisma.prestito.update.mock.calls[0][0] as {
      data: { dataScadenza: Date };
    };
    expect(chiamata.data.dataScadenza).toEqual(new Date("2030-01-15T00:00:00.000Z"));

    vi.useRealTimers();
  });

  it("[TC-INT-RINN-005] l'anti-duplicato vede il prestito RINNOVATO: niente doppio prestito dello stesso libro", async () => {
    // Scenario del difetto: l'utente rinnova, poi richiede di nuovo lo stesso
    // libro; senza il fix nasce un secondo prestito e copieDisponibili viene
    // decrementato due volte per un unico volume in mano allo stesso utente.
    db = [prestitoFinto({ stato: "RINNOVATO", rinnovi: 1 })];

    const response = await collectionRoute.POST(creaRequest({ libroId: "libro-1" }));

    expect(response.status).toBe(409);
    expect(mocks.prisma.prestito.create).not.toHaveBeenCalled();
    expect(mocks.prisma.libro.update).not.toHaveBeenCalled();
  });

  it("[TC-INT-RINN-006] il tetto di 5 prestiti conta anche i RINNOVATO", async () => {
    // Cinque prestiti in corso su libri diversi, tutti gia' rinnovati: il sesto
    // deve essere rifiutato, altrimenti il limite si sfonda rinnovando.
    db = [1, 2, 3, 4, 5].map((n) =>
      prestitoFinto({ id: `prestito-${n}`, libroId: `libro-${n}`, stato: "RINNOVATO", rinnovi: 1 }),
    );

    const response = await collectionRoute.POST(creaRequest({ libroId: "libro-99" }));

    expect(response.status).toBe(409);
    const payload = (await response.json()) as { error: string };
    expect(payload.error).toContain("limite massimo di 5 prestiti");
    expect(mocks.prisma.prestito.create).not.toHaveBeenCalled();
  });

  it("[TC-INT-RINN-007] un prestito RESTITUITO non blocca un nuovo prestito dello stesso libro", async () => {
    // Contro-prova: il fix non deve rendere impossibile ri-prendere un libro
    // gia' restituito in passato.
    db = [prestitoFinto({ stato: "RESTITUITO" })];

    const response = await collectionRoute.POST(creaRequest({ libroId: "libro-1" }));

    expect(response.status).toBe(201);
    expect(mocks.prisma.prestito.create).toHaveBeenCalledTimes(1);
  });

  it("[TC-INT-RINN-008] la GET marca come scaduto anche un prestito RINNOVATO oltre la scadenza", async () => {
    // Un rinnovato in ritardo non deve sparire dai solleciti.
    mocks.prisma.prestito.findMany.mockResolvedValue([
      prestitoFinto({
        stato: "RINNOVATO",
        rinnovi: 1,
        dataScadenza: new Date("2020-01-01T00:00:00.000Z"),
      }),
    ]);

    const response = await collectionRoute.GET(
      new NextRequest("http://localhost/api/prestiti", { method: "GET" }),
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as { data: Array<{ isScaduto: boolean }> };
    expect(payload.data[0].isScaduto).toBe(true);
  });
});
