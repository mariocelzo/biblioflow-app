/**
 * Test di GET /api/prenotazioni/[id]/qr (difetto qr-studente-formato-incompatibile).
 *
 * COSA verifica:
 *  - CONTRATTO end-to-end: il payload prodotto da questa rotta è accettato
 *    da `validateScannedQR` (src/lib/qr-signature.ts), la stessa funzione
 *    che usa lo scanner del bibliotecario. PRIMA, il QR mostrato allo
 *    studente veniva costruito nel browser senza firma e non aveva NESSUNA
 *    relazione con `validateScannedQR`: questo test collega davvero i due
 *    lati, usando la vera implementazione di qr-signature.ts (non mockata).
 *  - IDOR: una prenotazione che non appartiene all'utente autenticato NON
 *    produce mai un QR (assertOwnership viene rispettata).
 *  - Il QR non viene generato per una prenotazione non più CONFERMATA.
 *  - Il payload non è riusabile su un'altra prenotazione (la firma è legata
 *    a prenotazioneId+userId+timestamp).
 *  - Scadenza sensata: dopo QR_VALIDITA_MINUTI il payload generato qui non è
 *    più accettato da validateScannedQR.
 *
 * `@/lib/auth` e `@/lib/prisma` sono mockati (nessun DB); `@/lib/qr-signature`
 * è REALE apposta, per provare il contratto con lo scanner. `@/lib/env` è
 * mockato solo perché qr-signature.ts lo importa transitivamente (stesso
 * pattern di tests/unit/qr-signature-secret.test.ts).
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
    criticalApiRateLimiter: vi.fn(async () => null),
    prisma: {
      prenotazione: { findUnique: vi.fn() },
    },
    nextAuthSecret: "n".repeat(48),
  };
});

vi.mock("@/lib/auth", () => ({
  AuthError: mocks.MockAuthError,
  requireUser: mocks.requireUser,
  assertOwnership: mocks.assertOwnership,
}));
vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma, default: mocks.prisma }));
vi.mock("@/lib/rate-limit", () => ({
  criticalApiRateLimiter: mocks.criticalApiRateLimiter,
}));
// qr-signature.ts importa `env`: senza questo mock l'import fallirebbe in
// assenza di un vero DATABASE_URL/NEXTAUTH_URL di ambiente (vedi
// tests/unit/qr-signature-secret.test.ts, stesso identico bisogno).
vi.mock("@/lib/env", () => ({
  env: { NEXTAUTH_SECRET: mocks.nextAuthSecret },
}));

type Route = typeof import("@/app/api/prenotazioni/[id]/qr/route");
let route: Route;

// Import REALE (non mockato): e' proprio cio' che vogliamo esercitare, lo
// stesso modulo usato dallo scanner del bibliotecario.
import { validateScannedQR, QR_VALIDITA_MINUTI } from "@/lib/qr-signature";

const studente = { id: "studente-1", ruolo: "STUDENTE" as const };

const prenotazioneDiStudente = {
  id: "pren-qr-1",
  userId: studente.id,
  stato: "CONFERMATA",
};

function requestQr(id: string) {
  return new NextRequest(`http://localhost/api/prenotazioni/${id}/qr`);
}

function paramsPer(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeAll(async () => {
  route = await import("@/app/api/prenotazioni/[id]/qr/route");
});

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireUser.mockResolvedValue(studente);
  mocks.criticalApiRateLimiter.mockResolvedValue(null);
  // Implementazione realistica (non solo uno stub): replica esattamente la
  // logica di src/lib/auth.ts, cosi' i test IDOR sotto restano significativi
  // senza dover reimportare il modulo reale (che trascinerebbe Prisma/DB).
  mocks.assertOwnership.mockImplementation((resource: { userId: string }, user: { id: string }) => {
    if (resource.userId === user.id) return;
    throw new mocks.MockAuthError(404, "RISORSA_NON_TROVATA", "La risorsa richiesta non esiste");
  });
  mocks.prisma.prenotazione.findUnique.mockResolvedValue(prenotazioneDiStudente);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("GET /api/prenotazioni/[id]/qr · contratto con validateScannedQR", () => {
  it("[TC-QR-001] il payload generato è accettato da validateScannedQR con lo stesso prenotazioneId/userId", async () => {
    const res = await route.GET(requestQr(prenotazioneDiStudente.id), paramsPer(prenotazioneDiStudente.id));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(typeof body.qrData).toBe("string");

    // CONTRATTO: cio' che la rotta produce deve essere esattamente cio' che
    // lo scanner (validateScannedQR) accetta — prima di questa correzione i
    // due lati non erano mai stati collegati.
    const esito = validateScannedQR(body.qrData);
    expect(esito.valid).toBe(true);
    expect(esito.payload?.prenotazioneId).toBe(prenotazioneDiStudente.id);
    expect(esito.payload?.userId).toBe(studente.id);
  });

  it("[TC-QR-002] la firma non è riusabile spostando il payload su un'altra prenotazione", async () => {
    const res = await route.GET(requestQr(prenotazioneDiStudente.id), paramsPer(prenotazioneDiStudente.id));
    const body = await res.json();

    const manomesso = JSON.parse(body.qrData);
    manomesso.prenotazioneId = "un-altra-prenotazione";

    const esito = validateScannedQR(JSON.stringify(manomesso));
    expect(esito.valid).toBe(false);
    expect(esito.errorType).toBe("fake");
  });

  it("[TC-QR-003] il QR generato scade dopo QR_VALIDITA_MINUTI (non è valido per sempre)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2030-01-01T10:00:00.000Z"));

    const res = await route.GET(requestQr(prenotazioneDiStudente.id), paramsPer(prenotazioneDiStudente.id));
    const body = await res.json();
    expect(res.status).toBe(200);

    // Appena generato: valido.
    expect(validateScannedQR(body.qrData).valid).toBe(true);

    // Un minuto oltre la finestra di validità: non più accettato.
    vi.setSystemTime(
      new Date(Date.now() + (QR_VALIDITA_MINUTI + 1) * 60 * 1000),
    );
    const esitoScaduto = validateScannedQR(body.qrData);
    expect(esitoScaduto.valid).toBe(false);
    expect(esitoScaduto.errorType).toBe("expired");
  });
});

describe("GET /api/prenotazioni/[id]/qr · autorizzazione", () => {
  it("[TC-QR-004] una prenotazione di un altro utente risponde 404 (IDOR, policy CA-01) e non genera QR", async () => {
    mocks.prisma.prenotazione.findUnique.mockResolvedValue({
      id: "pren-altrui",
      userId: "un-altro-studente",
      stato: "CONFERMATA",
    });

    const res = await route.GET(requestQr("pren-altrui"), paramsPer("pren-altrui"));
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.qrData).toBeUndefined();
  });

  it("[TC-QR-005] prenotazione inesistente → 404", async () => {
    mocks.prisma.prenotazione.findUnique.mockResolvedValue(null);

    const res = await route.GET(requestQr("non-esiste"), paramsPer("non-esiste"));

    expect(res.status).toBe(404);
    expect(mocks.assertOwnership).not.toHaveBeenCalled();
  });

  it("[TC-QR-006] prenotazione non CONFERMATA (es. CANCELLATA) → 409, nessun QR generato", async () => {
    mocks.prisma.prenotazione.findUnique.mockResolvedValue({
      ...prenotazioneDiStudente,
      stato: "CANCELLATA",
    });

    const res = await route.GET(requestQr(prenotazioneDiStudente.id), paramsPer(prenotazioneDiStudente.id));
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.qrData).toBeUndefined();
  });

  it("[TC-QR-007] senza sessione → 401 (requireUser)", async () => {
    mocks.requireUser.mockRejectedValue(
      new mocks.MockAuthError(401, "NON_AUTENTICATO", "È richiesta una sessione autenticata"),
    );

    const res = await route.GET(requestQr(prenotazioneDiStudente.id), paramsPer(prenotazioneDiStudente.id));

    expect(res.status).toBe(401);
    expect(mocks.prisma.prenotazione.findUnique).not.toHaveBeenCalled();
  });
});
