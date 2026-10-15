import { expect, test, type Page } from "@playwright/test";

import { ACCOUNT, GIORNO, accedi, apriMappa, esci } from "./supporto";

/**
 * E2E-05 … E2E-09 — il ciclo completo della change request, dal browser:
 *   Mario prenota un posto (CR01) → Laura trova il posto occupato ed entra in
 *   lista d'attesa (CR02, CA-03) → lo staff annulla la prenotazione di Mario →
 *   Laura viene promossa automaticamente e ne riceve notifica (CA-04, CA-05).
 *
 * Gli scenari sono in serie: ognuno parte dallo stato lasciato dal precedente.
 */
test.describe.configure({ mode: "serial" });

let postoScelto = "";

/** Primo posto libero sulla mappa: restituisce il numero (es. "A3"). */
async function scegliPostoLibero(page: Page): Promise<string> {
  const posto = page.getByRole("button", { name: /^Posto \S+ - Disponibile/ }).first();
  const etichetta = (await posto.getAttribute("aria-label")) ?? "";
  await posto.click();
  return etichetta.split(" ")[1];
}

test.describe("prenotazione, lista d'attesa e promozione", () => {
  test("[E2E-05] lo studente prenota un posto libero e lo ritrova tra le sue prenotazioni", async ({ page }) => {
    await accedi(page, ACCOUNT.mario);
    await apriMappa(page);

    postoScelto = await scegliPostoLibero(page);
    await expect(page.getByRole("button", { name: `Posto ${postoScelto} - Selezionato` })).toHaveAttribute("aria-pressed", "true");

    await page.getByRole("button", { name: "Conferma", exact: true }).click();
    const dialogo = page.getByRole("dialog", { name: "Conferma Prenotazione" });
    await expect(dialogo).toBeVisible();
    await dialogo.getByRole("button", { name: "Conferma", exact: true }).click();

    await expect(page.getByText("Prenotazione confermata! 🎉")).toBeVisible();
    await page.waitForURL(/\/prenotazioni$/, { timeout: 15_000 });
    await expect(page.getByText(new RegExp(`Posto ${postoScelto}\\b`)).first()).toBeVisible();
  });

  test("[E2E-06] un altro studente vede il posto occupato in quella fascia e la coda proposta", async ({ page }) => {
    await esci(page);
    await accedi(page, ACCOUNT.laura);
    await apriMappa(page);

    const occupato = page.getByRole("button", { name: new RegExp(`^Posto ${postoScelto} - (Occupato|Prenotato), coda disponibile`) });
    await expect(occupato).toBeVisible();
    await occupato.click();

    await expect(page.getByRole("heading", { name: `Lista d'attesa · Posto ${postoScelto}` })).toBeVisible();
    await expect(page.getByText("Il posto è occupato per l'intervallo scelto. Puoi entrare in coda.")).toBeVisible();
  });

  test("[E2E-07] lo studente entra in lista d'attesa e ottiene la posizione 1", async ({ page }) => {
    await esci(page);
    await accedi(page, ACCOUNT.laura);
    await apriMappa(page);
    await page.getByRole("button", { name: new RegExp(`^Posto ${postoScelto} - `) }).click();
    await page.getByRole("button", { name: "Entra in lista d'attesa" }).click();

    await expect(page.getByLabel("Posizione in coda 1")).toBeVisible();
    await expect(page.getByText("Sei in lista d'attesa")).toBeVisible();

    // Rientrando sulla stessa fascia la posizione viene riletta dal server.
    await apriMappa(page);
    await page.getByRole("button", { name: new RegExp(`^Posto ${postoScelto} - `) }).click();
    await expect(page.getByText("Sei già in lista. Posizione attuale: 1.")).toBeVisible();
  });

  test("[E2E-08] lo staff annulla la prenotazione e vede chi e' stato promosso dalla coda", async ({ page }) => {
    await esci(page);
    await accedi(page, ACCOUNT.admin, "/admin");
    await page.goto(`/admin/prenotazioni?data=${GIORNO.iso}&utente=mario.rossi&stato=CONFERMATA`);
    await expect(page.getByRole("heading", { name: "Gestione Prenotazioni" })).toBeVisible();

    await page.getByRole("button", { name: `Azioni per la prenotazione di Mario Rossi, posto ${postoScelto}` }).click();
    await page.getByRole("menuitem", { name: /Annulla Prenotazione/ }).click();
    await page.getByRole("dialog", { name: "Annulla Prenotazione" }).getByRole("button", { name: "Conferma Annullamento" }).click();

    await expect(page.getByText("Prenotazione annullata con successo")).toBeVisible();
    await expect(page.getByText(/Laura Bianchi è stato promosso dalla lista d'attesa/)).toBeVisible();
  });

  test("[E2E-09] lo studente promosso trova la notifica e la prenotazione a suo nome", async ({ page }) => {
    await esci(page);
    await accedi(page, ACCOUNT.laura, "/notifiche");
    await expect(page.getByRole("heading", { name: "Notifiche", exact: true })).toBeVisible();
    await expect(page.getByText("Posto assegnato dalla lista d'attesa")).toBeVisible();
    await expect(page.getByText(`il posto ${postoScelto} si è liberato e la prenotazione è ora tua`, { exact: false })).toBeVisible();

    await page.goto("/prenotazioni");
    await expect(page.getByText(new RegExp(`Posto ${postoScelto}\\b`)).first()).toBeVisible();
  });
});
