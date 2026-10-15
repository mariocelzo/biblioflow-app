import { expect, type Page } from "@playwright/test";

import { giornoApertura } from "../fixtures/calendario";
import { generaOpzioniDurata } from "../../src/lib/prenotazioni-regole";

/** Account creati da `prisma/seed.ts`. */
export const ACCOUNT = {
  mario: { email: "mario.rossi@studenti.unisa.it", password: "password123", nome: "Mario Rossi" },
  laura: { email: "laura.bianchi@studenti.unisa.it", password: "password123", nome: "Laura Bianchi" },
  giuseppe: { email: "giuseppe.verdi@studenti.unisa.it", password: "password123", nome: "Giuseppe Verdi" },
  admin: { email: "admin@biblioteca.unisa.it", password: "admin123", nome: "Admin Sistema" },
} as const;

type Account = (typeof ACCOUNT)[keyof typeof ACCOUNT];

/**
 * Giorno della prenotazione usato da tutta la suite: il primo giorno di
 * apertura ad almeno 3 giorni da oggi, calcolato con le stesse regole di
 * calendario del server (domeniche e festivi esclusi, entro 30 giorni).
 * Il seed crea prenotazioni solo per i giorni piu' vicini: questo resta libero.
 */
export const GIORNO = giornoApertura(3);

/** Accesso dal form di login. */
export async function accedi(page: Page, account: Account, destinazione = "/") {
  await page.goto(`/login?callbackUrl=${encodeURIComponent(destinazione)}`);
  await page.getByLabel("Email").fill(account.email);
  await page.getByLabel("Password", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "Accedi", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20_000 });
}

/** Esce cancellando i cookie: la sessione successiva parte pulita. */
export async function esci(page: Page) {
  await page.context().clearCookies();
}

/**
 * Percorre la procedura guidata di /prenota fino alla mappa dei posti:
 * data, mezza giornata (mattina o pomeriggio), sala indicata.
 */
export async function apriMappa(
  page: Page,
  sala = "Sala Studio Principale",
  fascia: "mattina" | "pomeriggio" = "mattina",
) {
  await page.goto("/prenota");
  await expect(page.getByRole("heading", { name: "Prenota un Posto" })).toBeVisible();

  await page.locator("input#data").fill(GIORNO.iso);
  await page.getByRole("button", { name: "Avanti" }).click();

  await page.getByRole("button", { name: new RegExp(`Mezza giornata \\(${fascia}\\)`) }).click();
  await page.getByRole("button", { name: "Avanti" }).click();

  await page.getByRole("button", { name: new RegExp(sala) }).first().click();
  await page.getByRole("button", { name: "Avanti" }).click();

  await expect(page.getByText("Seleziona un Posto")).toBeVisible();
}

/** Orari della mezza giornata, calcolati con la stessa funzione usata dalla pagina. */
export function orariMezzaGiornata(fascia: "mattina" | "pomeriggio", apertura = "08:00", chiusura = "22:00") {
  const opzione = generaOpzioniDurata(apertura, chiusura).find((o) => o.id === `mezza_${fascia}`);
  if (!opzione) throw new Error(`Fascia ${fascia} non disponibile`);
  const [oraInizio, oraFine] = opzione.descrizione.split(" - ");
  return { oraInizio, oraFine };
}
