// ============================================================================
// Test dei codici di errore del login
// ============================================================================
// COSA: verifica che `authorize` comunichi il MOTIVO del fallimento in un campo
//       `code`, e che la traduzione in italiano di quel codice sia corretta.
//
// PERCHE' ESISTONO QUESTI TEST (regressione reale, wizard di registrazione):
// Auth.js lascia arrivare al browser solo gli errori "client-safe". Un
// `new Error("...")` lanciato dentro `authorize` NON lo e': viene incartato in
// un CallbackRouteError e riportato come `error=Configuration`, perdendo il
// motivo. Conseguenze osservate in produzione:
//   - la pagina di login mostrava sempre il messaggio generico, perche' la sua
//     mappa era indicizzata sulle frasi italiane che al client non arrivano;
//   - dopo la registrazione l'auto-login veniva NEGATO (email non ancora
//     verificata) ma il client lo leggeva come riuscito, perche' controllava
//     `signIn().ok`, che e' solo lo status HTTP della POST — 200 anche in caso
//     di rifiuto. L'utente atterrava in home slegato e senza messaggi.
// Lanciando `CredentialsSignin` (che Auth.js ammette) il motivo viaggia nel
// campo `code`. Questi test bloccano quel contratto.

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  CODICI_ERRORE_LOGIN,
  isCodiceErroreLogin,
  messaggioErroreLogin,
} from "@/lib/auth-errors";

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
    user: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn() },
  },
}));

vi.mock("next-auth", () => ({
  default: vi.fn((config: CapturedAuthConfig) => {
    authMocks.config = config;
    return { handlers: {}, signIn: vi.fn(), signOut: vi.fn(), auth: vi.fn() };
  }),
  // Sostituto minimale della classe reale: quel che conta e' che sia una
  // classe estendibile che espone `code`, cioe' il campo che Auth.js
  // serializza verso il browser.
  CredentialsSignin: class extends Error {
    code = "credentials";
  },
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

const utenteAttivo = {
  id: "usr-cod-001",
  email: "codici@studenti.unisa.it",
  passwordHash: "$2b$12$hash-reale",
  nome: "Test",
  cognome: "Codici",
  ruolo: "STUDENTE",
  matricola: "0512100099",
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

/** Esegue authorize e restituisce il `code` dell'errore lanciato. */
async function codiceDiErrore(
  credenziali: Record<string, unknown>,
): Promise<string | undefined> {
  try {
    await credentialsAuthorize()(credenziali);
    return undefined;
  } catch (errore) {
    return (errore as { code?: string }).code;
  }
}

beforeAll(async () => {
  await import("@/lib/auth");
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("authorize: il motivo del rifiuto arriva al client come codice", () => {
  it("[TC-LOGIN-COD-001] email o password mancanti -> campi_mancanti", async () => {
    expect(await codiceDiErrore({ email: "", password: "" })).toBe(
      CODICI_ERRORE_LOGIN.CAMPI_MANCANTI,
    );
  });

  it("[TC-LOGIN-COD-002] utente inesistente -> credenziali_non_valide", async () => {
    authMocks.prisma.user.findUnique.mockResolvedValue(null);
    authMocks.compare.mockResolvedValue(false);

    expect(
      await codiceDiErrore({
        email: "ignoto@studenti.unisa.it",
        password: "qualsiasi",
      }),
    ).toBe(CODICI_ERRORE_LOGIN.CREDENZIALI_NON_VALIDE);
  });

  it("[TC-LOGIN-COD-003] password errata -> stesso codice dell'utente inesistente (A-4)", async () => {
    // Se i due rami avessero codici diversi, il login tornerebbe a essere un
    // oracolo per scoprire quali indirizzi sono registrati.
    authMocks.prisma.user.findUnique.mockResolvedValue({
      ...utenteAttivo,
      email: "distinto@studenti.unisa.it",
    });
    authMocks.compare.mockResolvedValue(false);

    expect(
      await codiceDiErrore({
        email: "distinto@studenti.unisa.it",
        password: "sbagliata",
      }),
    ).toBe(CODICI_ERRORE_LOGIN.CREDENZIALI_NON_VALIDE);
  });

  it("[TC-LOGIN-COD-004] account disattivato -> account_disabilitato", async () => {
    authMocks.prisma.user.findUnique.mockResolvedValue({
      ...utenteAttivo,
      email: "spento@studenti.unisa.it",
      attivo: false,
    });

    expect(
      await codiceDiErrore({
        email: "spento@studenti.unisa.it",
        password: "qualsiasi",
      }),
    ).toBe(CODICI_ERRORE_LOGIN.ACCOUNT_DISABILITATO);
  });

  it("[TC-LOGIN-COD-005] email non verificata -> email_non_verificata", async () => {
    authMocks.prisma.user.findUnique.mockResolvedValue({
      ...utenteAttivo,
      email: "daverificare@studenti.unisa.it",
      emailVerificata: false,
    });
    authMocks.compare.mockResolvedValue(true);

    expect(
      await codiceDiErrore({
        email: "daverificare@studenti.unisa.it",
        password: "password-corretta",
      }),
    ).toBe(CODICI_ERRORE_LOGIN.EMAIL_NON_VERIFICATA);
  });

  it("[TC-LOGIN-COD-006] la verifica email e' controllata DOPO la password (A-4)", async () => {
    // Con una password sbagliata su un account non verificato deve uscire
    // "credenziali non valide", non "email non verificata": altrimenti
    // chiunque, tirando a indovinare, scoprirebbe che l'indirizzo esiste.
    authMocks.prisma.user.findUnique.mockResolvedValue({
      ...utenteAttivo,
      email: "nonverificato2@studenti.unisa.it",
      emailVerificata: false,
    });
    authMocks.compare.mockResolvedValue(false);

    expect(
      await codiceDiErrore({
        email: "nonverificato2@studenti.unisa.it",
        password: "password-sbagliata",
      }),
    ).toBe(CODICI_ERRORE_LOGIN.CREDENZIALI_NON_VALIDE);
  });

  it("[TC-LOGIN-COD-007] un login valido non lancia e restituisce l'utente", async () => {
    authMocks.prisma.user.findUnique.mockResolvedValue({
      ...utenteAttivo,
      email: "ok@studenti.unisa.it",
    });
    authMocks.prisma.user.update.mockResolvedValue(utenteAttivo);
    authMocks.compare.mockResolvedValue(true);

    const risultato = await credentialsAuthorize()({
      email: "ok@studenti.unisa.it",
      password: "password-corretta",
    });

    expect(risultato).toMatchObject({ id: utenteAttivo.id, ruolo: "STUDENTE" });
  });
});

describe("messaggioErroreLogin: traduzione dei codici", () => {
  it("[TC-LOGIN-MSG-001] ogni codice noto ha un messaggio dedicato e non generico", () => {
    const generico = "Errore durante l'accesso. Riprova.";
    const messaggi = Object.values(CODICI_ERRORE_LOGIN).map(messaggioErroreLogin);

    for (const messaggio of messaggi) {
      expect(messaggio).not.toBe(generico);
      expect(messaggio.length).toBeGreaterThan(0);
    }

    // Nessun messaggio duplicato tranne la coppia voluta: nessuna.
    expect(new Set(messaggi).size).toBe(messaggi.length);
  });

  it("[TC-LOGIN-MSG-002] un codice sconosciuto ricade sul messaggio generico", () => {
    // "Configuration" e' proprio cio' che arrivava prima della correzione:
    // deve produrre un messaggio comprensibile, non una stringa tecnica.
    expect(messaggioErroreLogin("Configuration")).toBe(
      "Errore durante l'accesso. Riprova.",
    );
    expect(messaggioErroreLogin(undefined)).toBe(
      "Errore durante l'accesso. Riprova.",
    );
    expect(messaggioErroreLogin(42)).toBe("Errore durante l'accesso. Riprova.");
  });

  it("[TC-LOGIN-MSG-003] isCodiceErroreLogin riconosce solo i codici noti", () => {
    expect(isCodiceErroreLogin(CODICI_ERRORE_LOGIN.TROPPI_TENTATIVI)).toBe(true);
    expect(isCodiceErroreLogin("qualcosa_altro")).toBe(false);
    expect(isCodiceErroreLogin(null)).toBe(false);
    // Non deve farsi ingannare dalle proprieta' ereditate da Object.prototype.
    expect(isCodiceErroreLogin("toString")).toBe(false);
  });
});
