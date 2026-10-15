// @vitest-environment jsdom
// ============================================================================
// Test del componente PrenotazioniActions (area admin, CR02)
// ============================================================================
// COSA: menu delle azioni dello staff su una prenotazione: annullamento con
//       esito della lista d'attesa, check-in manuale, modifica, errori.
// PERCHE': TC-PRE-021 e' stato modificato dalla CR: annullare una prenotazione
//       dall'area admin deve ora dire al bibliotecario chi e' stato promosso
//       dalla coda (o che la coda era vuota). I test esistenti verificavano
//       solo la funzione che compone il messaggio; qui si verifica il percorso
//       dell'operatore. In piu' (D-12): il pulsante del menu ora ha un nome
//       accessibile e il menu non propone azioni che il server rifiuterebbe.

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ toast: { success: vi.fn(), error: vi.fn() }, refresh: vi.fn() }));
vi.mock("sonner", () => ({ toast: mocks.toast }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));

import PrenotazioniActions from "@/components/admin/prenotazioni-actions";

// Radix usa API del browser che jsdom non implementa.
beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.releasePointerCapture ??= () => undefined;
  Element.prototype.scrollIntoView ??= () => undefined;
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

function prenotazione(stato: string) {
  return {
    id: "pren-1",
    stato,
    data: new Date("2030-01-15T00:00:00.000Z"),
    oraInizio: new Date("1970-01-01T09:00:00.000Z"),
    oraFine: new Date("1970-01-01T11:00:00.000Z"),
    checkInAt: null,
    user: { id: "u1", nome: "Ada", cognome: "Lovelace", email: "ada@studenti.unisa.it", matricola: "0512100001" },
    posto: { id: "posto-a1", numero: "A1", sala: { nome: "Sala Nord", piano: 1 } },
  };
}

const NOME_MENU = "Azioni per la prenotazione di Ada Lovelace, posto A1";

async function apriMenu() {
  await userEvent.click(screen.getByRole("button", { name: NOME_MENU }));
}

let fetchFinto: ReturnType<typeof vi.fn>;
const json = (status: number, corpo: unknown) => new Response(JSON.stringify(corpo), { status });

beforeEach(() => {
  fetchFinto = vi.fn();
  vi.stubGlobal("fetch", fetchFinto);
  mocks.toast.success.mockReset();
  mocks.toast.error.mockReset();
  mocks.refresh.mockReset();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("menu delle azioni", () => {
  it("[TC-UI-ADMPREN-001] D-12: il pulsante del menu ha un nome che identifica la prenotazione", () => {
    render(<PrenotazioniActions prenotazione={prenotazione("CONFERMATA")} />);
    expect(screen.getByRole("button", { name: NOME_MENU })).toBeTruthy();
  });

  it("[TC-UI-ADMPREN-002] su una prenotazione confermata propone check-in, modifica e annullamento", async () => {
    render(<PrenotazioniActions prenotazione={prenotazione("CONFERMATA")} />);
    await apriMenu();
    expect(screen.getByRole("menuitem", { name: /Check-in Manuale/ })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: /Modifica/ })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: /Annulla Prenotazione/ })).toBeTruthy();
  });

  it.each(["NO_SHOW", "SCADUTA", "COMPLETATA", "CANCELLATA"])(
    "[TC-UI-ADMPREN-003] D-12: su una prenotazione %s non propone azioni che il server rifiuterebbe",
    async (stato) => {
      render(<PrenotazioniActions prenotazione={prenotazione(stato)} />);
      await apriMenu();
      expect(screen.getByRole("menuitem", { name: "Nessuna azione disponibile" })).toBeTruthy();
      expect(screen.queryByRole("menuitem", { name: /Annulla Prenotazione/ })).toBeNull();
    },
  );
});

describe("annullamento", () => {
  async function annulla() {
    render(<PrenotazioniActions prenotazione={prenotazione("CHECK_IN")} />);
    await apriMenu();
    await userEvent.click(screen.getByRole("menuitem", { name: /Annulla Prenotazione/ }));
    expect(await screen.findByRole("dialog", { name: "Annulla Prenotazione" })).toBeTruthy();
    expect(screen.getByText(/Sala Nord - Posto A1/)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Conferma Annullamento" }));
  }

  it("[TC-UI-ADMPREN-010] dopo l'annullamento dice chi e' stato promosso dalla coda", async () => {
    fetchFinto.mockResolvedValue(
      json(200, {
        success: true,
        promozione: { richiestaId: "r1", prenotazioneId: "pren-2", userId: "u2", postoId: "posto-a1", utente: { nome: "Bruno", cognome: "Bianchi" } },
      }),
    );
    await annulla();
    await waitFor(() =>
      expect(mocks.toast.success).toHaveBeenCalledWith("Prenotazione annullata con successo", {
        description: "Bruno Bianchi è stato promosso dalla lista d'attesa (prenotazione pren-2).",
      }),
    );
    expect(JSON.parse(fetchFinto.mock.calls[0][1].body)).toEqual({ azione: "ANNULLA_SINGOLA", prenotazioneId: "pren-1" });
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("[TC-UI-ADMPREN-011] con la coda vuota lo dice esplicitamente", async () => {
    fetchFinto.mockResolvedValue(json(200, { success: true, promozione: null }));
    await annulla();
    await waitFor(() =>
      expect(mocks.toast.success).toHaveBeenCalledWith("Prenotazione annullata con successo", {
        description: "Nessun utente era in lista d'attesa per questo intervallo.",
      }),
    );
  });

  it("[TC-UI-ADMPREN-012] se il server rifiuta mostra il suo messaggio e non ricarica la pagina", async () => {
    fetchFinto.mockResolvedValue(json(400, { error: "Impossibile annullare: la prenotazione è già conclusa" }));
    await annulla();
    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalledWith("Impossibile annullare: la prenotazione è già conclusa"));
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});

describe("check-in e modifica", () => {
  it("[TC-UI-ADMPREN-020] il check-in manuale invia l'azione giusta", async () => {
    fetchFinto.mockResolvedValue(json(200, { success: true }));
    render(<PrenotazioniActions prenotazione={prenotazione("CONFERMATA")} />);
    await apriMenu();
    await userEvent.click(screen.getByRole("menuitem", { name: /Check-in Manuale/ }));
    await userEvent.click(await screen.findByRole("button", { name: "Conferma Check-in" }));
    await waitFor(() => expect(mocks.toast.success).toHaveBeenCalledWith("Check-in effettuato con successo"));
    expect(JSON.parse(fetchFinto.mock.calls[0][1].body)).toEqual({ azione: "CHECK_IN_MANUALE", prenotazioneId: "pren-1" });
  });

  it("[TC-UI-ADMPREN-021] la modifica parte dai valori attuali e invia quelli scelti", async () => {
    fetchFinto.mockResolvedValue(json(200, { success: true }));
    render(<PrenotazioniActions prenotazione={prenotazione("CONFERMATA")} />);
    await apriMenu();
    await userEvent.click(screen.getByRole("menuitem", { name: /Modifica/ }));

    const fine = (await screen.findByLabelText("Ora Fine")) as HTMLInputElement;
    expect((screen.getByLabelText(/Ora Inizio/) as HTMLInputElement).value).toBe("09:00");
    expect(fine.value).toBe("11:00");
    await userEvent.clear(fine);
    await userEvent.type(fine, "12:30");
    await userEvent.click(screen.getByRole("button", { name: "Conferma Modifica" }));

    await waitFor(() => expect(fetchFinto).toHaveBeenCalled());
    expect(JSON.parse(fetchFinto.mock.calls[0][1].body)).toEqual({
      azione: "MODIFICA",
      prenotazioneId: "pren-1",
      nuoviDati: { data: "2030-01-15", oraInizio: "09:00", oraFine: "12:30" },
    });
  });

  it("[TC-UI-ADMPREN-022] un conflitto sull'orario (409) arriva all'operatore come messaggio", async () => {
    fetchFinto.mockResolvedValue(json(409, { error: "Il posto è già prenotato in quella fascia: scegli un altro orario o un altro posto" }));
    render(<PrenotazioniActions prenotazione={prenotazione("CONFERMATA")} />);
    await apriMenu();
    await userEvent.click(screen.getByRole("menuitem", { name: /Modifica/ }));
    await userEvent.click(await screen.findByRole("button", { name: "Conferma Modifica" }));
    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalledWith(expect.stringContaining("già prenotato")));
  });
});
