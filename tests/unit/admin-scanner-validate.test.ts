// ============================================================================
// Test di POST /api/admin/scanner/validate (rilievo #4 dell'audit + difetti
// di fuso orario "checkin-finestra-bypassata" / "checkin-finestra-oraria-
// sempre-aperta" / "checkin-bypassa-manutenzione")
// ============================================================================
// COSA (rilievo #4): quando il check-in avviene con piu' di 15 minuti di
// ritardo, la route rispondeva "Check-in scaduto. La prenotazione è stata
// annullata" ma non eseguiva NESSUN update: la prenotazione restava
// CONFERMATA e il posto non veniva liberato. Il messaggio dichiarava un
// annullamento mai avvenuto.
//
// PERCHE' QUESTA CORREZIONE (NO_SHOW + posto DISPONIBILE, non solo il testo):
// e' esattamente il pattern gia' usato da
// ANNULLA_PRENOTAZIONI_SENZA_CHECKIN in src/app/api/admin/anomalie/route.ts
// per lo stesso scenario (mancato check-in oltre la finestra consentita):
// stato NO_SHOW, posto liberato, log NO_SHOW, notifica all'utente. Onorare
// il messaggio con lo stesso comportamento del resto del sistema e' piu'
// coerente che riscrivere solo il testo per ammettere il no-op.
//
// COSA (fuso orario, verificato dal vivo): la route ricostruiva l'orario con
// `new Date(\`1970-01-01T${prenotazione.oraInizio}\`)`, ma `oraInizio` e' un
// oggetto Date (colonna @db.Time), non una stringa: il template literal
// interpolava `Date.prototype.toString()`, non parsabile → Invalid Date →
// NaN ovunque a valle → la finestra "troppo presto / scaduto" non veniva MAI
// applicata (check-in sempre riuscito, a qualunque ora). Questo file usava
// PRIMA una stringa "HH:MM" scritta a mano per `oraInizio`, che aggirava il
// bug senza accorgersene (una stringa passa indenne per il vecchio template
// literal). Ora la fixture costruisce un vero oggetto Date nello stesso
// formato con cui Prisma legge `@db.Time` (1970-01-01 UTC, cifre di Roma —
// vedi src/lib/tempo-db.ts), cosi' il test esercita davvero il bug e la
// correzione (`valutaFinestraCheckIn` in src/lib/prenotazioni-regole.ts).
//
// NOTA SUL FUSO: l'orologio e' congelato con i fake timers di vitest su un
// istante fisso ("adesso" iniettato) e il processo gira con
// `process.env.TZ = "UTC"` (come su Vercel), MAI con l'ora legale del fuso
// del chiamante: un test che passasse solo perche' la macchina che lo esegue
// e' su Europe/Rome non dimostrerebbe nulla.

import { NextRequest } from "next/server";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { minutiCorrentiBiblioteca, oraDbDaMinuti } from "@/lib/prenotazioni-regole";

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

// "Adesso" iniettato: 14 giugno 2030, 12:00 UTC = 14:00 di Roma (CEST, +2h —
// in ora legale, MAI un offset fisso scritto a mano nel test: si passa
// sempre da `minutiCorrentiBiblioteca`, la stessa funzione usata dal codice).
const ORA_FISSATA = new Date("2030-06-14T12:00:00.000Z");
const TZ_ORIGINALE = process.env.TZ;

/** Costruisce l'oggetto Date di `oraInizio` (@db.Time) per uno slot iniziato N minuti fa, in orario di Roma. */
function oraInizioRomaMenoMinuti(minutiFa: number): Date {
  return oraDbDaMinuti(minutiCorrentiBiblioteca(ORA_FISSATA) - minutiFa);
}

function prenotazioneDiOggi(oraInizio: Date, overrides: Record<string, unknown> = {}) {
  // Il processo gira con TZ=UTC (impostato in beforeEach): `setHours` qui
  // equivale a `setUTCHours`, combaciando con l'analogo calcolo di "oggi"
  // fatto dalla route con l'orologio congelato sulla stessa `ORA_FISSATA`.
  const oggi = new Date(ORA_FISSATA);
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
    posto: { id: "posto-1", numero: "A1", stato: "DISPONIBILE", sala: { nome: "Sala Studio", piano: 1 } },
    ...overrides,
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
  process.env.TZ = "UTC";
  vi.useFakeTimers();
  vi.setSystemTime(ORA_FISSATA);
  route = await import("@/app/api/admin/scanner/validate/route");
  mocks.auth.mockResolvedValue({ user: bibliotecario });
});

afterEach(() => {
  vi.useRealTimers();
});

afterAll(() => {
  process.env.TZ = TZ_ORIGINALE;
});

describe("Check-in oltre i 15 minuti di ritardo", () => {
  it("[TC-SCAN-TARDI-001] annulla davvero la prenotazione (NO_SHOW) invece di lasciarla CONFERMATA", async () => {
    // La prenotazione iniziava 20 minuti fa: oltre la finestra di 15 minuti.
    const prenotazione = prenotazioneDiOggi(oraInizioRomaMenoMinuti(20));

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
    const prenotazione = prenotazioneDiOggi(oraInizioRomaMenoMinuti(30));

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
    const prenotazione = prenotazioneDiOggi(oraInizioRomaMenoMinuti(45));

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

// Difetti "checkin-finestra-bypassata" / "checkin-finestra-oraria-sempre-
// aperta": la finestra +-15 minuti era completamente ignorata (Invalid Date →
// NaN → sia "troppo presto" sia "scaduto" valutavano sempre `false`), quindi
// il check-in riusciva SEMPRE, a qualunque ora. Questi test avrebbero
// fallito prima della correzione (200 invece di 400/200 coerenti).
describe("finestra di check-in +-15 minuti (difetto: la finestra era sempre ignorata)", () => {
  it("[TC-SCAN-PRESTO-001] rifiuta con too_early una prenotazione che inizia fra 3 ore", async () => {
    // oraInizio nel FUTURO rispetto a ORA_FISSATA: "minuti fa" negativo.
    const prenotazione = prenotazioneDiOggi(oraInizioRomaMenoMinuti(-180));

    mocks.validateScannedQR.mockReturnValue({
      valid: true,
      payload: { prenotazioneId: prenotazione.id, userId: prenotazione.userId },
    });
    mocks.prisma.prenotazione.findUnique.mockResolvedValue(prenotazione);

    const res = await route.POST(request("qr-valido"));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.type).toBe("too_early");
    expect(mocks.prisma.prenotazione.update).not.toHaveBeenCalled();
  });

  it("[TC-SCAN-OK-001] consente il check-in per uno slot iniziato 10 minuti fa (dentro la finestra)", async () => {
    const prenotazione = prenotazioneDiOggi(oraInizioRomaMenoMinuti(10));

    mocks.validateScannedQR.mockReturnValue({
      valid: true,
      payload: { prenotazioneId: prenotazione.id, userId: prenotazione.userId },
    });
    mocks.prisma.prenotazione.findUnique.mockResolvedValue(prenotazione);
    mocks.prisma.prenotazione.update.mockResolvedValue({ ...prenotazione, stato: "CHECK_IN" });

    const res = await route.POST(request("qr-valido"));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mocks.prisma.prenotazione.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: prenotazione.id },
        data: expect.objectContaining({ stato: "CHECK_IN" }),
      })
    );
    expect(mocks.prisma.posto.update).toHaveBeenCalledWith({
      where: { id: prenotazione.postoId },
      data: { stato: "OCCUPATO" },
    });
  });

  it("[TC-SCAN-OK-002] consente il check-in per uno slot che inizia fra 10 minuti (dentro l'anticipo)", async () => {
    const prenotazione = prenotazioneDiOggi(oraInizioRomaMenoMinuti(-10));

    mocks.validateScannedQR.mockReturnValue({
      valid: true,
      payload: { prenotazioneId: prenotazione.id, userId: prenotazione.userId },
    });
    mocks.prisma.prenotazione.findUnique.mockResolvedValue(prenotazione);
    mocks.prisma.prenotazione.update.mockResolvedValue({ ...prenotazione, stato: "CHECK_IN" });

    const res = await route.POST(request("qr-valido"));

    expect(res.status).toBe(200);
    expect(mocks.prisma.prenotazione.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ stato: "CHECK_IN" }) })
    );
  });
});

// Difetto "checkin-bypassa-manutenzione": il check-in riusciva anche su un
// posto in MANUTENZIONE, sovrascrivendo silenziosamente il flag con OCCUPATO.
describe("posto in MANUTENZIONE (difetto: il check-in lo sovrascriveva con OCCUPATO)", () => {
  it("[TC-SCAN-MANUT-001] rifiuta il check-in su un posto in MANUTENZIONE, anche dentro la finestra oraria", async () => {
    const prenotazione = prenotazioneDiOggi(oraInizioRomaMenoMinuti(5), {
      posto: { id: "posto-1", numero: "B1", stato: "MANUTENZIONE", sala: { nome: "Sala Studio", piano: 1 } },
    });

    mocks.validateScannedQR.mockReturnValue({
      valid: true,
      payload: { prenotazioneId: prenotazione.id, userId: prenotazione.userId },
    });
    mocks.prisma.prenotazione.findUnique.mockResolvedValue(prenotazione);

    const res = await route.POST(request("qr-valido"));
    const data = await res.json();

    expect(res.status).toBe(409);
    expect(data.type).toBe("posto_non_disponibile");
    // Il posto NON deve mai passare a OCCUPATO: il flag di manutenzione non
    // va perso silenziosamente.
    expect(mocks.prisma.posto.update).not.toHaveBeenCalled();
    expect(mocks.prisma.prenotazione.update).not.toHaveBeenCalled();
  });
});
