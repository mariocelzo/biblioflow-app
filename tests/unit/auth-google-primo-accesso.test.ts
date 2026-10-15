// ============================================================================
// Test del login: primo accesso con Google, account senza password, ruoli
// ============================================================================
// COSA: rami di `src/lib/auth.ts` non coperti dai test di sicurezza esistenti:
//   - primo accesso con Google di un indirizzo istituzionale: creazione di
//     uno STUDENTE con email gia' verificata e nome/cognome dal profilo;
//   - ripieghi quando il profilo Google non porta nome o cognome;
//   - guasto del database durante l'accesso Google (rifiuto, non eccezione);
//   - provider sconosciuto rifiutato, Credentials delegato al provider;
//   - login con password su un account creato da Google (senza password);
//   - `hasRole` / `isStaff`.
// Stessa tecnica di tests/unit/auth-login-sicurezza.test.ts: si intercetta la
// configurazione passata a NextAuth e si invocano direttamente i callback.

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { CODICI_ERRORE_LOGIN } from "@/lib/auth-errors";

type CapturedAuthConfig = {
  providers: Array<{ authorize?: (credenziali: Record<string, unknown>) => Promise<unknown> }>;
  callbacks: {
    signIn: (params: {
      user: Record<string, unknown>;
      account: { provider: string } | null;
      profile?: Record<string, unknown>;
    }) => Promise<boolean>;
  };
};

const mocks = vi.hoisted(() => ({
  config: null as CapturedAuthConfig | null,
  compare: vi.fn(),
  prisma: { user: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn() } },
}));

vi.mock("next-auth", () => ({
  default: vi.fn((config: CapturedAuthConfig) => {
    mocks.config = config;
    return { handlers: {}, signIn: vi.fn(), signOut: vi.fn(), auth: vi.fn() };
  }),
  CredentialsSignin: class extends Error {
    code = "credentials";
  },
}));
vi.mock("next-auth/providers/credentials", () => ({
  default: vi.fn((options: object) => ({ id: "credentials", type: "credentials", ...options })),
}));
vi.mock("next-auth/providers/google", () => ({
  default: vi.fn((options: object) => ({ id: "google", type: "oidc", ...options })),
}));
vi.mock("@/lib/prisma", () => ({ default: mocks.prisma, prisma: mocks.prisma }));
vi.mock("@/lib/env", () => ({ env: { GOOGLE_CLIENT_ID: undefined, GOOGLE_CLIENT_SECRET: undefined } }));
vi.mock("bcryptjs", () => ({ default: { compare: mocks.compare } }));

let hasRole: typeof import("@/lib/auth").hasRole;
let isStaff: typeof import("@/lib/auth").isStaff;

const signIn = () => mocks.config!.callbacks.signIn;
const authorize = () => mocks.config!.providers.find((p) => typeof p.authorize === "function")!.authorize!;

const creato = (data: Record<string, unknown>) => ({
  id: "nuovo-1",
  matricola: null,
  isPendolare: false,
  necessitaAccessibilita: false,
  ...data,
});

beforeAll(async () => {
  ({ hasRole, isStaff } = await import("@/lib/auth"));
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  mocks.prisma.user.create.mockImplementation(async ({ data }) => creato(data));
});

describe("primo accesso con Google", () => {
  it("[TC-AUTH-G-001] crea uno studente verificato senza password, con nome e cognome dal profilo", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(null);
    const user: Record<string, unknown> = { email: "nuovo@studenti.unisa.it", name: "Nome Visualizzato" };

    const esito = await signIn()({
      user,
      account: { provider: "google" },
      profile: { given_name: "Grace", family_name: "Hopper" },
    });

    expect(esito).toBe(true);
    expect(mocks.prisma.user.create.mock.calls[0][0].data).toMatchObject({
      email: "nuovo@studenti.unisa.it",
      nome: "Grace",
      cognome: "Hopper",
      ruolo: "STUDENTE",
      emailVerificata: true,
      attivo: true,
      passwordHash: null,
    });
    // I campi custom finiscono nell'oggetto usato dai callback jwt/session.
    expect(user).toMatchObject({ id: "nuovo-1", ruolo: "STUDENTE", nome: "Grace" });
  });

  it("[TC-AUTH-G-002] senza nome nel profilo divide il nome visualizzato; senza nulla usa segnaposto", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(null);
    await signIn()({ user: { email: "a@studenti.unisa.it", name: "Ada King Lovelace" }, account: { provider: "google" } });
    expect(mocks.prisma.user.create.mock.calls[0][0].data).toMatchObject({ nome: "Ada", cognome: "King Lovelace" });

    await signIn()({ user: { email: "b@studenti.unisa.it" }, account: { provider: "google" } });
    expect(mocks.prisma.user.create.mock.calls[1][0].data).toMatchObject({ nome: "Nome", cognome: "Cognome" });
  });

  it("[TC-AUTH-G-003] un utente esistente e attivo accede e aggiorna l'ultimo accesso", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(creato({ id: "esistente", email: "e@unisa.it", attivo: true, ruolo: "BIBLIOTECARIO", nome: "E", cognome: "S" }));
    const user: Record<string, unknown> = { email: "e@unisa.it" };
    await expect(signIn()({ user, account: { provider: "google" } })).resolves.toBe(true);
    expect(mocks.prisma.user.update.mock.calls[0][0]).toMatchObject({ where: { id: "esistente" }, data: { emailVerificata: true } });
    expect(user.ruolo).toBe("BIBLIOTECARIO");
  });

  it("[TC-AUTH-G-004] un guasto del database rifiuta l'accesso invece di lanciare", async () => {
    mocks.prisma.user.findUnique.mockRejectedValue(new Error("connessione persa"));
    await expect(signIn()({ user: { email: "x@studenti.unisa.it" }, account: { provider: "google" } })).resolves.toBe(false);
  });

  it("[TC-AUTH-G-005] Credentials passa al provider, un provider sconosciuto o senza email e' rifiutato", async () => {
    await expect(signIn()({ user: {}, account: { provider: "credentials" } })).resolves.toBe(true);
    await expect(signIn()({ user: { email: "x@studenti.unisa.it" }, account: { provider: "github" } })).resolves.toBe(false);
    await expect(signIn()({ user: {}, account: { provider: "google" } })).resolves.toBe(false);
    expect(mocks.prisma.user.findUnique).not.toHaveBeenCalled();
  });
});

describe("login con password", () => {
  it("[TC-AUTH-PWD-001] un account creato con Google non puo' entrare con una password", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({
      id: "g1",
      email: "solo-google@studenti.unisa.it",
      passwordHash: null,
      attivo: true,
      emailVerificata: true,
      ruolo: "STUDENTE",
    });
    const errore = await authorize()({ email: "solo-google@studenti.unisa.it", password: "qualsiasi" }).catch((e: { code?: string }) => e);
    expect((errore as { code?: string }).code).toBe(CODICI_ERRORE_LOGIN.ACCOUNT_NON_CONFIGURATO);
    expect(mocks.compare).not.toHaveBeenCalled();
  });
});

describe("ruoli", () => {
  it("[TC-AUTH-RUOLI-001] isStaff vale solo per bibliotecario e amministratore", () => {
    expect(isStaff("STUDENTE")).toBe(false);
    expect(isStaff("BIBLIOTECARIO")).toBe(true);
    expect(isStaff("ADMIN")).toBe(true);
    expect(hasRole("STUDENTE", ["ADMIN"])).toBe(false);
    expect(hasRole("ADMIN", ["ADMIN"])).toBe(true);
  });
});
