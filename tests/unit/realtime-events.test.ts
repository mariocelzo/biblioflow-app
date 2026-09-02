/**
 * Test di contratto per gli helper realtime della lista d'attesa (BIB-45 / CA-06).
 *
 * Obiettivo:
 * 1. bloccare canale, nome-evento e forma del payload dei NUOVI helper
 *    `emitCodaIngresso` / `emitCodaPromozione`;
 * 2. verificare che gli helper GIÀ esistenti (`emitPostoUpdate`,
 *    `emitNotificaRealtime`, `broadcastMessage`) continuino a chiamare il
 *    singleton `sseEmitter` esattamente come prima, così la mappa posti non
 *    cambia comportamento;
 * 3. verificare la propagazione a più client sul canale `posti` contro
 *    l'implementazione REALE di `sse-emitter`.
 *
 * Per i punti 1-2 il singleton `sseEmitter` è sostituito con `vi.mock`: qui
 * interessa solo COSA viene emesso, non il trasporto.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// --- Mock del trasporto SSE ------------------------------------------------
// `realtime-events` importa `sseEmitter` da './sse-emitter'; vitest risolve mock
// e import relativo allo stesso file, quindi l'intercettazione funziona anche
// per l'import interno al modulo sotto test.
vi.mock("@/lib/sse-emitter", () => ({
  sseEmitter: {
    emit: vi.fn(),
    broadcast: vi.fn(),
    emitToClient: vi.fn(),
    addClient: vi.fn(),
    removeClient: vi.fn(),
    getClientCount: vi.fn(() => 0),
  },
  createSSEStream: vi.fn(),
}));

// `realtime-events` importa anche `@/lib/prisma`, che al load pretende
// DATABASE_URL e aprirebbe un pool Postgres: lo stubbiamo perché questi test
// non toccano il DB (usano solo gli helper sincroni).
vi.mock("@/lib/prisma", () => ({
  prisma: {},
  default: {},
}));

import { sseEmitter } from "@/lib/sse-emitter";
import {
  broadcastMessage,
  emitCodaIngresso,
  emitCodaPromozione,
  emitNotificaRealtime,
  emitPostoUpdate,
} from "@/lib/realtime-events";

// Riferimenti tipati ai mock del singleton.
const emitMock = vi.mocked(sseEmitter.emit);
const broadcastMock = vi.mocked(sseEmitter.broadcast);

// `clearMocks: true` in vitest.config azzera lo storico tra i test; qui fissiamo
// solo un orologio deterministico per non dover ragionare sul timestamp reale.
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2030-01-15T09:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("emitCodaIngresso — nuovo evento coda (BIB-45)", () => {
  const payload = {
    postoId: "posto-bib45-01",
    numero: "A7",
    salaId: "sala-bib45",
    data: "2030-01-15",
    oraInizio: "09:00",
    oraFine: "11:00",
    posizione: 2,
  };

  it("[TC-BIB45-001] emette sul canale 'posti' l'evento 'coda-ingresso' con payload completo + timestamp", () => {
    emitCodaIngresso(payload);

    expect(emitMock).toHaveBeenCalledTimes(1);
    expect(emitMock).toHaveBeenCalledWith("posti", "coda-ingresso", {
      ...payload,
      timestamp: "2030-01-15T09:00:00.000Z",
    });
  });

  it("[TC-BIB45-002] non usa altri canali né il broadcast globale", () => {
    emitCodaIngresso(payload);

    const canali = emitMock.mock.calls.map(([canale]) => canale);
    expect(canali).toEqual(["posti"]);
    expect(broadcastMock).not.toHaveBeenCalled();
  });
});

describe("emitCodaPromozione — nuovo evento coda (BIB-45)", () => {
  const payload = {
    userId: "utente-bib45-09",
    postoId: "posto-bib45-01",
    numero: "A7",
    prenotazioneId: "pren-bib45-77",
    data: "2030-01-15",
    oraInizio: "09:00",
    oraFine: "11:00",
  };

  it("[TC-BIB45-003] emette 'coda-promozione' sul canale pubblico 'posti'", () => {
    emitCodaPromozione(payload);

    expect(emitMock).toHaveBeenCalledWith("posti", "coda-promozione", {
      ...payload,
      timestamp: "2030-01-15T09:00:00.000Z",
    });
  });

  it("[TC-BIB45-004] avvisa l'utente promosso su 'user-<id>' riusando il contratto 'nuova-notifica'", () => {
    emitCodaPromozione(payload);

    expect(emitMock).toHaveBeenCalledWith(
      `user-${payload.userId}`,
      "nuova-notifica",
      expect.objectContaining({
        id: `coda-promozione-${payload.prenotazioneId}`,
        tipo: "CODA_PROMOZIONE",
        actionUrl: `/prenotazioni/${payload.prenotazioneId}`,
        titolo: expect.any(String),
        messaggio: expect.any(String),
        timestamp: "2030-01-15T09:00:00.000Z",
      }),
    );
  });

  it("[TC-BIB45-005] emette esattamente due volte: prima la sala, poi l'utente", () => {
    emitCodaPromozione(payload);

    expect(emitMock).toHaveBeenCalledTimes(2);
    const canali = emitMock.mock.calls.map(([canale]) => canale);
    expect(canali).toEqual(["posti", `user-${payload.userId}`]);
  });
});

describe("regressione: gli helper esistenti non cambiano contratto", () => {
  it("[TC-BIB45-006] emitPostoUpdate resta 'posti' / 'posto-update' con lo stesso payload", () => {
    emitPostoUpdate("posto-3", "MANUTENZIONE", "A3", "sala-1", "Sala studio");

    expect(emitMock).toHaveBeenCalledTimes(1);
    expect(emitMock).toHaveBeenCalledWith("posti", "posto-update", {
      postoId: "posto-3",
      stato: "MANUTENZIONE",
      numero: "A3",
      salaId: "sala-1",
      salaNome: "Sala studio",
      timestamp: "2030-01-15T09:00:00.000Z",
    });
  });

  it("[TC-BIB45-007] emitNotificaRealtime resta 'user-<id>' / 'nuova-notifica'", () => {
    emitNotificaRealtime("utente-1", {
      id: "notifica-1",
      tipo: "INFO",
      titolo: "Titolo",
      messaggio: "Messaggio",
      actionUrl: "/x",
    });

    expect(emitMock).toHaveBeenCalledTimes(1);
    expect(emitMock).toHaveBeenCalledWith("user-utente-1", "nuova-notifica", {
      id: "notifica-1",
      tipo: "INFO",
      titolo: "Titolo",
      messaggio: "Messaggio",
      actionUrl: "/x",
      timestamp: "2030-01-15T09:00:00.000Z",
    });
  });

  it("[TC-BIB45-008] broadcastMessage continua a usare sseEmitter.broadcast", () => {
    broadcastMessage("evento-x", { foo: "bar" });

    expect(broadcastMock).toHaveBeenCalledWith("evento-x", {
      foo: "bar",
      timestamp: "2030-01-15T09:00:00.000Z",
    });
    expect(emitMock).not.toHaveBeenCalled();
  });
});

describe("propagazione multi-client sul canale 'posti' (BIB-45)", () => {
  // Qui serve l'implementazione VERA di sse-emitter: `importActual` bypassa il
  // `vi.mock` di questo file. `sse-emitter` non ha dipendenze con side-effect.
  const decoder = new TextDecoder();

  function fakeClient() {
    const enqueue = vi.fn();
    return {
      enqueue,
      controller: { enqueue } as unknown as ReadableStreamDefaultController,
    };
  }

  it("[TC-BIB45-009] 'coda-ingresso' raggiunge tutti i client 'posti' e il wildcard, non altri canali", async () => {
    const { sseEmitter: realEmitter } = await vi.importActual<
      typeof import("@/lib/sse-emitter")
    >("@/lib/sse-emitter");

    const postiA = fakeClient();
    const postiB = fakeClient();
    const wildcard = fakeClient();
    const altroCanale = fakeClient();

    realEmitter.addClient("bib45-posti-a", postiA.controller, "posti");
    realEmitter.addClient("bib45-posti-b", postiB.controller, "posti");
    realEmitter.addClient("bib45-wildcard", wildcard.controller, "*");
    realEmitter.addClient("bib45-user", altroCanale.controller, "user-9");

    try {
      realEmitter.emit("posti", "coda-ingresso", { postoId: "p1", posizione: 1 });

      const atteso =
        'event: coda-ingresso\ndata: {"postoId":"p1","posizione":1}\n\n';
      expect(decoder.decode(postiA.enqueue.mock.calls[0][0])).toBe(atteso);
      expect(decoder.decode(postiB.enqueue.mock.calls[0][0])).toBe(atteso);
      expect(decoder.decode(wildcard.enqueue.mock.calls[0][0])).toBe(atteso);
      expect(altroCanale.enqueue).not.toHaveBeenCalled();
    } finally {
      realEmitter.removeClient("bib45-posti-a");
      realEmitter.removeClient("bib45-posti-b");
      realEmitter.removeClient("bib45-wildcard");
      realEmitter.removeClient("bib45-user");
    }
  });

  it("[TC-BIB45-010] la promozione mirata raggiunge solo il canale 'user-<id>' dell'utente promosso", async () => {
    const { sseEmitter: realEmitter } = await vi.importActual<
      typeof import("@/lib/sse-emitter")
    >("@/lib/sse-emitter");

    const utentePromosso = fakeClient();
    const altroUtente = fakeClient();
    const postiView = fakeClient();

    realEmitter.addClient("bib45-user-9", utentePromosso.controller, "user-9");
    realEmitter.addClient("bib45-user-7", altroUtente.controller, "user-7");
    realEmitter.addClient("bib45-posti-view", postiView.controller, "posti");

    try {
      realEmitter.emit("user-9", "nuova-notifica", { id: "coda-promozione-x" });

      expect(utentePromosso.enqueue).toHaveBeenCalledTimes(1);
      expect(altroUtente.enqueue).not.toHaveBeenCalled();
      expect(postiView.enqueue).not.toHaveBeenCalled();
    } finally {
      realEmitter.removeClient("bib45-user-9");
      realEmitter.removeClient("bib45-user-7");
      realEmitter.removeClient("bib45-posti-view");
    }
  });
});
