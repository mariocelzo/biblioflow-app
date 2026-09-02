import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import path from "node:path";
import {
  assertTestDatabaseUrl,
  DEFAULT_TEST_DATABASE_URL,
} from "../tests/fixtures/database";

type Command = "prepare" | "seed" | "down";

const command = process.argv[2] as Command | undefined;
const databaseUrl = process.env.TEST_DATABASE_URL ?? DEFAULT_TEST_DATABASE_URL;
const executableExtension = process.platform === "win32" ? ".cmd" : "";
const composeEnv: NodeJS.ProcessEnv = {
  ...process.env,
  // Compose interpola tutti i servizi, anche quando si avvia solo postgres-test.
  // Un valore casuale soddisfa il servizio di sviluppo senza avviarlo e senza
  // salvare una password, neppure fittizia, nel repository.
  POSTGRES_PASSWORD:
    process.env.POSTGRES_PASSWORD ?? randomBytes(24).toString("hex"),
};

assertTestDatabaseUrl(databaseUrl);

function run(executable: string, args: string[], extraEnv = process.env): void {
  const result = spawnSync(executable, args, {
    cwd: process.cwd(),
    env: extraEnv,
    stdio: "inherit",
    shell: process.platform === "win32" && executable.endsWith(".cmd"),
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(
      `Comando fallito (${result.status ?? "senza codice"}): ${executable} ${args.join(" ")}`,
    );
  }
}

function localExecutable(name: string): string {
  // Durante uno script npm, node_modules/.bin e' gia' nel PATH. Su Windows
  // usare il solo nome evita che cmd tronchi i percorsi assoluti con spazi.
  if (process.platform === "win32") {
    return `${name}${executableExtension}`;
  }

  return path.resolve(
    process.cwd(),
    "node_modules",
    ".bin",
    `${name}${executableExtension}`,
  );
}

function prepareDatabase(): void {
  // Il servizio usa tmpfs ed e' esclusivamente il DB *_test validato sopra.
  // Ricrearlo garantisce una base vuota senza invocare migrate reset.
  run(
    "docker",
    ["compose", "--profile", "test", "rm", "-f", "-s", "postgres-test"],
    composeEnv,
  );
  run(
    "docker",
    [
      "compose",
      "--profile",
      "test",
      "up",
      "-d",
      "--wait",
      "postgres-test",
    ],
    composeEnv,
  );

  const testEnv: NodeJS.ProcessEnv = {
    ...process.env,
    DATABASE_URL: databaseUrl,
    NODE_ENV: "test",
  };

  // migrate deploy applica anche le migrazioni SQL custom (es. exclusion
  // constraint), che db push non ricrea. Il successivo db push colma invece
  // le tabelle legacy ancora non rappresentate dalle migrazioni storiche.
  run(localExecutable("prisma"), ["migrate", "deploy"], testEnv);
  run(localExecutable("prisma"), ["db", "push"], testEnv);
  run(localExecutable("tsx"), ["tests/fixtures/seed.ts"], testEnv);
}

switch (command) {
  case "prepare":
    prepareDatabase();
    break;
  case "seed":
    run(localExecutable("tsx"), ["tests/fixtures/seed.ts"], {
      ...process.env,
      DATABASE_URL: databaseUrl,
      NODE_ENV: "test" as const,
    } satisfies NodeJS.ProcessEnv);
    break;
  case "down":
    run("docker", ["compose", "stop", "postgres-test"], composeEnv);
    run("docker", ["compose", "rm", "-f", "postgres-test"], composeEnv);
    break;
  default:
    throw new Error("Uso: tsx scripts/test-database.ts <prepare|seed|down>");
}
