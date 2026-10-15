// ============================================================================
// Test di POST /api/admin/anomalie — azioni sui no-show e azioni di massa
// ============================================================================
// COSA: RISOLVI_TUTTE_NOSHOW, AVVISA_SINGOLO_UTENTE, ANNULLA_PRENOTAZIONI_SENZA_CHECKIN,
//       INVIA_ALERT_BROADCAST, azione sconosciuta e controlli di accesso.
// PERCHE': la parte no-show della route era scoperta e nascondeva due difetti:
//   - D-03: si filtrava su `tipo: "NO_SHOW"` soltanto, ignorando i rilasci
//     automatici del cron (`NO_SHOW_AUTO`), cioe' il caso piu' frequente;
//   - D-04: "Risolvi tutte" leggeva gli eventi con `distinct: ["userId"]` e
//     chiudeva un solo evento per utente: chi aveva due no-show restava in
//     pagina Anomalie anche dopo la risoluzione.

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  rateLimit: vi.fn(),
  releaseNoShowReservations: vi.fn(),
  prisma: {
    logEvento: { findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
    notifica: { create: vi.fn() },
    user: { findMany: vi.fn() },
    prestito: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/prisma", () => ({ default: mocks.prisma, prisma: mocks.prisma }));
vi.mock("@/lib/rate-limit", () => ({ staffCriticalApiRateLimiter: mocks.rateLimit }));
vi.mock("@/lib/automation-service", () => ({
  releaseNoShowReservations: mocks.releaseNoShowReservations,
}));

const route = await import("@/app/api/admin/anomalie/route");

const staff = { id: "staff-1", ruolo: "ADMIN" };

function richiesta(corpo: object) {
  return new NextRequest("http://localhost/api/admin/anomalie", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(corpo),
  });
}

function evento(id: string, userId: string | null, tipo: string, dettagli: object | null = {}) {
  return { id, userId, tipo, dettagli, createdAt: new Date() };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ user: staff });
  mocks.rateLimit.mockResolvedValue(null);
  mocks.prisma.notifica.create.mockImplementation(async ({ data }) => ({ id: `n-${data.userId}`, ...data }));
  mocks.prisma.logEvento.update.mockResolvedValue({});
  mocks.prisma.logEvento.create.mockResolvedValue({ id: "log-azione" });
});

describe("accesso", () => {
  it("[TC-ANOM-ACC-001] anonimo 401, studente 403, nessuna lettura", async () => {
    mocks.auth.mockResolvedValueOnce(null);
    expect((await route.POST(richiesta({ azione: "RISOLVI_TUTTE_NOSHOW" }))).status).toBe(401);
    mocks.auth.mockResolvedValueOnce({ user: { id: "s", ruolo: "STUDENTE" } });
    expect((await route.POST(richiesta({ azione: "RISOLVI_TUTTE_NOSHOW" }))).status).toBe(403);
    expect(mocks.prisma.logEvento.findMany).not.toHaveBeenCalled();
    expect(mocks.rateLimit).not.toHaveBeenCalled();
  });

  it("[TC-ANOM-ACC-002] il limitatore dello staff blocca prima di qualsiasi azione", async () => {
    mocks.rateLimit.mockResolvedValue(new Response(null, { status: 429 }));
    expect((await route.POST(richiesta({ azione: "INVIA_ALERT_BROADCAST" }))).status).toBe(429);
    expect(mocks.prisma.user.findMany).not.toHaveBeenCalled();
  });

  it("[TC-ANOM-ACC-003] un'azione sconosciuta risponde 400 senza log", async () => {
    expect((await route.POST(richiesta({ azione: "CANCELLA_TUTTO" }))).status).toBe(400);
    expect(mocks.prisma.logEvento.create).not.toHaveBeenCalled();
  });
});

describe("RISOLVI_TUTTE_NOSHOW", () => {
  it("[TC-ANOM-NS-001] D-03: considera no-show manuali e automatici", async () => {
    mocks.prisma.logEvento.findMany.mockResolvedValue([]);
    await route.POST(richiesta({ azione: "RISOLVI_TUTTE_NOSHOW" }));
    const where = mocks.prisma.logEvento.findMany.mock.calls[0][0].where;
    expect(where.tipo).toEqual({ in: ["NO_SHOW", "NO_SHOW_AUTO"] });
    expect(where.createdAt.gte).toBeInstanceOf(Date);
    // D-04: nessun `distinct`, altrimenti si perdono gli eventi successivi al primo.
    expect(mocks.prisma.logEvento.findMany.mock.calls[0][0]).not.toHaveProperty("distinct");
  });

  it("[TC-ANOM-NS-002] D-04: un avviso per utente, ma tutti i suoi eventi aperti vengono chiusi", async () => {
    mocks.prisma.logEvento.findMany.mockResolvedValue([
      evento("e1", "anna", "NO_SHOW_AUTO", { prenotazioneId: "p1" }),
      evento("e2", "anna", "NO_SHOW_AUTO", null),
      evento("e3", "anna", "NO_SHOW", { risolto: true }),
      evento("e4", "bruno", "NO_SHOW", {}),
      evento("e5", null, "NO_SHOW_AUTO", {}),
    ]);

    const risposta = await route.POST(richiesta({ azione: "RISOLVI_TUTTE_NOSHOW" }));
    expect(risposta.status).toBe(200);
    await expect(risposta.json()).resolves.toMatchObject({ success: true, count: 2, eventiRisolti: 3 });

    expect(mocks.prisma.notifica.create).toHaveBeenCalledTimes(2);
    expect(mocks.prisma.notifica.create.mock.calls.map((c) => c[0].data.userId).sort()).toEqual(["anna", "bruno"]);

    const aggiornati = mocks.prisma.logEvento.update.mock.calls.map((c) => c[0].where.id).sort();
    expect(aggiornati).toEqual(["e1", "e2", "e4"]);
    const dettagliE1 = mocks.prisma.logEvento.update.mock.calls.find((c) => c[0].where.id === "e1")![0].data.dettagli;
    expect(dettagliE1).toMatchObject({ prenotazioneId: "p1", risolto: true, risoltoDa: "staff-1" });

    expect(mocks.prisma.logEvento.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tipo: "OVERRIDE_BIBLIOTECARIO",
        userId: "staff-1",
        dettagli: expect.objectContaining({ azione: "RISOLVI_TUTTE_NOSHOW" }),
      }),
    });
  });

  it("[TC-ANOM-NS-003] senza eventi aperti non invia nulla", async () => {
    mocks.prisma.logEvento.findMany.mockResolvedValue([evento("e1", "anna", "NO_SHOW", { risolto: true })]);
    const corpo = await (await route.POST(richiesta({ azione: "RISOLVI_TUTTE_NOSHOW" }))).json();
    expect(corpo).toMatchObject({ count: 0, eventiRisolti: 0 });
    expect(mocks.prisma.notifica.create).not.toHaveBeenCalled();
  });
});

describe("AVVISA_SINGOLO_UTENTE", () => {
  it("[TC-ANOM-SU-001] senza userId risponde 400", async () => {
    expect((await route.POST(richiesta({ azione: "AVVISA_SINGOLO_UTENTE" }))).status).toBe(400);
  });

  it("[TC-ANOM-SU-002] chiude tutti gli eventi aperti dell'utente, manuali e automatici", async () => {
    mocks.prisma.logEvento.findMany.mockResolvedValue([
      evento("e1", "anna", "NO_SHOW_AUTO"),
      evento("e2", "anna", "NO_SHOW", { risolto: true }),
      evento("e3", "anna", "NO_SHOW", null),
    ]);
    const risposta = await route.POST(richiesta({ azione: "AVVISA_SINGOLO_UTENTE", userId: "anna" }));
    await expect(risposta.json()).resolves.toMatchObject({ success: true, count: 2 });
    expect(mocks.prisma.logEvento.findMany.mock.calls[0][0].where).toMatchObject({
      userId: "anna",
      tipo: { in: ["NO_SHOW", "NO_SHOW_AUTO"] },
    });
    expect(mocks.prisma.notifica.create).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.logEvento.update.mock.calls.map((c) => c[0].where.id)).toEqual(["e1", "e3"]);
  });

  it("[TC-ANOM-SU-003] senza eventi aperti non disturba l'utente", async () => {
    mocks.prisma.logEvento.findMany.mockResolvedValue([]);
    const corpo = await (await route.POST(richiesta({ azione: "AVVISA_SINGOLO_UTENTE", userId: "anna" }))).json();
    expect(corpo).toMatchObject({ count: 0 });
    expect(mocks.prisma.notifica.create).not.toHaveBeenCalled();
  });
});

describe("altre azioni di massa", () => {
  it("[TC-ANOM-MAS-001] l'annullamento senza check-in delega alla stessa funzione del cron", async () => {
    mocks.releaseNoShowReservations.mockResolvedValue({ released: 3 });
    const corpo = await (await route.POST(richiesta({ azione: "ANNULLA_PRENOTAZIONI_SENZA_CHECKIN" }))).json();
    expect(mocks.releaseNoShowReservations).toHaveBeenCalledTimes(1);
    expect(corpo).toMatchObject({ success: true, count: 3 });
  });

  it("[TC-ANOM-MAS-002] il broadcast raggiunge solo gli utenti attivi, con testo di ripiego", async () => {
    mocks.prisma.user.findMany.mockResolvedValue([{ id: "u1" }, { id: "u2" }]);
    const corpo = await (await route.POST(richiesta({ azione: "INVIA_ALERT_BROADCAST" }))).json();
    expect(mocks.prisma.user.findMany).toHaveBeenCalledWith({ where: { attivo: true }, select: { id: true } });
    expect(corpo).toMatchObject({ count: 2 });
    expect(mocks.prisma.notifica.create.mock.calls[0][0].data).toMatchObject({
      titolo: "Avviso dalla Biblioteca",
      messaggio: "Messaggio importante dalla biblioteca.",
    });
  });

  it("[TC-ANOM-MAS-003] un errore inatteso diventa un 500 generico", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.prisma.user.findMany.mockRejectedValue(new Error("connessione persa"));
    const risposta = await route.POST(richiesta({ azione: "INVIA_ALERT_BROADCAST", titolo: "x" }));
    expect(risposta.status).toBe(500);
    expect(JSON.stringify(await risposta.json())).not.toContain("connessione persa");
  });
});
