/**
 * Test per il difetto solleciti-multipli-non-idempotenti.
 *
 * PRIMA: due chiamate consecutive a POST /api/admin/prestiti con
 * `{azione: "SOLLECITA_MULTIPLI", prestitoIds: [...]}` sullo stesso prestito
 * scaduto creavano DUE Notifiche IDENTICHE di sollecito, a pochi secondi di
 * distanza — nessun controllo impediva il doppio invio su un retry o un
 * doppio click di "Sollecita Tutti".
 *
 * ORA: prima di sollecitare un prestito si controlla se esiste già un
 * LogEvento "sollecito" (singolo o batch) per quello stesso prestito nelle
 * ultime 24h; in tal caso il prestito viene saltato (nessuna nuova Notifica,
 * nessun nuovo LogEvento) e conteggiato in `saltatiRecente`.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  prisma: {
    prestito: { findMany: vi.fn() },
    logEvento: { create: vi.fn(), findMany: vi.fn() },
    notifica: { create: vi.fn() },
  },
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/prisma", () => ({ default: mocks.prisma }));
vi.mock("@/lib/rate-limit", () => ({
  staffCriticalApiRateLimiter: vi.fn(async () => null),
}));

type AdminPrestitiRoute = typeof import("@/app/api/admin/prestiti/route");
let route: AdminPrestitiRoute;

const bibliotecario = {
  id: "bibliotecario-1",
  email: "bibliotecario@biblioflow.test",
  ruolo: "BIBLIOTECARIO",
};

const prestitoScaduto = {
  id: "prestito-idem-1",
  userId: "utente-1",
  dataScadenza: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
  libro: { id: "libro-1", titolo: "Il Signore degli Anelli" },
  user: { id: "utente-1" },
};

function sollecitaMultipli(prestitoIds: string[]) {
  return new NextRequest("http://localhost/api/admin/prestiti", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ azione: "SOLLECITA_MULTIPLI", prestitoIds }),
  });
}

beforeEach(async () => {
  vi.resetAllMocks();
  route = await import("@/app/api/admin/prestiti/route");
  mocks.auth.mockResolvedValue({ user: bibliotecario });
  mocks.prisma.prestito.findMany.mockResolvedValue([prestitoScaduto]);
  mocks.prisma.notifica.create.mockResolvedValue({ id: "notifica-1" });
  mocks.prisma.logEvento.create.mockResolvedValue({ id: "log-1" });
});

describe("SOLLECITA_MULTIPLI · idempotenza (finestra anti-duplicato)", () => {
  it("[TC-PREST-IDEM-001] senza solleciti recenti, invia la notifica normalmente", async () => {
    mocks.prisma.logEvento.findMany.mockResolvedValue([]);

    const res = await route.POST(sollecitaMultipli([prestitoScaduto.id]));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(mocks.prisma.notifica.create).toHaveBeenCalledTimes(1);
    expect(data.saltatiRecente).toBe(0);
  });

  it("[TC-PREST-IDEM-002] con un sollecito batch già inviato nelle ultime 24h per LO STESSO prestito, non crea una seconda Notifica", async () => {
    mocks.prisma.logEvento.findMany.mockResolvedValue([
      {
        id: "log-precedente",
        userId: prestitoScaduto.user.id,
        createdAt: new Date(Date.now() - 60 * 60 * 1000), // 1h fa
        dettagli: {
          prestitoId: prestitoScaduto.id,
          azione: "sollecito_batch",
        },
      },
    ]);

    const res = await route.POST(sollecitaMultipli([prestitoScaduto.id]));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(mocks.prisma.notifica.create).not.toHaveBeenCalled();
    expect(mocks.prisma.logEvento.create).not.toHaveBeenCalled();
    expect(data.saltatiRecente).toBe(1);
    expect(data.message).toContain("0");
  });

  it("[TC-PREST-IDEM-003] con un sollecito SINGOLO già inviato di recente (azione='sollecito'), salta comunque il batch", async () => {
    // AVVISA_SINGOLO_UTENTE ha un proprio meccanismo, ma SOLLECITA_SINGOLO
    // (stesso file) scrive un LogEvento con `azione: "sollecito"`. Il batch
    // deve riconoscerlo come lo stesso tipo di sollecito, non solo la
    // propria variante "sollecito_batch", altrimenti i due punti di ingresso
    // si aggirano a vicenda.
    mocks.prisma.logEvento.findMany.mockResolvedValue([
      {
        id: "log-singolo-precedente",
        userId: prestitoScaduto.user.id,
        createdAt: new Date(Date.now() - 30 * 60 * 1000),
        dettagli: { prestitoId: prestitoScaduto.id, azione: "sollecito" },
      },
    ]);

    const res = await route.POST(sollecitaMultipli([prestitoScaduto.id]));

    expect(res.status).toBe(200);
    expect(mocks.prisma.notifica.create).not.toHaveBeenCalled();
  });

  it("[TC-PREST-IDEM-004] un sollecito recente per un ALTRO prestito non blocca questo", async () => {
    mocks.prisma.logEvento.findMany.mockResolvedValue([
      {
        id: "log-altro-prestito",
        userId: prestitoScaduto.user.id,
        createdAt: new Date(Date.now() - 60 * 60 * 1000),
        dettagli: { prestitoId: "un-altro-prestito", azione: "sollecito_batch" },
      },
    ]);

    const res = await route.POST(sollecitaMultipli([prestitoScaduto.id]));

    expect(res.status).toBe(200);
    expect(mocks.prisma.notifica.create).toHaveBeenCalledTimes(1);
  });

  it("[TC-PREST-IDEM-005] un LogEvento oltre le 24h (fuori finestra, filtrato lato query) non blocca il sollecito", async () => {
    // La query stessa filtra su `createdAt >= oggi - 24h`: un mock che
    // rispetta lo stesso contratto (nessun evento restituito perché troppo
    // vecchio) verifica che il codice non applichi un'ulteriore finestra
    // implicita più stretta.
    mocks.prisma.logEvento.findMany.mockResolvedValue([]);

    const res = await route.POST(sollecitaMultipli([prestitoScaduto.id]));

    expect(res.status).toBe(200);
    expect(mocks.prisma.notifica.create).toHaveBeenCalledTimes(1);

    // La query di dedup deve davvero filtrare su una finestra di 24h.
    const chiamata = mocks.prisma.logEvento.findMany.mock.calls[0][0];
    expect(chiamata.where.createdAt.gte).toBeInstanceOf(Date);
    const finestraMs = Date.now() - chiamata.where.createdAt.gte.getTime();
    expect(finestraMs).toBeGreaterThanOrEqual(24 * 60 * 60 * 1000 - 5000);
    expect(finestraMs).toBeLessThanOrEqual(24 * 60 * 60 * 1000 + 5000);
  });
});
