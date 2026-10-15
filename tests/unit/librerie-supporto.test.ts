// ============================================================================
// Test delle librerie di supporto: tempo relativo, classi CSS, password, env
// ============================================================================
// COSA: `src/lib/admin-tempo.ts`, `src/lib/utils.ts`, `src/lib/password.ts`,
//       `src/lib/env.ts`.
// PERCHE': erano a copertura nulla o parziale pur essendo usate ovunque.
//       `env.ts` in particolare decide se l'applicazione parte: una variabile
//       mancante o malformata deve fermare l'avvio con un messaggio chiaro.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { formattaTempoRelativo } from "@/lib/admin-tempo";
import { cn } from "@/lib/utils";
import { hashPassword, validatePassword, verifyPassword } from "@/lib/password";

describe("formattaTempoRelativo", () => {
  const adesso = new Date("2026-10-15T10:00:00.000Z");

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(adesso);
  });
  afterEach(() => vi.useRealTimers());

  const fa = (ms: number) => new Date(adesso.getTime() - ms);
  const MINUTO = 60_000;

  it.each([
    [fa(10_000), "adesso"],
    [fa(MINUTO), "1 minuto fa"],
    [fa(5 * MINUTO), "5 minuti fa"],
    [fa(60 * MINUTO), "1 ora fa"],
    [fa(3 * 60 * MINUTO), "3 ore fa"],
    [fa(24 * 60 * MINUTO), "1 giorno fa"],
    [fa(6 * 24 * 60 * MINUTO), "6 giorni fa"],
  ])("[TC-TEMPO-REL-001] %s → %s", (data, atteso) => {
    expect(formattaTempoRelativo(data)).toBe(atteso);
  });

  it("[TC-TEMPO-REL-002] oltre una settimana mostra la data in italiano", () => {
    expect(formattaTempoRelativo(new Date("2026-09-01T10:00:00.000Z"))).toMatch(/01 set 2026/);
  });
});

describe("cn", () => {
  it("[TC-UTILS-001] unisce le classi e risolve i conflitti Tailwind a favore dell'ultima", () => {
    const nascosta = false as boolean;
    expect(cn("p-2", nascosta && "hidden", "p-4", ["text-sm"])).toBe("p-4 text-sm");
  });
});

describe("password", () => {
  it("[TC-PWD-001] l'hash bcrypt verifica la password giusta e rifiuta quella sbagliata", async () => {
    const hash = await hashPassword("Biblio2026!");
    expect(hash).toMatch(/^\$2[aby]\$12\$/);
    await expect(verifyPassword("Biblio2026!", hash)).resolves.toBe(true);
    await expect(verifyPassword("biblio2026!", hash)).resolves.toBe(false);
  });

  it("[TC-PWD-002] elenca tutti i requisiti mancanti", () => {
    expect(validatePassword("abc")).toEqual({
      valid: false,
      errors: [
        "La password deve avere almeno 8 caratteri",
        "La password deve contenere almeno una lettera maiuscola",
        "La password deve contenere almeno un numero",
      ],
    });
    expect(validatePassword("Biblio2026")).toEqual({ valid: true, errors: [] });
  });
});

describe("validazione delle variabili d'ambiente", () => {
  const BASE = {
    DATABASE_URL: "postgresql://utente@localhost:5432/biblioflow_test",
    NEXTAUTH_URL: "http://localhost:3000",
    NEXTAUTH_SECRET: "x".repeat(32),
  };

  async function caricaEnv(variabili: Record<string, string | undefined>) {
    vi.resetModules();
    for (const chiave of ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "CRON_SECRET"]) {
      vi.stubEnv(chiave, undefined as unknown as string);
    }
    for (const [chiave, valore] of Object.entries(variabili)) {
      vi.stubEnv(chiave, valore as string);
    }
    return import("@/lib/env");
  }

  let exit: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    exit = vi.spyOn(process, "exit").mockImplementation(((codice?: number) => {
      throw new Error(`process.exit(${codice})`);
    }) as never);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("[TC-ENV-001] con le variabili obbligatorie l'app parte e applica i default", async () => {
    const { env } = await caricaEnv(BASE);
    expect(env.NEXTAUTH_URL).toBe("http://localhost:3000");
    expect(env.NEXT_PUBLIC_APP_NAME).toBe("BiblioFlow");
    expect(exit).not.toHaveBeenCalled();
  });

  it("[TC-ENV-002] un segreto troppo corto ferma l'avvio con codice 1", async () => {
    await expect(caricaEnv({ ...BASE, NEXTAUTH_SECRET: "corto" })).rejects.toThrow("process.exit(1)");
  });

  it("[TC-ENV-003] un URL non valido ferma l'avvio", async () => {
    await expect(caricaEnv({ ...BASE, NEXTAUTH_URL: "non-un-url" })).rejects.toThrow("process.exit(1)");
  });

  it("[TC-ENV-004] Google OAuth richiede entrambe le credenziali", async () => {
    await expect(caricaEnv({ ...BASE, GOOGLE_CLIENT_ID: "id" })).rejects.toThrow("process.exit(1)");
    await expect(caricaEnv({ ...BASE, GOOGLE_CLIENT_SECRET: "segreto" })).rejects.toThrow("process.exit(1)");
    const { env } = await caricaEnv({ ...BASE, GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "segreto" });
    expect(env.GOOGLE_CLIENT_ID).toBe("id");
  });
});
