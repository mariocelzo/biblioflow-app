/**
 * Test di sicurezza per `POST /api/prenotazioni/[id]/check-in` (finding M-2).
 *
 * COSA verifica: un `timestamp` fasullo nel body NON influenza:
 *  - il controllo della finestra "troppo presto / scaduto";
 *  - il valore persistito in `checkInAt`.
 * In entrambi i casi il server usa SEMPRE il proprio orologio (`new Date()`).
 *
 * PERCHÉ: prima `new Date(timestamp ?? Date.now())` permetteva a un client di
 * forzare un check-in fuori orario e di falsare l'istante registrato.
 *
 * L'orologio del server è congelato con i fake timers di vitest.
 *
 * NOTA SUGLI ORARI: `oraInizio` (fixture qui sotto) salva le CIFRE di Roma
 * ("09:00"), non un istante UTC (vedi src/lib/prenotazioni-regole.ts,
 * `valutaFinestraCheckIn`). Il 15 giugno 2030 è in ora legale (CEST, Roma =
 * UTC+2): la finestra "reale" [08:45, 09:00] di Roma corrisponde quindi a
 * [06:45, 07:00] UTC — gli orari di sistema usati sotto sono calcolati con
 * questo offset, MAI con un offset fisso scritto a mano (il test gira con
 * `process.env.TZ` invariato: l'ambiente qui non ha bisogno di forzare UTC
 * perché confronta solo istanti assoluti, non formattazioni locali).
 */
import { NextRequest } from "next/server";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

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
      prenotazione: { findUnique: vi.fn(), update: vi.fn() },
      posto: { update: vi.fn() },
    },
    criticalApiRateLimiter: vi.fn(),
  };
});

vi.mock("@/lib/auth", () => ({
  AuthError: mocks.MockAuthError,
  requireUser: mocks.requireUser,
  assertOwnership: mocks.assertOwnership,
}));
vi.mock("@/lib/prisma", () => ({ default: mocks.prisma, prisma: mocks.prisma }));
// Il rate limiting non e' l'oggetto principale del resto di questo file: si
// mocka per non far scattare 429 con le ripetute chiamate a route.POST nei
// test M-2/Margine Pendolare qui sotto (e' testato a parte, vedi in fondo).
vi.mock("@/lib/rate-limit", () => ({
  criticalApiRateLimiter: mocks.criticalApiRateLimiter,
}));

type Route = typeof import("@/app/api/prenotazioni/[id]/check-in/route");
let route: Route;

const user = { id: "studente-1", ruolo: "STUDENTE" as const };

// Prenotazione con slot 09:00–11:00 del 2030-06-15 (Date @db.Date / @db.Time).
// `marginePendolare: false` esplicito: questa prenotazione usa la finestra
// NORMALE (15 min dopo l'inizio) — il margine pendolare (30 min) è coperto a
// parte piu' sotto (describe "Margine Pendolare").
const prenotazione = {
  id: "pren-1",
  userId: user.id,
  postoId: "posto-1",
  data: new Date("2030-06-15T00:00:00.000Z"),
  oraInizio: new Date("1970-01-01T09:00:00.000Z"),
  oraFine: new Date("1970-01-01T11:00:00.000Z"),
  stato: "CONFERMATA",
  marginePendolare: false,
  user,
  posto: { id: "posto-1", numero: "A1", sala: { nome: "Sala", piano: 1 } },
};

function request(body: unknown) {
  return new NextRequest("http://localhost/api/prenotazioni/pren-1/check-in", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
const params = { params: Promise.resolve({ id: "pren-1" }) };

beforeAll(async () => {
  route = await import("@/app/api/prenotazioni/[id]/check-in/route");
});

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireUser.mockResolvedValue(user);
  // `null` = "consentito" nel contratto dei rate limiter (vedi rate-limit.ts):
  // per default nessun test qui e' sul rate limiting, quindi non blocca mai.
  mocks.criticalApiRateLimiter.mockResolvedValue(null);
  mocks.prisma.prenotazione.findUnique.mockResolvedValue(prenotazione);
  mocks.prisma.prenotazione.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    ...prenotazione,
    ...data,
    posto: prenotazione.posto,
  }));
  mocks.prisma.posto.update.mockResolvedValue({ ...prenotazione.posto, stato: "OCCUPATO" });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("M-2 · il check-in usa il tempo del server, non del client", () => {
  it("[TC-M2-001] timestamp client nel passato (fuori finestra) viene ignorato: check-in OK con checkInAt = ora server", async () => {
    // Ora server: 06:50Z del 2030-06-15 = 08:50 di Roma (CEST, +2h) → dentro
    // la finestra reale di Roma [08:45, 09:00].
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2030-06-15T06:50:00.000Z"));

    // timestamp client palesemente falso: se fosse usato ⇒ "troppo presto" (400).
    const response = await route.POST(
      request({ timestamp: "2020-01-01T00:00:00.000Z" }),
      params,
    );

    expect(response.status).toBe(200);
    expect(mocks.prisma.prenotazione.update).toHaveBeenCalledTimes(1);
    const arg = mocks.prisma.prenotazione.update.mock.calls[0][0] as {
      data: { stato: string; checkInAt: Date };
    };
    expect(arg.data.stato).toBe("CHECK_IN");
    expect(arg.data.checkInAt).toBeInstanceOf(Date);
    expect(arg.data.checkInAt.toISOString()).toBe("2030-06-15T06:50:00.000Z");
  });

  it("[TC-M2-002] timestamp client nel futuro (slot scaduto) viene ignorato: check-in comunque OK", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2030-06-15T06:50:00.000Z"));

    // Se usato, "2030-06-15T09:30Z" ⇒ periodo scaduto (400).
    const response = await route.POST(
      request({ timestamp: "2030-06-15T09:30:00.000Z" }),
      params,
    );

    expect(response.status).toBe(200);
    const arg = mocks.prisma.prenotazione.update.mock.calls[0][0] as {
      data: { checkInAt: Date };
    };
    expect(arg.data.checkInAt.toISOString()).toBe("2030-06-15T06:50:00.000Z");
  });

  it("[TC-M2-003] la finestra resta applicata sull'ora del server: ora server troppo presto ⇒ 400 anche con timestamp client 'valido'", async () => {
    // Ora server: 06:30Z (= 08:30 di Roma) → PRIMA dell'apertura reale
    // (08:45 di Roma = 06:45Z). Il client prova a barare con un timestamp
    // dentro la finestra: deve comunque fallire.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2030-06-15T06:30:00.000Z"));

    const response = await route.POST(
      request({ timestamp: "2030-06-15T06:50:00.000Z" }),
      params,
    );

    expect(response.status).toBe(400);
    expect(mocks.prisma.prenotazione.update).not.toHaveBeenCalled();
  });
});

describe("Margine Pendolare · la finestra si estende a 30 minuti SOLO se marginePendolare e' vero sulla riga", () => {
  it("[TC-MP-CHECKIN-001] marginePendolare:true — +20 minuti dall'inizio (oltre i 15 normali): check-in riuscito", async () => {
    // Ora server: 07:20Z = 09:20 di Roma → +20 minuti dall'inizio (09:00).
    // Con la finestra NORMALE (15) sarebbe gia' scaduta; col margine (30) no.
    mocks.prisma.prenotazione.findUnique.mockResolvedValue({
      ...prenotazione,
      marginePendolare: true,
    });
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2030-06-15T07:20:00.000Z"));

    const response = await route.POST(request({}), params);

    expect(response.status).toBe(200);
    expect(mocks.prisma.prenotazione.update).toHaveBeenCalledTimes(1);
  });

  it("[TC-MP-CHECKIN-002] marginePendolare:false — stessi +20 minuti: check-in scaduto (400)", async () => {
    // Stessa prenotazione, stesso orario, ma SENZA margine: qui la finestra
    // normale (15) e' gia' chiusa. Dimostra che l'estensione dipende
    // davvero da `marginePendolare`, non da un default piu' permissivo.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2030-06-15T07:20:00.000Z"));

    const response = await route.POST(request({}), params);

    expect(response.status).toBe(400);
    expect(mocks.prisma.prenotazione.update).not.toHaveBeenCalled();
  });

  it("[TC-MP-CHECKIN-003] marginePendolare:true — +30 minuti esatti (confine): check-in scaduto (400)", async () => {
    // Stesso confine di TC-TOL-004 (prenotazioni-regole-finestra-checkin.test.ts):
    // al minuto esatto +30 la finestra e' GIA' chiusa, coerente col rilascio
    // no-show che a quello stesso istante considera il posto rilasciabile.
    mocks.prisma.prenotazione.findUnique.mockResolvedValue({
      ...prenotazione,
      marginePendolare: true,
    });
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2030-06-15T07:30:00.000Z"));

    const response = await route.POST(request({}), params);

    expect(response.status).toBe(400);
    expect(mocks.prisma.prenotazione.update).not.toHaveBeenCalled();
  });
});

describe("Rate limiting · POST /api/prenotazioni/[id]/check-in usa criticalApiRateLimiter DOPO l'autenticazione", () => {
  it("[TC-RL-CHECKIN-001] limite superato: 429 del limitatore, nessuna lettura della prenotazione", async () => {
    const rispostaLimite = new Response(null, { status: 429 });
    mocks.criticalApiRateLimiter.mockResolvedValue(rispostaLimite);

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2030-06-15T06:50:00.000Z"));

    const response = await route.POST(request({}), params);

    expect(response.status).toBe(429);
    // Il limite scatta DOPO requireUser() ma PRIMA di qualunque lettura DB:
    // un client che ha esaurito la quota non deve nemmeno far girare una
    // query per la prenotazione altrui.
    expect(mocks.requireUser).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.prenotazione.findUnique).not.toHaveBeenCalled();
  });

  it("[TC-RL-CHECKIN-002] limite libero: la richiesta procede normalmente", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2030-06-15T06:50:00.000Z"));

    const response = await route.POST(request({}), params);

    expect(response.status).toBe(200);
    expect(mocks.criticalApiRateLimiter).toHaveBeenCalledTimes(1);
  });
});
