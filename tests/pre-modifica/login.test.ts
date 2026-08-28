import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

type CredentialsProvider = {
  authorize?: (credentials: Record<string, unknown>) => Promise<unknown>;
};

type CapturedAuthConfig = {
  providers: CredentialsProvider[];
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
    return {
      handlers: {},
      signIn: vi.fn(),
      signOut: vi.fn(),
      auth: vi.fn(),
    };
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
  default: vi.fn((options: object) => ({
    id: "google",
    type: "oidc",
    ...options,
  })),
}));

vi.mock("@/lib/prisma", () => ({
  default: authMocks.prisma,
  prisma: authMocks.prisma,
}));

vi.mock("@/lib/env", () => ({
  env: {
    GOOGLE_CLIENT_ID: undefined,
    GOOGLE_CLIENT_SECRET: undefined,
  },
}));

vi.mock("bcryptjs", () => ({
  default: {
    compare: authMocks.compare,
  },
}));

const activeStudent = {
  id: "pre-login-user",
  email: "studente@biblioflow.test",
  passwordHash: "$2b$10$baseline",
  nome: "Studente",
  cognome: "Baseline",
  ruolo: "STUDENTE",
  matricola: "PRE001",
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

beforeAll(async () => {
  await import("@/lib/auth");
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("login pre-modifica", () => {
  it("[TC-PRE-011] autentica un account attivo con credenziali corrette", async () => {
    authMocks.prisma.user.findUnique.mockResolvedValue(activeStudent);
    authMocks.prisma.user.update.mockResolvedValue(activeStudent);
    authMocks.compare.mockResolvedValue(true);

    const result = await credentialsAuthorize()({
      email: activeStudent.email,
      password: "password-corretta",
    });

    expect(result).toEqual({
      id: activeStudent.id,
      email: activeStudent.email,
      nome: activeStudent.nome,
      cognome: activeStudent.cognome,
      ruolo: activeStudent.ruolo,
      matricola: activeStudent.matricola,
      isPendolare: false,
      necessitaAccessibilita: false,
    });
    expect(authMocks.prisma.user.update).toHaveBeenCalledWith({
      where: { id: activeStudent.id },
      data: { ultimoAccesso: expect.any(Date) },
    });
  });

  it("[TC-PRE-012] rifiuta una password errata senza aggiornare l'accesso", async () => {
    authMocks.prisma.user.findUnique.mockResolvedValue(activeStudent);
    authMocks.compare.mockResolvedValue(false);

    await expect(
      credentialsAuthorize()({
        email: activeStudent.email,
        password: "password-errata",
      }),
    ).rejects.toThrow("Credenziali non valide");
    expect(authMocks.prisma.user.update).not.toHaveBeenCalled();
  });

  it("[TC-PRE-013] rifiuta un account disattivato prima della verifica password", async () => {
    authMocks.prisma.user.findUnique.mockResolvedValue({
      ...activeStudent,
      attivo: false,
    });

    await expect(
      credentialsAuthorize()({
        email: activeStudent.email,
        password: "password-corretta",
      }),
    ).rejects.toThrow("Account disabilitato. Contatta la biblioteca.");
    expect(authMocks.compare).not.toHaveBeenCalled();
    expect(authMocks.prisma.user.update).not.toHaveBeenCalled();
  });
});
