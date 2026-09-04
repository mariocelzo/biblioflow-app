// Test delle difese sul login (finding A-4, A-5, M-6).
//
// Come in tests/pre-modifica/login.test.ts si intercetta la configurazione
// passata a NextAuth per poter invocare direttamente `authorize` e il callback
// `signIn`, senza far girare l'intero stack di Auth.js.

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

type CredentialsProvider = {
  authorize?: (credentials: Record<string, unknown>) => Promise<unknown>;
};

type CapturedAuthConfig = {
  providers: CredentialsProvider[];
  callbacks: {
    signIn: (params: {
      user: Record<string, unknown>;
      account: { provider: string } | null;
      profile?: Record<string, unknown>;
    }) => Promise<boolean>;
  };
};

const authMocks = vi.hoisted(() => ({
  compare: vi.fn(),
  config: null as CapturedAuthConfig | null,
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
  },
}));

vi.mock("next-auth", () => ({
  default: vi.fn((config: CapturedAuthConfig) => {
    authMocks.config = config;
    return { handlers: {}, signIn: vi.fn(), signOut: vi.fn(), auth: vi.fn() };
  }),
}));

vi.mock("next-auth/providers/credentials", () => ({
  default: vi.fn((options: CredentialsProvider) => ({
    id: "credentials",
    type: "credentials",
    ...options,
  })),
}));

vi.mock("next-auth/providers/google", () => ({
  default: vi.fn((options: object) => ({ id: "google", type: "oidc", ...options })),
}));

vi.mock("@/lib/prisma", () => ({
  default: authMocks.prisma,
  prisma: authMocks.prisma,
}));

vi.mock("@/lib/env", () => ({
  env: { GOOGLE_CLIENT_ID: undefined, GOOGLE_CLIENT_SECRET: undefined },
}));

vi.mock("bcryptjs", () => ({
  default: { compare: authMocks.compare },
}));

// Utente di riferimento: attivo e con email verificata.
const utenteAttivo = {
  id: "usr-sec-001",
  email: "mario.rossi@studenti.unisa.it",
  passwordHash: "$2b$12$hash-reale",
  nome: "Mario",
  cognome: "Rossi",
  ruolo: "STUDENTE",
  matricola: "0512100001",
  isPendolare: false,
  necessitaAccessibilita: false,
  attivo: true,
  emailVerificata: true,
};

function credentialsAuthorize() {
  const provider = authMocks.config?.providers.find(
    (candidate) => typeof candidate.authorize === "function",
  );

  if (!provider?.authorize) {
    throw new Error("Provider Credentials non catturato");
  }

  return provider.authorize;
}

function signInCallback() {
  const callback = authMocks.config?.callbacks?.signIn;
  if (!callback) {
    throw new Error("Callback signIn non catturato");
  }
  return callback;
}

beforeAll(async () => {
  await import("@/lib/auth");
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("login: nessuna enumerazione degli account (A-4)", () => {
  it("[TC-SEC-A4-001] usa lo stesso messaggio per email inesistente e password errata", async () => {
    // Ramo "email sconosciuta"
    authMocks.prisma.user.findUnique.mockResolvedValue(null);
    authMocks.compare.mockResolvedValue(false);
    const erroreSconosciuto = await credentialsAuthorize()({
      email: "nessuno@studenti.unisa.it",
      password: "qualsiasi",
    }).catch((errore: Error) => errore.message);

    // Ramo "password errata"
    authMocks.prisma.user.findUnique.mockResolvedValue(utenteAttivo);
    authMocks.compare.mockResolvedValue(false);
    const errorePassword = await credentialsAuthorize()({
      email: utenteAttivo.email,
      password: "password-errata",
    }).catch((errore: Error) => errore.message);

    expect(erroreSconosciuto).toBe("Credenziali non valide");
    expect(errorePassword).toBe("Credenziali non valide");
    expect(erroreSconosciuto).toBe(errorePassword);
  });

  it("[TC-SEC-A4-002] su email inesistente esegue comunque un bcrypt.compare fittizio", async () => {
    authMocks.prisma.user.findUnique.mockResolvedValue(null);
    authMocks.compare.mockResolvedValue(false);

    await expect(
      credentialsAuthorize()({
        email: "fantasma@studenti.unisa.it",
        password: "password-qualsiasi",
      }),
    ).rejects.toThrow("Credenziali non valide");

    // Il confronto "a vuoto" pareggia i tempi di risposta fra i due rami:
    // senza di esso la latenza rivelerebbe se l'email e' registrata.
    expect(authMocks.compare).toHaveBeenCalledWith(
      "password-qualsiasi",
      // Hash bcrypt fittizio: $2a$ + cost 12 + 53 caratteri.
      expect.stringMatching(/^\$2a\$12\$x{53}$/),
    );
  });

  it("[TC-SEC-A4-003] blocca l'account dopo 5 tentativi falliti consecutivi", async () => {
    // Email dedicata: il contatore e' per indirizzo e vive nel modulo.
    const email = "bruteforce@studenti.unisa.it";
    authMocks.prisma.user.findUnique.mockResolvedValue({ ...utenteAttivo, email });
    authMocks.compare.mockResolvedValue(false);

    for (let tentativo = 0; tentativo < 5; tentativo += 1) {
      await expect(
        credentialsAuthorize()({ email, password: "sbagliata" }),
      ).rejects.toThrow("Credenziali non valide");
    }

    // Il sesto tentativo non arriva nemmeno al confronto della password.
    authMocks.compare.mockClear();
    await expect(
      credentialsAuthorize()({ email, password: "sbagliata" }),
    ).rejects.toThrow("Troppi tentativi. Riprova più tardi.");
    expect(authMocks.compare).not.toHaveBeenCalled();
  });
});

describe("login: verifica dell'email obbligatoria (A-5)", () => {
  it("[TC-SEC-A5-001] rifiuta un account con emailVerificata false", async () => {
    const email = "non-verificato@studenti.unisa.it";
    authMocks.prisma.user.findUnique.mockResolvedValue({
      ...utenteAttivo,
      email,
      emailVerificata: false,
    });
    authMocks.compare.mockResolvedValue(true);

    await expect(
      credentialsAuthorize()({ email, password: "password-corretta" }),
    ).rejects.toThrow("Devi verificare l'email prima di accedere");
    // Nessun accesso registrato: la sessione non viene creata.
    expect(authMocks.prisma.user.update).not.toHaveBeenCalled();
  });

  it("[TC-SEC-A5-002] consente l'accesso a un account con email verificata", async () => {
    const email = "verificato@studenti.unisa.it";
    authMocks.prisma.user.findUnique.mockResolvedValue({ ...utenteAttivo, email });
    authMocks.prisma.user.update.mockResolvedValue({ ...utenteAttivo, email });
    authMocks.compare.mockResolvedValue(true);

    const risultato = await credentialsAuthorize()({
      email,
      password: "password-corretta",
    });

    expect(risultato).toMatchObject({ id: utenteAttivo.id, ruolo: "STUDENTE" });
  });
});

describe("signIn Google: allow-list dei domini istituzionali (M-6)", () => {
  it("[TC-SEC-M6-001] rifiuta un indirizzo fuori dai domini di ateneo", async () => {
    const consentito = await signInCallback()({
      user: { email: "chiunque@gmail.com" },
      account: { provider: "google" },
    });

    expect(consentito).toBe(false);
    // Nessun account creato "di straforo" con emailVerificata: true.
    expect(authMocks.prisma.user.create).not.toHaveBeenCalled();
    expect(authMocks.prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it.each([
    "studente@studenti.unisa.it",
    "docente@unisa.it",
    "staff@biblioteca.unisa.it",
  ])("[TC-SEC-M6-002] accetta il dominio istituzionale %s", async (email) => {
    authMocks.prisma.user.findUnique.mockResolvedValue({
      ...utenteAttivo,
      email,
    });
    authMocks.prisma.user.update.mockResolvedValue({ ...utenteAttivo, email });

    const consentito = await signInCallback()({
      user: { email },
      account: { provider: "google" },
    });

    expect(consentito).toBe(true);
  });
});
