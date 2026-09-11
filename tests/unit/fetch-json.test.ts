// ============================================================================
// Test unit per fetchJson / ApiError (fix "feedback silenzioso")
// ============================================================================
// COSA: verifica che fetchJson() distingua correttamente una risposta HTTP
//       riuscita da una fallita (status non-2xx) e da un errore di rete, e
//       che nei casi di errore produca sempre una ApiError con un messaggio
//       leggibile - il comportamento che le pagine usano per mostrare un
//       toast.error invece di restare silenziosamente con liste vuote.
// PERCHE': questo helper e' stato introdotto proprio per evitare che il
//       pattern `if (res.ok) {...}` senza `else` si ripresenti in nuove
//       pagine; una regressione qui riaprirebbe il problema alla radice.

import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError, fetchJson } from "@/lib/fetch-json";

describe("fetchJson (fix feedback silenzioso)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("[TC-FJ-001] risolve con i dati quando la risposta è ok", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ data: [1, 2, 3] }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await fetchJson<{ data: number[] }>("/api/qualcosa");

    expect(result).toEqual({ data: [1, 2, 3] });
    expect(mockFetch).toHaveBeenCalledWith("/api/qualcosa", undefined);
  });

  it("[TC-FJ-002] lancia ApiError con il messaggio del body su risposta 4xx/5xx", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: () => Promise.resolve({ error: "Accesso negato" }),
    });
    vi.stubGlobal("fetch", mockFetch);

    await expect(fetchJson("/api/protetto")).rejects.toMatchObject({
      name: "ApiError",
      message: "Accesso negato",
      status: 403,
    });
  });

  it("[TC-FJ-003] usa un messaggio generico se il body non è JSON valido", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.reject(new Error("body non JSON")),
    });
    vi.stubGlobal("fetch", mockFetch);

    await expect(fetchJson("/api/rotto")).rejects.toMatchObject({
      message: "Richiesta fallita con stato 500",
      status: 500,
    });
  });

  it("[TC-FJ-004] propaga un errore di rete (fetch che rifiuta la Promise)", async () => {
    const mockFetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", mockFetch);

    await expect(fetchJson("/api/qualcosa")).rejects.toThrow("Failed to fetch");
  });

  it("[TC-FJ-005] ApiError espone lo status per permettere logiche condizionali", () => {
    const err = new ApiError("messaggio", 404);
    expect(err).toBeInstanceOf(Error);
    expect(err.status).toBe(404);
    expect(err.name).toBe("ApiError");
  });
});
