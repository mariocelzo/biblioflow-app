import { defineConfig, devices } from "@playwright/test";

/**
 * Suite end-to-end: l'applicazione vera (build di produzione) in un browser
 * vero, contro un PostgreSQL di test ripopolato dal seed del progetto.
 *
 * Uso locale:
 *   E2E_DATABASE_URL=postgresql://...@127.0.0.1:5433/biblioflow_e2e_test \
 *     npm run test:e2e
 *
 * Il global setup rifiuta qualunque database il cui nome non dichiari di
 * essere di test, prima di cancellarlo e ripopolarlo.
 */
const PORTA = Number(process.env.E2E_PORT ?? 3100);
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${PORTA}`;

export default defineConfig({
  testDir: "tests/e2e",
  testMatch: "**/*.spec.ts",
  globalSetup: "./tests/e2e/global-setup.ts",
  // Gli scenari condividono lo stesso database e si passano lo stato (una
  // prenotazione, una richiesta in coda): vanno eseguiti in ordine.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: {
    baseURL: BASE_URL,
    locale: "it-IT",
    timezoneId: "Europe/Rome",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1366, height: 900 } },
    },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `npx next start -p ${PORTA}`,
        url: `${BASE_URL}/login`,
        reuseExistingServer: true,
        timeout: 120_000,
        env: {
          DATABASE_URL: process.env.E2E_DATABASE_URL ?? "",
          NEXTAUTH_URL: BASE_URL,
          AUTH_TRUST_HOST: "true",
        },
      },
});
