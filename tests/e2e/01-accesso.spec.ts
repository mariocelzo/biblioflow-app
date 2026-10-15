import { expect, test } from "@playwright/test";

import { ACCOUNT, accedi, esci } from "./supporto";

/**
 * E2E-01 … E2E-04 — accesso e protezione delle aree (CR01, CA-01).
 * Il middleware verifica il token di sessione, le pagine admin e le API
 * controllano il ruolo: qui lo si verifica dal browser, non sui mock.
 */
test.describe("accesso e ruoli", () => {
  test("[E2E-01] una pagina riservata porta al login e, dopo l'accesso, torna dove si voleva andare", async ({ page }) => {
    await page.goto("/prenotazioni");
    await expect(page).toHaveURL(/\/login\?callbackUrl=%2Fprenotazioni/);

    await page.getByLabel("Email").fill(ACCOUNT.mario.email);
    await page.getByLabel("Password", { exact: true }).fill(ACCOUNT.mario.password);
    await page.getByRole("button", { name: "Accedi", exact: true }).click();

    await expect(page).toHaveURL(/\/prenotazioni$/, { timeout: 20_000 });
    await expect(page.getByRole("heading", { name: /Le Mie Prenotazioni/i })).toBeVisible();
  });

  test("[E2E-02] una password errata non apre la sessione e mostra un messaggio", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(ACCOUNT.mario.email);
    await page.getByLabel("Password", { exact: true }).fill("password-sbagliata");
    await page.getByRole("button", { name: "Accedi", exact: true }).click();

    await expect(page.getByText("Email o password non corretti. Riprova.")).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test("[E2E-03] uno studente non entra nell'area amministrativa e le API admin gli rispondono 403", async ({ page }) => {
    await accedi(page, ACCOUNT.mario);
    await page.goto("/admin");
    await expect(page).not.toHaveURL(/\/admin/);

    const risposta = await page.request.get("/api/admin/statistiche?tipo=tasso-noshow");
    expect(risposta.status()).toBe(403);
  });

  test("[E2E-04] un cookie di sessione inventato non apre le pagine riservate", async ({ page, context }) => {
    await esci(page);
    await context.addCookies([
      { name: "authjs.session-token", value: "token-inventato", domain: "localhost", path: "/" },
    ]);
    await page.goto("/prenota");
    await expect(page).toHaveURL(/\/login/);

    const api = await page.request.get("/api/prenotazioni");
    expect(api.status()).toBe(401);
  });
});
