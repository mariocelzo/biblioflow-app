/**
 * Test di collegamento del rate limiting su `POST /api/admin/scanner/validate`
 * (check-in effettuato dal bibliotecario tramite scanner QR).
 *
 * PERCHE': la route era una delle scritture critiche rimaste senza alcun
 * limitatore (trovata con `grep -L "RateLimiter("` sulle route POST/PATCH/
 * DELETE). E' un'azione dello STAFF, quindi usa `staffCriticalApiRateLimiter`
 * (60/min) come le altre route admin, non il 10/min pensato per il singolo
 * studente. Questo file blinda il collegamento, non la logica del limitatore
 * (gia' coperta da rate-limit-modi.test.ts): qui `@/lib/rate-limit` e'
 * mockato.
 *
 * COSA SI VERIFICA:
 *  - il limitatore scatta DOPO il controllo di sessione E di ruolo: anonimi e
 *    studenti vengono fermati prima e non consumano quota;
 *  - con il limite superato la risposta e' il 429 del limitatore e NESSUNA
 *    scrittura parte (niente validazione del QR, nessun update di
 *    prenotazione/posto, nessun log, nessuna notifica);
 *  - con il limite libero il check-in procede normalmente;
 *  - la chiave del contatore e' l'account staff, non l'IP.
 *
 * NOTA SUL TEMPO: per il caso "procede normalmente" serve una prenotazione
 * dentro la finestra di check-in. Si riusa lo stesso schema di
 * admin-scanner-validate.test.ts: orologio congelato con i fake timers,
 * processo in TZ=UTC (come su Vercel) e orario di inizio calcolato con
 * `minutiCorrentiBiblioteca`, la stessa funzione usata dalla route.
 */
import { NextRequest } from "next/server";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { minutiCorrentiBiblioteca, oraDbDaMinuti } from "@/lib/prenotazioni-regole";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  validateScannedQR: vi.fn(),
  staffCriticalApiRateLimiter: vi.fn(),
  prisma: {
    prenotazione: { findUnique: vi.fn(), update: vi.fn() },
    posto: { update: vi.fn() },
    logEvento: { create: vi.fn() },
    notifica: { create: vi.fn() },
  },
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/prisma", () => ({ default: mocks.prisma }));
vi.mock("@/lib/qr-signature", () => ({ validateScannedQR: mocks.validateScannedQR }));
vi.mock("@/lib/rate-limit", () => ({
  staffCriticalApiRateLimiter: mocks.staffCriticalApiRateLimiter,
}));

const bibliotecario = {
  id: "bibliotecario-rl-1",
  nome: "Anna",
  cognome: "Bibliotecaria",
  email: "bibliotecario@biblioflow.test",
  ruolo: "BIBLIOTECARIO",
};

// 14 giugno 2030, 12:00 UTC = 14:00 di Roma (CEST): stesso istante fisso di
// admin-scanner-validate.test.ts.
const ORA_FISSATA = new Date("2030-06-14T12:00:00.000Z");
const TZ_ORIGINALE = process.env.TZ;

/** Prenotazione di oggi iniziata 5 minuti fa: dentro la finestra di check-in. */
function prenotazioneInFinestra() {
  // Con TZ=UTC `setHours` equivale a `setUTCHours`, come nel test gemello.
  const oggi = new Date(ORA_FISSATA);
  oggi.setHours(0, 0, 0, 0);
  return {
    id: "prenotazione-rl-1",
    userId: "utente-rl-1",
    postoId: "posto-rl-1",
    data: oggi,
    oraInizio: oraDbDaMinuti(minutiCorrentiBiblioteca(ORA_FISSATA) - 5),
    stato: "CONFERMATA",
    marginePendolare: false,
    checkInAt: null,
    user: { id: "utente-rl-1", nome: "Mario", cognome: "Rossi", email: "mario@studenti.unisa.it", matricola: "0512345" },
    posto: { id: "posto-rl-1", numero: "A1", stato: "DISPONIBILE", sala: { nome: "Sala Studio", piano: 1 } },
  };
}

function request(qrCode: string) {
  return new NextRequest("http://localhost/api/admin/scanner/validate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ qrCode }),
  });
}

/** Asserzione comune: nessuna scrittura e nessuna lettura del dominio. */
function expectNessunaScrittura() {
  expect(mocks.validateScannedQR).not.toHaveBeenCalled();
  expect(mocks.prisma.prenotazione.findUnique).not.toHaveBeenCalled();
  expect(mocks.prisma.prenotazione.update).not.toHaveBeenCalled();
  expect(mocks.prisma.posto.update).not.toHaveBeenCalled();
  expect(mocks.prisma.logEvento.create).not.toHaveBeenCalled();
  expect(mocks.prisma.notifica.create).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.resetAllMocks();
  process.env.TZ = "UTC";
  vi.useFakeTimers();
  vi.setSystemTime(ORA_FISSATA);

  mocks.auth.mockResolvedValue({ user: bibliotecario });
  // `null` = "consentito" nel contratto dei rate limiter (vedi rate-limit.ts).
  mocks.staffCriticalApiRateLimiter.mockResolvedValue(null);

  const prenotazione = prenotazioneInFinestra();
  mocks.validateScannedQR.mockReturnValue({
    valid: true,
    payload: { prenotazioneId: prenotazione.id, userId: prenotazione.userId },
  });
  mocks.prisma.prenotazione.findUnique.mockResolvedValue(prenotazione);
  mocks.prisma.prenotazione.update.mockResolvedValue({
    ...prenotazione,
    stato: "CHECK_IN",
  });
  mocks.prisma.posto.update.mockResolvedValue({ id: prenotazione.postoId });
  mocks.prisma.logEvento.create.mockResolvedValue({ id: "log-rl-1" });
  mocks.prisma.notifica.create.mockResolvedValue({ id: "notifica-rl-1" });
});

afterEach(() => {
  vi.useRealTimers();
});

afterAll(() => {
  process.env.TZ = TZ_ORIGINALE;
});

describe("POST /api/admin/scanner/validate · rate limiting", () => {
  it("[TC-RL-SCAN-001] limite superato: 429 del limitatore, nessuna scrittura", async () => {
    const { POST } = await import("@/app/api/admin/scanner/validate/route");
    mocks.staffCriticalApiRateLimiter.mockResolvedValue(
      new Response(null, { status: 429 }),
    );

    const response = await POST(request("qr-valido"));

    expect(response.status).toBe(429);
    // Il limite scatta DOPO auth() ma PRIMA di validare il QR e di toccare
    // il DB: nessun check-in, nessun no-show, nessun log, nessuna notifica.
    expect(mocks.auth).toHaveBeenCalledTimes(1);
    expectNessunaScrittura();
  });

  it("[TC-RL-SCAN-002] limite libero: il check-in procede normalmente (200), limitatore invocato dopo l'autorizzazione", async () => {
    const { POST } = await import("@/app/api/admin/scanner/validate/route");

    const response = await POST(request("qr-valido"));

    expect(response.status).toBe(200);
    expect(mocks.staffCriticalApiRateLimiter).toHaveBeenCalledTimes(1);
    // Ordine: sessione/ruolo PRIMA, limitatore DOPO.
    expect(mocks.auth.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.staffCriticalApiRateLimiter.mock.invocationCallOrder[0],
    );
    expect(mocks.prisma.prenotazione.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ stato: "CHECK_IN" }),
      }),
    );
  });

  it("[TC-RL-SCAN-003] la chiave del limitatore e' l'account staff, non l'IP", async () => {
    // PERCHE': le postazioni del banco escono di norma dallo stesso IP della
    // rete della biblioteca; con la chiave per IP due bibliotecari in
    // servizio insieme si dividerebbero un'unica quota.
    const { POST } = await import("@/app/api/admin/scanner/validate/route");

    await POST(request("qr-valido"));

    expect(mocks.staffCriticalApiRateLimiter).toHaveBeenCalledWith(
      expect.anything(),
      "verifica-e-conta",
      bibliotecario.id,
    );
  });

  it("[TC-RL-SCAN-004] anonimo (401) e studente (403): il limitatore non viene nemmeno raggiunto", async () => {
    const { POST } = await import("@/app/api/admin/scanner/validate/route");

    mocks.auth.mockResolvedValueOnce(null);
    const anonimo = await POST(request("qr-valido"));

    mocks.auth.mockResolvedValueOnce({
      user: { id: "studente-rl-1", ruolo: "STUDENTE" },
    });
    const studente = await POST(request("qr-valido"));

    expect(anonimo.status).toBe(401);
    expect(studente.status).toBe(403);
    expect(mocks.staffCriticalApiRateLimiter).not.toHaveBeenCalled();
    expectNessunaScrittura();
  });
});
