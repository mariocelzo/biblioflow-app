// Test della rivalidazione periodica del JWT (rilievo di sicurezza R-2).
//
// COSA: il callback `jwt` popolava i claim SOLO al login e non rileggeva mai
//       il database. Con una sessione che dura 24 ore (`maxAge`), la
//       disattivazione di un account o la retrocessione di un ruolo
//       (BIBLIOTECARIO -> STUDENTE) non avevano ALCUN effetto fino alla
//       scadenza naturale del token: un ex-bibliotecario poteva continuare
//       per 24 ore a chiamare `/api/admin/*`, dato che `requireUser()` si
//       fida ciecamente di `session.user`.
//
// Come in auth-login-sicurezza.test.ts si intercetta la configurazione
// passata a `NextAuth` per invocare direttamente il callback `jwt`, senza
// far girare l'intero stack di Auth.js.

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

type JwtCallback = (params: {
  token: Record<string, unknown>;
  user?: Record<string, unknown>;
}) => Promise<Record<string, unknown> | null>;

type CapturedAuthConfig = {
  callbacks: {
    jwt: JwtCallback;
  };
};

const authMocks = vi.hoisted(() => ({
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
  // `ErroreLogin` estende `CredentialsSignin`: senza questo export il modulo
  // erediterebbe da `undefined` e non si importerebbe nemmeno.
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

vi.mock("@/lib/prisma", () => ({
  default: authMocks.prisma,
  prisma: authMocks.prisma,
}));

vi.mock("@/lib/env", () => ({
  env: { GOOGLE_CLIENT_ID: undefined, GOOGLE_CLIENT_SECRET: undefined },
}));

vi.mock("bcryptjs", () => ({
  default: { compare: vi.fn() },
}));

const utenteLoginato = {
  id: "usr-jwt-001",
  nome: "Mario",
  cognome: "Rossi",
  ruolo: "STUDENTE",
  matricola: "0512100001",
  isPendolare: false,
  necessitaAccessibilita: false,
};

function jwtCallback() {
  const callback = authMocks.config?.callbacks?.jwt;
  if (!callback) {
    throw new Error("Callback jwt non catturato");
  }
  return callback;
}

beforeAll(async () => {
  await import("@/lib/auth");
});

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("jwt: popolamento al login (R-2)", () => {
  it("[TC-SEC-R2-001] al login popola i claim e registra il momento della verifica, senza query al DB", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_000_000);

    const token = await jwtCallback()({ token: {}, user: utenteLoginato });

    expect(token).toMatchObject({
      id: utenteLoginato.id,
      ruolo: "STUDENTE",
      ultimaVerifica: 1_000_000,
    });
    // Il login e' gia' fresco di database (arriva da `authorize` o dal ramo
    // Google di `signIn`): nessuna query aggiuntiva serve qui.
    expect(authMocks.prisma.user.findUnique).not.toHaveBeenCalled();
  });
});

describe("jwt: throttling della rilettura dal database (R-2)", () => {
  it("[TC-SEC-R2-002] entro l'intervallo di rivalidazione non interroga il database", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_000_000);
    const tokenAlLogin = await jwtCallback()({ token: {}, user: utenteLoginato });

    // 30 secondi dopo: sotto la soglia di 60 secondi.
    vi.spyOn(Date, "now").mockReturnValue(1_030_000);
    const tokenSuccessivo = await jwtCallback()({
      token: tokenAlLogin as Record<string, unknown>,
    });

    expect(tokenSuccessivo).toEqual(tokenAlLogin);
    expect(authMocks.prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("[TC-SEC-R2-003] oltre l'intervallo rilegge dal database e invalida la sessione se l'account non e' piu' attivo", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_000_000);
    const tokenAlLogin = await jwtCallback()({ token: {}, user: utenteLoginato });

    // Un bibliotecario disattiva l'account nel frattempo.
    authMocks.prisma.user.findUnique.mockResolvedValue({
      attivo: false,
      ruolo: "STUDENTE",
    });

    // 90 secondi dopo: oltre la soglia di 60 secondi.
    vi.spyOn(Date, "now").mockReturnValue(1_090_000);
    const tokenRivalidato = await jwtCallback()({
      token: tokenAlLogin as Record<string, unknown>,
    });

    // Auth.js tratta un ritorno `null` come token non piu' valido: ripulisce
    // il cookie di sessione, esattamente come un logout forzato.
    expect(tokenRivalidato).toBeNull();
    expect(authMocks.prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: utenteLoginato.id },
      select: { attivo: true, ruolo: true },
    });
  });

  it("[TC-SEC-R2-004] oltre l'intervallo aggiorna il ruolo nel token se e' cambiato nel database", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_000_000);
    const tokenAlLogin = await jwtCallback()({ token: {}, user: utenteLoginato });

    // Un ADMIN retrocede l'utente da BIBLIOTECARIO a STUDENTE (o viceversa
    // qui promuove): il claim nel token deve rispecchiarlo entro un minuto,
    // non entro 24 ore.
    authMocks.prisma.user.findUnique.mockResolvedValue({
      attivo: true,
      ruolo: "BIBLIOTECARIO",
    });

    vi.spyOn(Date, "now").mockReturnValue(1_090_000);
    const tokenRivalidato = await jwtCallback()({
      token: tokenAlLogin as Record<string, unknown>,
    });

    expect(tokenRivalidato).toMatchObject({
      ruolo: "BIBLIOTECARIO",
      ultimaVerifica: 1_090_000,
    });
  });

  it("[TC-SEC-R2-005] se l'utente e' stato cancellato dal database invalida la sessione", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_000_000);
    const tokenAlLogin = await jwtCallback()({ token: {}, user: utenteLoginato });

    authMocks.prisma.user.findUnique.mockResolvedValue(null);

    vi.spyOn(Date, "now").mockReturnValue(1_090_000);
    const tokenRivalidato = await jwtCallback()({
      token: tokenAlLogin as Record<string, unknown>,
    });

    expect(tokenRivalidato).toBeNull();
  });
});
