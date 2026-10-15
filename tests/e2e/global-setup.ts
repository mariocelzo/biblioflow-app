import { spawnSync } from "node:child_process";

import { assertTestDatabaseUrl } from "../fixtures/database";

/**
 * Riporta il database E2E allo stato noto del seed prima della suite.
 *
 * Il seed (`prisma/seed.ts`) cancella e ricrea utenti, sale, posti,
 * prenotazioni e prestiti: per questo il nome del database deve dichiarare di
 * essere di test, altrimenti ci si ferma prima di toccare qualunque dato.
 */
export default function globalSetup(): void {
  const databaseUrl = process.env.E2E_DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      "E2E_DATABASE_URL non impostata: indica il database di test da ripopolare (es. postgresql://utente@127.0.0.1:5433/biblioflow_e2e_test).",
    );
  }
  assertTestDatabaseUrl(databaseUrl);

  const env = { ...process.env, DATABASE_URL: databaseUrl };
  for (const [comando, argomenti] of [
    ["npx", ["prisma", "migrate", "deploy"]],
    ["npx", ["tsx", "prisma/seed.ts"]],
  ] as const) {
    const esito = spawnSync(comando, [...argomenti], { env, stdio: "pipe", encoding: "utf8" });
    if (esito.status !== 0) {
      throw new Error(`Preparazione del database E2E fallita (${comando} ${argomenti.join(" ")}):\n${esito.stderr}`);
    }
  }
}
