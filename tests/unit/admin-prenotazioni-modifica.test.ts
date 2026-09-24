/**
 * Test di hardening per `POST /api/admin/prenotazioni` — SOLO il case
 * "MODIFICA" (finding B-9).
 *
 * COSA verifica: `nuoviDati` (data / orari) viene validato PRIMA di Prisma:
 *  - formati non validi → 422 (niente 500), nessuna scrittura;
 *  - intervallo incoerente (fine <= inizio) → 422;
 *  - dati validi → 200 e `prenotazione.update` riceve oggetti Date normalizzati
 *    (formato atteso da @db.Date / @db.Time).
 *
 * PERCHÉ: prima gli orari grezzi ("09:00") e una `data` non valida finivano
 * direttamente su colonne TIME/DATE, che li rifiutavano → 500 opaco.
 *
 * NB: gli altri `case` dello switch (logica coda/promozione BIB-49) non sono
 * esercitati qui e restano invariati.
 */
import { NextRequest } from "next/server";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  prisma: {
    prenotazione: { findUnique: vi.fn(), update: vi.fn() },
    posto: { findUnique: vi.fn(), update: vi.fn() },
    logEvento: { create: vi.fn() },
    notifica: { create: vi.fn() },
    user: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
  promuoviPrimoInCoda: vi.fn(),
  emitCodaPromozione: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/prisma", () => ({ default: mocks.prisma }));
vi.mock("@/lib/prenotazioni-service", () => ({
  promuoviPrimoInCoda: mocks.promuoviPrimoInCoda,
}));
vi.mock("@/lib/realtime-events", () => ({
  emitCodaPromozione: mocks.emitCodaPromozione,
}));
// Il rate limiting non è oggetto di questo file: viene mockato per non far
// scattare 429 con le ripetute chiamate a route.POST nei test qui sotto.
vi.mock("@/lib/rate-limit", () => ({
  staffCriticalApiRateLimiter: vi.fn(async () => null),
}));

type Route = typeof import("@/app/api/admin/prenotazioni/route");
let route: Route;

const bibliotecario = {
  id: "bib-1",
  email: "bib@biblioflow.test",
  ruolo: "BIBLIOTECARIO",
};

const prenotazione = {
  id: "pren-1",
  userId: "studente-9",
  postoId: "posto-1",
  data: new Date("2030-06-10T00:00:00.000Z"),
  oraInizio: new Date("1970-01-01T09:00:00.000Z"),
  oraFine: new Date("1970-01-01T11:00:00.000Z"),
  stato: "CONFERMATA",
  user: { id: "studente-9", email: "s9@biblioflow.test" },
};

function request(body: object) {
  return new NextRequest("http://localhost/api/admin/prenotazioni", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeAll(async () => {
  route = await import("@/app/api/admin/prenotazioni/route");
});

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ user: bibliotecario });
  mocks.prisma.prenotazione.findUnique.mockResolvedValue(prenotazione);
  mocks.prisma.prenotazione.update.mockResolvedValue({ ...prenotazione });
  mocks.prisma.posto.update.mockResolvedValue({ id: "posto-x", stato: "DISPONIBILE" });
  mocks.prisma.$transaction.mockResolvedValue([]);
  mocks.prisma.logEvento.create.mockResolvedValue({ id: "log-1" });
  mocks.prisma.notifica.create.mockResolvedValue({ id: "notifica-1" });
});

describe("B-9 · MODIFICA valida data/orari prima di Prisma", () => {
  it("[TC-B9-001] oraInizio con formato non valido → 422, nessuna scrittura", async () => {
    const response = await route.POST(
      request({
        azione: "MODIFICA",
        prenotazioneId: prenotazione.id,
        nuoviDati: { oraInizio: "9am" },
      }),
    );

    expect(response.status).toBe(422);
    expect(mocks.prisma.prenotazione.update).not.toHaveBeenCalled();
  });

  it("[TC-B9-002] data non di calendario → 422", async () => {
    const response = await route.POST(
      request({
        azione: "MODIFICA",
        prenotazioneId: prenotazione.id,
        nuoviDati: { data: "2030-13-40" },
      }),
    );

    expect(response.status).toBe(422);
    expect(mocks.prisma.prenotazione.update).not.toHaveBeenCalled();
  });

  it("[TC-B9-003] intervallo incoerente (fine <= inizio) → 422", async () => {
    const response = await route.POST(
      request({
        azione: "MODIFICA",
        prenotazioneId: prenotazione.id,
        nuoviDati: { oraInizio: "11:00", oraFine: "09:00" },
      }),
    );

    expect(response.status).toBe(422);
    expect(mocks.prisma.prenotazione.update).not.toHaveBeenCalled();
  });

  it("[TC-B9-004] dati validi → 200 e update riceve Date normalizzate", async () => {
    const response = await route.POST(
      request({
        azione: "MODIFICA",
        prenotazioneId: prenotazione.id,
        nuoviDati: { data: "2030-06-15", oraInizio: "09:00", oraFine: "11:00" },
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.prisma.prenotazione.update).toHaveBeenCalledTimes(1);
    const arg = mocks.prisma.prenotazione.update.mock.calls[0][0] as {
      data: { data: Date; oraInizio: Date; oraFine: Date };
    };
    expect(arg.data.data).toBeInstanceOf(Date);
    expect(arg.data.data.toISOString()).toBe("2030-06-15T00:00:00.000Z");
    expect(arg.data.oraInizio.toISOString()).toBe("1970-01-01T09:00:00.000Z");
    expect(arg.data.oraFine.toISOString()).toBe("1970-01-01T11:00:00.000Z");
  });

  it("[TC-B9-005] solo oraFine, coerente con l'oraInizio esistente → 200", async () => {
    const response = await route.POST(
      request({
        azione: "MODIFICA",
        prenotazioneId: prenotazione.id,
        nuoviDati: { oraFine: "12:30" },
      }),
    );

    expect(response.status).toBe(200);
    const arg = mocks.prisma.prenotazione.update.mock.calls[0][0] as {
      data: { oraFine: Date };
    };
    expect(arg.data.oraFine.toISOString()).toBe("1970-01-01T12:30:00.000Z");
  });
});

/**
 * Difetto modifica-posto-non-aggiorna-stato-posti.
 *
 * PRIMA: cambiare il posto di una prenotazione in CHECK_IN aggiornava SOLO
 * `Prenotazione.postoId`. Il vecchio `Posto.stato` restava "OCCUPATO" per
 * sempre (nessuna prenotazione lo deteneva più) e il nuovo restava
 * "DISPONIBILE" nonostante uno studente vi fosse fisicamente "seduto"
 * secondo il sistema.
 */
describe("modifica-posto-non-aggiorna-stato-posti · MODIFICA con cambio posto", () => {
  const prenotazioneCheckIn = { ...prenotazione, stato: "CHECK_IN" as const };
  const nuovoPostoId = "posto-nuovo";

  beforeEach(() => {
    mocks.prisma.posto.findUnique.mockResolvedValue({
      id: nuovoPostoId,
      stato: "DISPONIBILE",
    });
  });

  it("[TC-MODPOSTO-001] prenotazione in CHECK_IN: libera il vecchio posto e occupa il nuovo, nella stessa transazione", async () => {
    mocks.prisma.prenotazione.findUnique.mockResolvedValue(prenotazioneCheckIn);

    const response = await route.POST(
      request({
        azione: "MODIFICA",
        prenotazioneId: prenotazioneCheckIn.id,
        nuoviDati: { postoId: nuovoPostoId },
      }),
    );

    expect(response.status).toBe(200);

    // Le tre scritture (prenotazione + i due posti) devono passare dalla
    // STESSA transazione (prisma.$transaction([...])): le singole chiamate
    // vengono costruite per formare l'array passato a $transaction (e sono
    // quindi comunque invocate), ma la garanzia di atomicità è che
    // $transaction le raggruppi in un'unica chiamata, non tre scritture
    // slegate.
    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.prenotazione.update).toHaveBeenCalledWith({
      where: { id: prenotazioneCheckIn.id },
      data: { postoId: nuovoPostoId },
    });
    expect(mocks.prisma.posto.update).toHaveBeenCalledTimes(2);

    expect(mocks.prisma.posto.update).toHaveBeenCalledWith({
      where: { id: prenotazioneCheckIn.postoId },
      data: { stato: "DISPONIBILE" },
    });
    expect(mocks.prisma.posto.update).toHaveBeenCalledWith({
      where: { id: nuovoPostoId },
      data: { stato: "OCCUPATO" },
    });
  });

  it("[TC-MODPOSTO-002] prenotazione CONFERMATA (nessun check-in attivo): nessun aggiornamento di stato dei posti", async () => {
    // `prenotazione` di default è CONFERMATA: nessun posto è fisicamente
    // occupato da questa prenotazione, quindi non va toccato `Posto.stato`.
    const response = await route.POST(
      request({
        azione: "MODIFICA",
        prenotazioneId: prenotazione.id,
        nuoviDati: { postoId: nuovoPostoId },
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
    expect(mocks.prisma.posto.update).not.toHaveBeenCalled();
    expect(mocks.prisma.prenotazione.update).toHaveBeenCalledTimes(1);
  });
});

/**
 * Difetto logevento-prenotazione-non-collegato (limitatamente al case
 * MODIFICA di questa route: gli altri case sono coperti in
 * tests/unit/admin-prenotazioni.test.ts).
 *
 * PRIMA: `prenotazioneId` veniva scritto SOLO dentro il JSON `dettagli`, mai
 * come colonna relazionale `LogEvento.prenotazioneId` — quella che GET
 * /api/prenotazioni/[id] legge per popolare `eventi`. In più, il case
 * MODIFICA registrava sempre `tipo: "PRENOTAZIONE_CANCELLATA"`, anche per
 * una modifica che non cancella nulla.
 */
describe("logevento-prenotazione-non-collegato · MODIFICA", () => {
  it("[TC-LOGEVT-MOD-001] collega prenotazioneId come colonna relazionale e non usa più PRENOTAZIONE_CANCELLATA", async () => {
    const response = await route.POST(
      request({
        azione: "MODIFICA",
        prenotazioneId: prenotazione.id,
        nuoviDati: { oraFine: "12:30" },
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.prisma.logEvento.create).toHaveBeenCalledTimes(1);
    const arg = mocks.prisma.logEvento.create.mock.calls[0][0] as {
      data: { tipo: string; prenotazioneId?: string };
    };
    expect(arg.data.prenotazioneId).toBe(prenotazione.id);
    expect(arg.data.tipo).not.toBe("PRENOTAZIONE_CANCELLATA");
  });
});
