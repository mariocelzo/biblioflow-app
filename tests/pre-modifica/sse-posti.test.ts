import { afterEach, describe, expect, it, vi } from "vitest";
import { createSSEStream, sseEmitter } from "@/lib/sse-emitter";
import { GET } from "@/app/api/sse/posti/route";

const decoder = new TextDecoder();

function controllerWithSpy() {
  const enqueue = vi.fn();
  const controller = {
    enqueue,
  } as unknown as ReadableStreamDefaultController;

  return { controller, enqueue };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("contratto SSE posti pre-modifica", () => {
  it("[PRE-SSE-001] espone headers SSE e invia il commento iniziale", async () => {
    vi.useFakeTimers();
    const response = await GET();
    const reader = response.body!.getReader();

    try {
      const firstChunk = await reader.read();

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("text/event-stream");
      expect(response.headers.get("cache-control")).toBe(
        "no-cache, no-store, must-revalidate",
      );
      expect(response.headers.get("connection")).toBe("keep-alive");
      expect(response.headers.get("x-accel-buffering")).toBe("no");
      expect(decoder.decode(firstChunk.value)).toBe(": connected\n\n");
    } finally {
      await reader.cancel();
      await vi.advanceTimersByTimeAsync(30_000);
    }
  });

  it("[PRE-SSE-002] usa framing event/data e consegna solo al canale richiesto o wildcard", () => {
    const postiClient = controllerWithSpy();
    const userClient = controllerWithSpy();
    const wildcardClient = controllerWithSpy();

    sseEmitter.addClient("pre-sse-002-posti", postiClient.controller, "posti");
    sseEmitter.addClient("pre-sse-002-user", userClient.controller, "user-1");
    sseEmitter.addClient("pre-sse-002-wildcard", wildcardClient.controller, "*");

    try {
      sseEmitter.emit("posti", "posto-update", {
        postoId: "posto-1",
        stato: "OCCUPATO",
      });

      const expected =
        'event: posto-update\ndata: {"postoId":"posto-1","stato":"OCCUPATO"}\n\n';
      expect(decoder.decode(postiClient.enqueue.mock.calls[0][0])).toBe(expected);
      expect(userClient.enqueue).not.toHaveBeenCalled();
      expect(decoder.decode(wildcardClient.enqueue.mock.calls[0][0])).toBe(expected);
    } finally {
      sseEmitter.removeClient("pre-sse-002-posti");
      sseEmitter.removeClient("pre-sse-002-user");
      sseEmitter.removeClient("pre-sse-002-wildcard");
    }
  });

  it("[PRE-SSE-003] mantiene il payload corrente dell'evento posto-update", async () => {
    process.env.DATABASE_URL ??=
      "postgresql://biblioflow_test@127.0.0.1:5433/biblioflow_test";
    const emit = vi.spyOn(sseEmitter, "emit").mockImplementation(() => undefined);
    const { emitPostoUpdate } = await import("@/lib/realtime-events");

    emitPostoUpdate(
      "posto-3",
      "MANUTENZIONE",
      "A3",
      "sala-1",
      "Sala studio",
    );

    expect(emit).toHaveBeenCalledOnce();
    expect(emit).toHaveBeenCalledWith(
      "posti",
      "posto-update",
      expect.objectContaining({
        postoId: "posto-3",
        stato: "MANUTENZIONE",
        numero: "A3",
        salaId: "sala-1",
        salaNome: "Sala studio",
        timestamp: expect.any(String),
      }),
    );
  });

  it("[PRE-SSE-004] rimuove il client quando lo stream viene chiuso", async () => {
    vi.useFakeTimers();
    const initialCount = sseEmitter.getClientCount("posti");
    const stream = createSSEStream("posti");
    const reader = stream.getReader();

    expect(sseEmitter.getClientCount("posti")).toBe(initialCount + 1);
    await reader.read();
    await reader.cancel();
    expect(sseEmitter.getClientCount("posti")).toBe(initialCount);

    await vi.advanceTimersByTimeAsync(30_000);
  });
});
