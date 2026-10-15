// @vitest-environment jsdom
// ============================================================================
// Test del componente MappaBiblioteca (vista desktop dei posti, CR02)
// ============================================================================
// COSA: la mappa SVG della sala: posti interattivi, uso da tastiera, pannello
//       della lista d'attesa, ripiego sulla griglia su schermi piccoli.
// PERCHE': mappa e griglia mobile devono comportarsi allo stesso modo (CA-03).
//       La griglia e' verificata in mobile-posti-grid.test.tsx; qui si verifica
//       che la mappa usi lo stesso flusso, con in piu' l'accesso da tastiera,
//       che sulla mappa SVG non e' gratuito come su un <button>.

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

import { MappaBiblioteca, type Posto } from "@/components/mappa-biblioteca";

const caratteristiche = { presaElettrica: true, finestraVicina: false, silenzioso: false, wifi: true, accessibile: false };
const posto = (id: string, numero: string, stato: Posto["stato"]): Posto => ({ id, numero, x: 0, y: 0, stato, caratteristiche });
const POSTI = [posto("a1", "A1", "DISPONIBILE"), posto("a2", "A2", "OCCUPATO"), posto("a3", "A3", "MANUTENZIONE"), posto("a4", "A4", "PRENOTATO")];
const INTERVALLO = { data: "2030-01-15", oraInizio: "09:00", oraFine: "11:00" };

function monta(larghezza: number, onSelectPosto = vi.fn()) {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: larghezza });
  render(
    <MappaBiblioteca
      sala="Sala Studio Principale"
      piano={1}
      posti={POSTI}
      postoSelezionato={null}
      onSelectPosto={onSelectPosto}
      intervalloCoda={INTERVALLO}
    />,
  );
  return onSelectPosto;
}

let fetchFinto: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchFinto = vi.fn();
  vi.stubGlobal("fetch", fetchFinto);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("MappaBiblioteca su schermo largo", () => {
  it("[TC-UI-MAPPA-001] intestazione, legenda con la coda e posti interattivi tranne la manutenzione", () => {
    monta(1280);
    expect(screen.getByRole("heading", { name: "Sala Studio Principale" })).toBeTruthy();
    expect(screen.getByText("Coda disponibile")).toBeTruthy();
    expect(screen.getByText("Manutenzione")).toBeTruthy();

    expect(screen.getByRole("button", { name: "Posto A1 - Disponibile (clicca per selezionare)" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /A2 - Occupato, coda disponibile/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /A4 - Prenotato, coda disponibile/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /A3/ })).toBeNull();
  });

  it("[TC-UI-MAPPA-002] Invio su un posto libero lo seleziona; spazio su un posto occupato apre la coda", async () => {
    fetchFinto.mockResolvedValue(new Response(JSON.stringify({ data: [] }), { status: 200 }));
    const onSelect = monta(1280);

    fireEvent.keyDown(screen.getByRole("button", { name: /A1 - Disponibile/ }), { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith("a1");

    fireEvent.keyDown(screen.getByRole("button", { name: /A2 - Occupato/ }), { key: " " });
    expect(await screen.findByRole("heading", { name: "Lista d'attesa · Posto A2" })).toBeTruthy();
    await waitFor(() => expect(fetchFinto).toHaveBeenCalledWith("/api/prenotazioni/coda"));
  });

  it("[TC-UI-MAPPA-003] dal pannello si entra in coda con lo stesso contratto della vista mobile", async () => {
    fetchFinto
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { posizione: 1 } }), { status: 201 }));
    monta(1280);

    fireEvent.click(screen.getByRole("button", { name: /A4 - Prenotato/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Entra in lista d'attesa" }));

    expect(await screen.findByLabelText("Posizione in coda 1")).toBeTruthy();
    expect(JSON.parse(fetchFinto.mock.calls[1][1].body)).toEqual({ postoId: "a4", ...INTERVALLO });
  });

  it("[TC-UI-MAPPA-004] altri tasti non attivano il posto", () => {
    const onSelect = monta(1280);
    fireEvent.keyDown(screen.getByRole("button", { name: /A1 - Disponibile/ }), { key: "Tab" });
    expect(onSelect).not.toHaveBeenCalled();
  });
});

describe("MappaBiblioteca su schermo stretto", () => {
  it("[TC-UI-MAPPA-010] sotto i 768 pixel mostra la griglia mobile con gli stessi posti e le stesse etichette", async () => {
    monta(500);
    // Un solo posto libero (A1): A2 e A4 sono occupati/prenotati, A3 in manutenzione.
    // Singolare corretto (D-11): prima la griglia scriveva "1 disponibili".
    await waitFor(() => expect(screen.getByText("1 disponibile")).toBeTruthy());
    expect(screen.getByRole("button", { name: "Posto A3 - In manutenzione" })).toBeTruthy();
  });
});
