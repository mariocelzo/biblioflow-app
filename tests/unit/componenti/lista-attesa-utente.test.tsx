// @vitest-environment jsdom
// ============================================================================
// Test del componente ListaAttesaUtente (D-13, CR02)
// ============================================================================
// COSA: la scheda "Lista d'attesa" di "Le mie prenotazioni": elenco delle
//       richieste con posizione, uscita dalla coda, stati vuoto ed errore.
// PERCHE': prima di questa correzione nessuna schermata mostrava le richieste
//       in coda ne' permetteva di uscirne, pur esistendo l'API per farlo.

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

import { ListaAttesaUtente, type RichiestaInCoda } from "@/components/lista-attesa-utente";

const richiesta = (id: string, numero: string, posizione: number): RichiestaInCoda => ({
  id,
  data: "2030-01-15T00:00:00.000Z",
  oraInizio: "1970-01-01T09:00:00.000Z",
  oraFine: "1970-01-01T13:00:00.000Z",
  posizione,
  posto: { id: `posto-${numero}`, numero, sala: { nome: "Sala Studio Principale", piano: 1 } },
});

const json = (status: number, corpo: unknown) => new Response(JSON.stringify(corpo), { status });

let fetchFinto: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchFinto = vi.fn();
  vi.stubGlobal("fetch", fetchFinto);
  toast.success.mockReset();
  toast.error.mockReset();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ListaAttesaUtente", () => {
  it("[TC-UI-CODA-001] elenca le richieste con posto, sala, giorno, fascia e posizione e comunica il conteggio", async () => {
    fetchFinto.mockResolvedValue(json(200, { data: [richiesta("r1", "A1", 1), richiesta("r2", "B4", 3)] }));
    const onConteggio = vi.fn();
    render(<ListaAttesaUtente onConteggio={onConteggio} />);

    expect(await screen.findByText("Posto A1 · Sala Studio Principale")).toBeTruthy();
    expect(screen.getByText("Posto B4 · Sala Studio Principale")).toBeTruthy();
    expect(screen.getAllByText(/martedì 15 gennaio, 09:00 – 13:00/i)).toHaveLength(2);
    expect(screen.getByLabelText("Posizione in coda 1")).toBeTruthy();
    expect(screen.getByLabelText("Posizione in coda 3")).toBeTruthy();
    await waitFor(() => expect(onConteggio).toHaveBeenLastCalledWith(2));
  });

  it("[TC-UI-CODA-002] uscire dalla coda chiama l'API giusta e rilegge le posizioni", async () => {
    fetchFinto
      .mockResolvedValueOnce(json(200, { data: [richiesta("r1", "A1", 1), richiesta("r2", "B4", 2)] }))
      .mockResolvedValueOnce(json(200, { success: true }))
      .mockResolvedValueOnce(json(200, { data: [richiesta("r2", "B4", 1)] }));
    render(<ListaAttesaUtente />);

    await userEvent.click(await screen.findByRole("button", { name: "Esci dalla lista d'attesa per il posto A1" }));

    await waitFor(() => expect(screen.queryByText("Posto A1 · Sala Studio Principale")).toBeNull());
    expect(fetchFinto.mock.calls[1]).toEqual(["/api/prenotazioni/coda?id=r1", { method: "DELETE" }]);
    expect(screen.getByLabelText("Posizione in coda 1")).toBeTruthy();
    expect(toast.success).toHaveBeenCalledWith("Sei uscito dalla lista d'attesa", expect.anything());
  });

  it("[TC-UI-CODA-003] se l'uscita e' rifiutata mostra il motivo e lascia la richiesta", async () => {
    fetchFinto
      .mockResolvedValueOnce(json(200, { data: [richiesta("r1", "A1", 1)] }))
      .mockResolvedValueOnce(json(409, { error: "La richiesta non è più annullabile" }));
    render(<ListaAttesaUtente />);
    await userEvent.click(await screen.findByRole("button", { name: /Esci dalla lista d'attesa/ }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("La richiesta non è più annullabile"));
    expect(screen.getByText("Posto A1 · Sala Studio Principale")).toBeTruthy();
  });

  it("[TC-UI-CODA-004] senza richieste spiega come entrare in coda", async () => {
    fetchFinto.mockResolvedValue(json(200, { data: [] }));
    render(<ListaAttesaUtente />);
    expect(await screen.findByText("Non sei in nessuna lista d'attesa")).toBeTruthy();
  });

  it("[TC-UI-CODA-005] se il caricamento fallisce propone di riprovare, e riprovando carica", async () => {
    fetchFinto.mockResolvedValueOnce(json(500, {})).mockResolvedValueOnce(json(200, { data: [richiesta("r1", "A1", 2)] }));
    render(<ListaAttesaUtente />);
    await userEvent.click(await screen.findByRole("button", { name: "Riprova" }));
    expect(await screen.findByLabelText("Posizione in coda 2")).toBeTruthy();
  });
});
