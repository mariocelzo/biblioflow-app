import { expect, test, type Browser, type Page } from "@playwright/test";

import { ACCOUNT, GIORNO, accedi, apriMappa, esci, orariMezzaGiornata } from "./supporto";

/**
 * E2E-10 … E2E-12 — i casi limite della change request, dal browser:
 *   - conflitto all'ultimo istante: il posto scelto viene preso da un altro
 *     studente mentre si conferma (vincolo di CR01) e la pagina propone la
 *     lista d'attesa invece di un errore secco (CR02);
 *   - cancellazione da parte del titolare: chi era in coda viene promosso
 *     (difetto della route di cancellazione, corretto nella manutenzione);
 *   - uscita volontaria dalla coda dalla scheda "Lista d'attesa" (D-13).
 * Usano la fascia pomeridiana: quella mattutina e' occupata dagli scenari 02.
 */
test.describe.configure({ mode: "serial" });

const FASCIA = orariMezzaGiornata("pomeriggio");
let posto = "";
let postoId = "";

/** Accesso in un secondo browser, come farebbe un altro studente. */
async function altroStudente(browser: Browser): Promise<Page> {
  const contesto = await browser.newContext({ locale: "it-IT", timezoneId: "Europe/Rome" });
  const pagina = await contesto.newPage();
  await accedi(pagina, ACCOUNT.giuseppe);
  return pagina;
}

test.describe("conflitto, cancellazione del titolare, uscita dalla coda", () => {
  test("[E2E-10] se il posto viene preso mentre si conferma, la pagina propone la lista d'attesa", async ({ page, browser }) => {
    await accedi(page, ACCOUNT.laura);
    await apriMappa(page, "Sala Studio Principale", "pomeriggio");

    const libero = page.getByRole("button", { name: /^Posto \S+ - Disponibile/ }).first();
    posto = ((await libero.getAttribute("aria-label")) ?? "").split(" ")[1];
    await libero.click();

    // Un altro studente prenota lo stesso posto nella stessa fascia, adesso.
    const giuseppe = await altroStudente(browser);
    const posti = await (await giuseppe.request.get(`/api/posti?data=${GIORNO.iso}&oraInizio=${FASCIA.oraInizio}&oraFine=${FASCIA.oraFine}`)).json();
    postoId = (posti.data as Array<{ id: string; numero: string }>).find((p) => p.numero === posto)!.id;
    const presa = await giuseppe.request.post("/api/prenotazioni", {
      data: { postoId, data: GIORNO.iso, oraInizio: FASCIA.oraInizio, oraFine: FASCIA.oraFine },
    });
    expect(presa.status()).toBe(201);
    await giuseppe.context().close();

    await page.getByRole("button", { name: "Conferma", exact: true }).click();
    await page.getByRole("dialog", { name: "Conferma Prenotazione" }).getByRole("button", { name: "Conferma", exact: true }).click();

    const conflitto = page.getByRole("dialog", { name: "Posto non più disponibile" });
    await expect(conflitto).toBeVisible();
    await expect(conflitto.getByText(`ha occupato il posto ${posto} per ${FASCIA.oraInizio} - ${FASCIA.oraFine}`, { exact: false })).toBeVisible();
    await conflitto.getByRole("button", { name: "Entra in lista d'attesa" }).click();

    await page.waitForURL(/\/prenotazioni\?scheda=coda/);
    await expect(page.getByText(`Posto ${posto} · Sala Studio Principale`)).toBeVisible();
    await expect(page.getByLabel("Posizione in coda 1")).toBeVisible();
  });

  test("[E2E-11] quando il titolare cancella, chi e' primo in coda ottiene il posto", async ({ page }) => {
    await esci(page);
    await accedi(page, ACCOUNT.giuseppe, "/prenotazioni");
    await page.getByRole("button", { name: `Cancella prenotazione posto ${posto}` }).click();
    await page.getByRole("dialog", { name: "Cancella Prenotazione" }).getByRole("button", { name: "Conferma Cancellazione" }).click();
    await expect(page.getByRole("button", { name: `Cancella prenotazione posto ${posto}` })).toHaveCount(0);

    await esci(page);
    await accedi(page, ACCOUNT.laura, "/prenotazioni");
    // Il posto e' ora di Laura proprio per la fascia del pomeriggio.
    const prenotazionePomeriggio = page.getByRole("article", {
      name: new RegExp(`Prenotazione posto ${posto} in Sala Studio Principale,[\\s\\S]*dalle ${FASCIA.oraInizio} alle ${FASCIA.oraFine}[\\s\\S]*stato: confermata`),
    });
    await expect(prenotazionePomeriggio).toBeVisible();
    await page.getByRole("tab", { name: /Lista d'attesa \(0\)/ }).click();
    await expect(page.getByText("Non sei in nessuna lista d'attesa")).toBeVisible();
  });

  test("[E2E-12] uno studente entra in coda e poi ne esce dalla scheda Lista d'attesa", async ({ page }) => {
    await esci(page);
    await accedi(page, ACCOUNT.mario);
    await apriMappa(page, "Sala Studio Principale", "pomeriggio");
    await page.getByRole("button", { name: new RegExp(`^Posto ${posto} - (Occupato|Prenotato), coda disponibile`) }).click();
    await page.getByRole("button", { name: "Entra in lista d'attesa" }).click();
    await expect(page.getByLabel("Posizione in coda 1")).toBeVisible();

    await page.goto("/prenotazioni?scheda=coda");
    await expect(page.getByRole("tab", { name: /Lista d'attesa \(1\)/ })).toBeVisible();
    await page.getByRole("button", { name: `Esci dalla lista d'attesa per il posto ${posto}` }).click();

    await expect(page.getByText("Sei uscito dalla lista d'attesa")).toBeVisible();
    await expect(page.getByText("Non sei in nessuna lista d'attesa")).toBeVisible();
    await expect(page.getByRole("tab", { name: /Lista d'attesa \(0\)/ })).toBeVisible();
  });
});
