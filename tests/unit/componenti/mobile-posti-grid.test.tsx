// @vitest-environment jsdom
// ============================================================================
// Test del componente MobilePostiGrid e dell'hook useIngressoCoda (CR02)
// ============================================================================
// COSA: la griglia dei posti su telefono, renderizzata in un DOM simulato,
//       con le chiamate di rete sostituite da `fetch` finto.
// PERCHE': CA-03 chiede che lo studente possa entrare in lista d'attesa da un
//       posto occupato in tutte le viste. I test esistenti verificavano solo
//       le funzioni pure (etichette, payload); qui si verifica cio' che vede e
//       fa l'utente: ordine dei posti, annunci per gli screen reader, pannello
//       della coda, ingresso, posizione ottenuta ed errori.

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

import { MobilePostiGrid } from "@/components/mobile-posti-grid";

type StatoPosto = "DISPONIBILE" | "OCCUPATO" | "PRENOTATO" | "MANUTENZIONE";
const posto = (id: string, numero: string, stato: StatoPosto, presaElettrica = false, accessibile = false) => ({
  id,
  numero,
  stato,
  caratteristiche: { presaElettrica, accessibile },
});

const POSTI = [
  posto("p10", "G10", "DISPONIBILE", true, true),
  posto("p2", "G2", "OCCUPATO"),
  posto("p3", "G3", "PRENOTATO"),
  posto("p4", "G4", "MANUTENZIONE"),
  posto("p1", "G1", "DISPONIBILE"),
];
const INTERVALLO = { data: "2030-01-15", oraInizio: "09:00", oraFine: "11:00" };

function risposta(status: number, corpo: unknown) {
  return Promise.resolve(new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } }));
}

function monta(onSelectPosto = vi.fn(), postoSelezionato: string | null = null) {
  render(
    <MobilePostiGrid
      posti={POSTI}
      postoSelezionato={postoSelezionato}
      onSelectPosto={onSelectPosto}
      sala="Sala Studio Nord"
      intervalloCoda={INTERVALLO}
    />,
  );
  return onSelectPosto;
}

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

describe("MobilePostiGrid", () => {
  it("[TC-UI-GRID-001] mostra la sala, il numero di posti liberi e i posti in ordine naturale", () => {
    monta();
    expect(screen.getByText("Sala Studio Nord")).toBeTruthy();
    expect(screen.getByText("2 disponibili")).toBeTruthy();
    const numeri = screen.getAllByRole("button").map((b) => within(b).queryByText(/^G\d+$/)?.textContent);
    expect(numeri).toEqual(["G1", "G2", "G3", "G4", "G10"]);
  });

  it("[TC-UI-GRID-002] ogni posto ha un'etichetta accessibile; la manutenzione non e' cliccabile", () => {
    monta(vi.fn(), "p1");
    expect(screen.getByRole("button", { name: "Posto G1 - Selezionato" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Posto G10 - Disponibile (clicca per selezionare)" }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("button", { name: /G2 - Occupato, coda disponibile/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /G3 - Prenotato, coda disponibile/ })).toBeTruthy();
    const manutenzione = screen.getByRole("button", { name: "Posto G4 - In manutenzione" }) as HTMLButtonElement;
    expect(manutenzione.disabled).toBe(true);
    expect(manutenzione.getAttribute("aria-pressed")).toBeNull();
  });

  it("[TC-UI-GRID-003] un posto libero si seleziona senza aprire la coda", async () => {
    const onSelect = monta();
    await userEvent.click(screen.getByRole("button", { name: /G10 - Disponibile/ }));
    expect(onSelect).toHaveBeenCalledWith("p10");
    expect(screen.queryByText(/Lista d'attesa · Posto/)).toBeNull();
    expect(fetchFinto).not.toHaveBeenCalled();
  });

  it("[TC-UI-GRID-004] un posto occupato apre la coda e chiede al server se si e' gia' in lista", async () => {
    fetchFinto.mockReturnValueOnce(risposta(200, { data: [] }));
    monta();
    await userEvent.click(screen.getByRole("button", { name: /G2 - Occupato/ }));

    expect(screen.getByRole("heading", { name: "Lista d'attesa · Posto G2" })).toBeTruthy();
    expect(screen.getByText("Il posto è occupato per l'intervallo scelto. Puoi entrare in coda.")).toBeTruthy();
    expect(fetchFinto).toHaveBeenCalledWith("/api/prenotazioni/coda");
  });

  it("[TC-UI-GRID-005] se si e' gia' in coda per quel posto e fascia mostra la posizione, anche con orari in formato ISO", async () => {
    fetchFinto.mockReturnValueOnce(
      risposta(200, {
        data: [
          // Stesso posto, altra fascia: va ignorata.
          { postoId: "p2", data: "2030-01-15", oraInizio: "14:00", oraFine: "16:00", posizione: 9 },
          { postoId: "p2", data: "2030-01-15T00:00:00.000Z", oraInizio: "1970-01-01T09:00:00.000Z", oraFine: "1970-01-01T11:00:00.000Z", posizione: 2 },
        ],
      }),
    );
    monta();
    await userEvent.click(screen.getByRole("button", { name: /G2 - Occupato/ }));

    expect(await screen.findByText("Sei già in lista. Posizione attuale: 2.")).toBeTruthy();
    expect(screen.getByLabelText("Posizione in coda 2")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Entra in lista d'attesa" })).toBeNull();
  });

  it("[TC-UI-GRID-006] l'ingresso in coda invia il posto e la fascia scelti e mostra la posizione ottenuta", async () => {
    fetchFinto
      .mockReturnValueOnce(risposta(200, { data: [] }))
      .mockReturnValueOnce(risposta(201, { data: { posizione: 3 } }));
    monta();
    await userEvent.click(screen.getByRole("button", { name: /G3 - Prenotato/ }));
    await userEvent.click(await screen.findByRole("button", { name: "Entra in lista d'attesa" }));

    await waitFor(() => expect(fetchFinto).toHaveBeenCalledTimes(2));
    const [url, opzioni] = fetchFinto.mock.calls[1];
    expect(url).toBe("/api/prenotazioni/coda");
    expect(opzioni.method).toBe("POST");
    expect(JSON.parse(opzioni.body)).toEqual({ postoId: "p3", ...INTERVALLO });
    expect(await screen.findByLabelText("Posizione in coda 3")).toBeTruthy();
    expect(toast.success).toHaveBeenCalledWith("Sei in lista d'attesa", { description: "Posizione attuale: 3" });
  });

  it("[TC-UI-GRID-007] se il server rifiuta l'ingresso mostra il suo messaggio e lascia il pulsante", async () => {
    fetchFinto
      .mockReturnValueOnce(risposta(200, { data: [] }))
      .mockReturnValueOnce(risposta(409, { error: "Sei già in lista d'attesa per questo intervallo" }));
    monta();
    await userEvent.click(screen.getByRole("button", { name: /G2 - Occupato/ }));
    await userEvent.click(await screen.findByRole("button", { name: "Entra in lista d'attesa" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Sei già in lista d'attesa per questo intervallo"));
    expect(screen.getByRole("button", { name: "Entra in lista d'attesa" })).toBeTruthy();
  });

  it("[TC-UI-GRID-008] senza rete: la posizione non si carica ma l'ingresso resta possibile; l'errore di rete e' segnalato", async () => {
    fetchFinto.mockRejectedValueOnce(new TypeError("Failed to fetch")).mockRejectedValueOnce("offline");
    monta();
    await userEvent.click(screen.getByRole("button", { name: /G2 - Occupato/ }));
    await userEvent.click(await screen.findByRole("button", { name: "Entra in lista d'attesa" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Errore di connessione"));
  });

  it("[TC-UI-GRID-009] scegliere un posto libero chiude il pannello della coda", async () => {
    fetchFinto.mockReturnValueOnce(risposta(200, { data: [] }));
    monta();
    await userEvent.click(screen.getByRole("button", { name: /G2 - Occupato/ }));
    expect(screen.getByText(/Lista d'attesa · Posto G2/)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: /G1 - Disponibile/ }));
    expect(screen.queryByText(/Lista d'attesa · Posto/)).toBeNull();
  });

  it("[TC-UI-GRID-010] senza posti mostra il messaggio dei filtri", () => {
    render(<MobilePostiGrid posti={[]} postoSelezionato={null} onSelectPosto={vi.fn()} sala="Sala" intervalloCoda={INTERVALLO} />);
    expect(screen.getByText("Nessun posto trovato con i filtri selezionati")).toBeTruthy();
  });
});
