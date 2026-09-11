// ============================================================================
// Test di POST /api/admin/scanner/validate (rilievo #4 dell'audit)
// ============================================================================
// COSA: quando il check-in avviene con piu' di 15 minuti di ritardo, la route
// rispondeva "Check-in scaduto. La prenotazione è stata annullata" ma non
// eseguiva NESSUN update: la prenotazione restava CONFERMATA e il posto non
// veniva liberato. Il messaggio dichiarava un annullamento mai avvenuto.
//
// PERCHE' QUESTA CORREZIONE (NO_SHOW + posto DISPONIBILE, non solo il testo):
// e' esattamente il pattern gia' usato da
// ANNULLA_PRENOTAZIONI_SENZA_CHECKIN in src/app/api/admin/anomalie/route.ts
// per lo stesso scenario (mancato check-in oltre la finestra consentita):
// stato NO_SHOW, posto liberato, log NO_SHOW, notifica all'utente. Onorare
// il messaggio con lo stesso comportamento del resto del sistema e' piu'
// coerente che riscrivere solo il testo per ammettere il no-op.

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  validateScannedQR: vi.fn(),
  prisma: {
    prenotazione: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    posto: {
      update: vi.fn(),
    },
    logEvento: {
      create: vi.fn(),
    },
    notifica: {
      create: vi.fn(),
    },
  },
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/prisma", () => ({ default: mocks.prisma }));
vi.mock("@/lib/qr-signature", () => ({ validateScannedQR: mocks.validateScannedQR }));

type ScannerValidateRoute = typeof import("@/app/api/admin/scanner/validate/route");

let route: ScannerValidateRoute;

const bibliotecario = {
  id: "bibliotecario-1",
  nome: "Anna",
  cognome: "Bibliotecaria",
  email: "bibliotecario@biblioflow.test",
  ruolo: "BIBLIOTECARIO",
};

function oraDiOggiMenoMinuti(minutiFa: number): string {
  const target = new Date(Date.now() - minutiFa * 60 * 1000);
  const hh = String(target.getHours()).padStart(2, "0");
  const mm = String(target.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function prenotazioneDiOggi(oraInizio: string) {
  const oggi = new Date();
  oggi.setHours(0, 0, 0, 0);
  return {
    id: "prenotazione-1",
    userId: "utente-1",
    postoId: "posto-1",
    data: oggi,
    oraInizio,
    stato: "CONFERMATA",
    checkInAt: null,
    user: { id: "utente-1", nome: "Mario", cognome: "Rossi", email: "mario@studenti.unisa.it", matricola: "0512345" },
    posto: { id: "posto-1", numero: "A1", sala: { nome: "Sala Studio", piano: 1 } },
  };
}

function request(qrCode: string) {
  return new NextRequest("http://localhost/api/admin/scanner/validate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ qrCode }),
  });
}

beforeEach(async () => {
  vi.resetAllMocks();
  route = await import("@/app/api/admin/scanner/validate/route");
  mocks.auth.mockResolvedValue({ user: bibliotecario });
});

describe("Check-in oltre i 15 minuti di ritardo", () => {
  it("[TC-SCAN-TARDI-001] annulla davvero la prenotazione (NO_SHOW) invece di lasciarla CONFERMATA", async () => {
    // La prenotazione iniziava 20 minuti fa: oltre la finestra di 15 minuti.
    const prenotazione = prenotazioneDiOggi(oraDiOggiMenoMinuti(20));

    mocks.validateScannedQR.mockReturnValue({
      valid: true,
      payload: { prenotazioneId: prenotazione.id, userId: prenotazione.userId },
    });
    mocks.prisma.prenotazione.findUnique.mockResolvedValue(prenotazione);

    const res = await route.POST(request("qr-valido"));
    const data = await res.json();

    // Il messaggio dichiara un annullamento: la prenotazione deve davvero
    // passare a NO_SHOW, non restare CONFERMATA.
    expect(data.error).toContain("annullata");
    expect(mocks.prisma.prenotazione.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: prenotazione.id },
        data: expect.objectContaining({ stato: "NO_SHOW" }),
      })
    );
  });

  it("[TC-SCAN-TARDI-002] libera il posto, coerentemente con ANNULLA_PRENOTAZIONI_SENZA_CHECKIN", async () => {
    const prenotazione = prenotazioneDiOggi(oraDiOggiMenoMinuti(30));

    mocks.validateScannedQR.mockReturnValue({
      valid: true,
      payload: { prenotazioneId: prenotazione.id, userId: prenotazione.userId },
    });
    mocks.prisma.prenotazione.findUnique.mockResolvedValue(prenotazione);

    await route.POST(request("qr-valido"));

    expect(mocks.prisma.posto.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: prenotazione.postoId },
        data: { stato: "DISPONIBILE" },
      })
    );
  });

  it("[TC-SCAN-TARDI-003] NON esegue il check-in (stato CHECK_IN) su una prenotazione scaduta", async () => {
    const prenotazione = prenotazioneDiOggi(oraDiOggiMenoMinuti(45));

    mocks.validateScannedQR.mockReturnValue({
      valid: true,
      payload: { prenotazioneId: prenotazione.id, userId: prenotazione.userId },
    });
    mocks.prisma.prenotazione.findUnique.mockResolvedValue(prenotazione);

    await route.POST(request("qr-valido"));

    expect(mocks.prisma.prenotazione.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ stato: "CHECK_IN" }) })
    );
  });
});
