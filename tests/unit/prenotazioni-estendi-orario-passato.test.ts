/**
 * Test di regressione per `GET`/`POST /api/prenotazioni/[id]/estendi`.
 *
 * DIFETTO VISTO IN COLLAUDO (estendi-blocca-prenotazioni-gia-iniziate): la
 * route passava l'oraInizio ORIGINALE della prenotazione a
 * validaPrenotazione/validaIntervallo senza mai impostare
 * `permettiOrarioPassato: true`. Per qualunque prenotazione di OGGI il cui
 * orario di inizio fosse ormai nel passato — compreso lo stato CHECK_IN,
 * cioè il caso d'uso PRINCIPALE della funzione (si estende mentre si
 * studia, con la sessione gia' iniziata) — `validaIntervallo` lanciava
 * sempre `ORARIO_NEL_PASSATO`, bloccando l'estensione.
 *
 * `@/lib/prenotazioni-service` NON e' mockato qui: si esercita la
 * validazione REALE, cosi' questo test avrebbe fallito prima della
 * correzione (route senza `permettiOrarioPassato: true`) e passa dopo.
 *
 * L'orologio del server e' congelato con i fake timers di vitest, in UTC
 * (`TZ=UTC` come su Vercel — vedi vitest.config.mts) su un orario in cui
 * Roma e' in ora legale (CEST, +2h): serve a dimostrare che il confronto
 * usa davvero il fuso Europe/Rome (dataCorrenteBiblioteca/
 * minutiCorrentiBiblioteca in prenotazioni-regole.ts) e non un offset fisso.
 */
import { NextRequest } from "next/server";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// PRINCIPIO GUIDA PER IL TEMPO: i test legati agli orari devono girare con
// process.env.TZ="UTC" (come il server su Vercel), non con l'ora legale del
// fuso del chi esegue i test — altrimenti un test scritto/lanciato con
// TZ=Europe/Rome potrebbe risultare verde per caso, mascherando un offset
// fisso sbagliato. Ripristinato in `afterAll` per non alterare il fuso degli
// altri file di test eseguiti nello stesso worker vitest.
const TZ_ORIGINALE = process.env.TZ;
beforeAll(() => {
  process.env.TZ = "UTC";
});
afterAll(() => {
  process.env.TZ = TZ_ORIGINALE;
});

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
    assertOwnership: vi.fn(),
    prisma: {
      prenotazione: { findUnique: vi.fn(), findMany: vi.fn() },
      $transaction: vi.fn(),
    },
  };
});

vi.mock("@/lib/auth", () => ({
  AuthError: mocks.MockAuthError,
  requireUser: mocks.requireUser,
  assertOwnership: mocks.assertOwnership,
}));
vi.mock("@/lib/prisma", () => ({ default: mocks.prisma, prisma: mocks.prisma }));

type Route = typeof import("@/app/api/prenotazioni/[id]/estendi/route");
let route: Route;

const user = { id: "studente-est-1", ruolo: "STUDENTE" as const };

const sala = {
  id: "sala-est-1",
  nome: "Sala Studio",
  piano: 1,
  orarioApertura: "08:00",
  orarioChiusura: "22:00",
  attiva: true,
};

const posto = {
  id: "posto-est-1",
  numero: "B12",
  attivo: true,
  stato: "OCCUPATO",
  sala,
};

// Prenotazione di OGGI — martedi' 2030-06-11 (non domenica, non festivita',
// vedi src/lib/calendario-biblioteca.ts) — iniziata alle 10:00 di Roma e con
// CHECK_IN gia' fatto: e' il caso d'uso principale dell'estensione ("sto
// gia' studiando, voglio restare di piu'").
function prenotazioneOngoing() {
  return {
    id: "pren-est-1",
    userId: user.id,
    postoId: posto.id,
    data: new Date("2030-06-11T00:00:00.000Z"),
    oraInizio: new Date("1970-01-01T10:00:00.000Z"),
    oraFine: new Date("1970-01-01T13:00:00.000Z"),
    stato: "CHECK_IN",
    posto,
  };
}

// 09:30 UTC = 11:30 di Roma in giugno (CEST, +2h): la sessione (iniziata
// alle 10:00 di Roma) e' quindi in corso da 1h30, non alle 09:30 "UTC preso
// per Roma" (+2h di differenza) che il vecchio bug di fuso avrebbe implicato.
const ADESSO = new Date("2030-06-11T09:30:00.000Z");

function request(url: string, method: "GET" | "POST", body?: unknown) {
  return new NextRequest(url, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
}
const params = { params: Promise.resolve({ id: "pren-est-1" }) };

beforeAll(async () => {
  route = await import("@/app/api/prenotazioni/[id]/estendi/route");
});

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireUser.mockResolvedValue(user);
  mocks.assertOwnership.mockImplementation(
    (resource: { userId: string }, u: { id: string }) => {
      if (resource.userId !== u.id) {
        throw new mocks.MockAuthError(
          403,
          "RISORSA_NON_AUTORIZZATA",
          "L'utente non è proprietario della risorsa",
        );
      }
    },
  );
});

afterEach(() => {
  vi.useRealTimers();
});

describe("estendi-blocca-prenotazioni-gia-iniziate · GET/POST /api/prenotazioni/[id]/estendi", () => {
  it("[TC-EST-001] GET propone uno slot disponibile anche se la sessione e' gia' iniziata (CHECK_IN in corso)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(ADESSO);

    mocks.prisma.prenotazione.findUnique.mockResolvedValue(prenotazioneOngoing());
    mocks.prisma.prenotazione.findMany.mockResolvedValue([]);

    const response = await route.GET(
      request("http://localhost/api/prenotazioni/pren-est-1/estendi", "GET"),
      params,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    // Prima della correzione: OGNI slot proposto risultava disponibile:false
    // (ORARIO_NEL_PASSATO sull'oraInizio originale, 10:00, gia' passata alle
    // 11:30 di Roma) — qui il primo slot (13:00-15:00, dentro il limite
    // delle 8 ore totali) deve invece risultare prenotabile.
    expect(body.data.slotDisponibili.length).toBeGreaterThan(0);
    expect(body.data.slotDisponibili[0].disponibile).toBe(true);
  });

  it("[TC-EST-002] POST estende con successo una prenotazione CHECK_IN gia' iniziata", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(ADESSO);

    const prenotazione = prenotazioneOngoing();
    mocks.prisma.$transaction.mockImplementation(
      async (callback: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          prenotazione: {
            findUnique: vi.fn().mockResolvedValue(prenotazione),
            findMany: vi.fn().mockResolvedValue([]),
            update: vi.fn().mockResolvedValue({
              ...prenotazione,
              oraFine: new Date("1970-01-01T15:00:00.000Z"),
            }),
          },
          logEvento: { create: vi.fn().mockResolvedValue({ id: "log-est-1" }) },
          notifica: { create: vi.fn().mockResolvedValue({ id: "notifica-est-1" }) },
        };
        return callback(tx);
      },
    );

    const response = await route.POST(
      request("http://localhost/api/prenotazioni/pren-est-1/estendi", "POST", {
        nuovaOraFine: "15:00",
      }),
      params,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.nuovaDurataOre).toBe(5); // 10:00 -> 15:00
  });

  it("[TC-EST-003] POST rifiuta comunque un intervallo incoerente (nuova fine prima dell'inizio)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(ADESSO);

    const prenotazione = prenotazioneOngoing();
    mocks.prisma.$transaction.mockImplementation(
      async (callback: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          prenotazione: {
            findUnique: vi.fn().mockResolvedValue(prenotazione),
            findMany: vi.fn().mockResolvedValue([]),
            update: vi.fn(),
          },
          logEvento: { create: vi.fn() },
          notifica: { create: vi.fn() },
        };
        return callback(tx);
      },
    );

    const response = await route.POST(
      request("http://localhost/api/prenotazioni/pren-est-1/estendi", "POST", {
        nuovaOraFine: "09:00", // prima dell'oraInizio (10:00): resta un errore.
      }),
      params,
    );

    // permettiOrarioPassato disattiva SOLO il controllo "gia' iniziato": le
    // altre regole (qui INTERVALLO_NON_VALIDO) restano attive.
    expect(response.status).toBe(422);
  });
});
