// ============================================================================
// Test integrazione — registrazione, verifica email e reinvio del link
// ============================================================================
// COSA: esercita contro PostgreSQL reale il percorso completo con cui un nuovo
//       studente ottiene un account utilizzabile:
//         POST /api/auth/registrazione   → utente, token VERIF, notifica, log
//         GET  /api/auth/verify          → email verificata, token consumato
//         POST /api/auth/verifica/reinvia → vecchi token bruciati, nuovo link
// PERCHE': le tre route erano a copertura zero. Sono anche il punto in cui un
//       difetto blocca per sempre un utente (login negato finche' l'email non
//       e' verificata), quindi meritano un test sul database vero e non solo
//       sui mock.
//
// Mock minimi: il recapito email (nessuna chiamata di rete), i limitatori di
// frequenza (in memoria e condivisi tra i test) e `@/lib/env` per poter
// simulare la produzione. `@/lib/auth` espone solo le funzioni di password
// reali, cosi' NextAuth non viene caricato.

import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  assertTestDatabaseUrl,
  DEFAULT_TEST_DATABASE_URL,
} from "../fixtures/database";

const mocks = vi.hoisted(() => ({
  inviaEmail: vi.fn(),
  nodeEnv: { valore: "test" },
}));

vi.mock("@/lib/auth", async () => {
  const password = await vi.importActual<typeof import("@/lib/password")>("@/lib/password");
  return {
    hashPassword: password.hashPassword,
    validatePassword: password.validatePassword,
  };
});

vi.mock("@/lib/env", () => ({
  env: new Proxy(
    {},
    {
      get: (_target, chiave: string) => {
        if (chiave === "NODE_ENV") return mocks.nodeEnv.valore;
        if (chiave === "NEXTAUTH_URL") return process.env.NEXTAUTH_URL ?? "http://localhost:3000";
        return process.env[chiave];
      },
    },
  ),
}));

vi.mock("@/lib/mailer", async () => {
  const reale = await vi.importActual<typeof import("@/lib/mailer")>("@/lib/mailer");
  return { ...reale, inviaEmail: mocks.inviaEmail };
});

vi.mock("@/lib/rate-limit", () => ({
  registrationRateLimiter: vi.fn(async () => null),
  createRateLimiter: () => vi.fn(async () => null),
}));

const databaseUrl = process.env.DATABASE_URL ?? DEFAULT_TEST_DATABASE_URL;
assertTestDatabaseUrl(databaseUrl);

const { prisma } = await import("@/lib/prisma");
const { hashToken } = await import("@/lib/auth-tokens");
const registrazioneRoute = await import("@/app/api/auth/registrazione/route");
const verifyRoute = await import("@/app/api/auth/verify/route");
const reinviaRoute = await import("@/app/api/auth/verifica/reinvia/route");

const PREFISSO = "cov-reg-";
const emailDi = (nome: string) => `${PREFISSO}${nome}@studenti.biblioflow.test`;

function corpoRegistrazione(sovrascritture: Record<string, unknown> = {}) {
  return {
    email: emailDi("ada"),
    password: "Biblio!2026sicura",
    confermaPassword: "Biblio!2026sicura",
    nome: "Ada",
    cognome: "Lovelace",
    matricola: "0512100001",
    isPendolare: true,
    cittaResidenza: "Avellino",
    mezzoTrasporto: "Autobus",
    tempoPercorrenza: "45",
    necessitaAccessibilita: true,
    tipoAccessibilita: "Postazione accessibile",
    altreNote: "Vicino all'ingresso",
    ...sovrascritture,
  };
}

function postJson(url: string, corpo: unknown) {
  return new NextRequest(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(corpo),
  });
}

async function registra(sovrascritture: Record<string, unknown> = {}) {
  return registrazioneRoute.POST(
    postJson("http://localhost/api/auth/registrazione", corpoRegistrazione(sovrascritture)),
  );
}

async function verifica(userId: string, token: string) {
  const url = new URL("http://localhost/api/auth/verify");
  url.searchParams.set("userId", userId);
  url.searchParams.set("token", token);
  return verifyRoute.GET(new NextRequest(url));
}

async function reinvia(email: unknown) {
  return reinviaRoute.POST(postJson("http://localhost/api/auth/verifica/reinvia", { email }));
}

async function pulisci() {
  const utenti = await prisma.user.findMany({
    where: { email: { startsWith: PREFISSO } },
    select: { id: true },
  });
  const ids = utenti.map((u) => u.id);
  await prisma.authToken.deleteMany({ where: { userId: { in: ids } } });
  await prisma.notifica.deleteMany({ where: { userId: { in: ids } } });
  await prisma.logEvento.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
}

beforeAll(pulisci);
afterAll(async () => {
  await pulisci();
});

beforeEach(async () => {
  await pulisci();
  mocks.nodeEnv.valore = "test";
  mocks.inviaEmail.mockReset();
  mocks.inviaEmail.mockResolvedValue({ inviata: true, backend: "brevo" });
});

describe("POST /api/auth/registrazione", () => {
  it("[TC-REG-001] crea uno studente non verificato con profilo, notifica, log dedicato e token di verifica", async () => {
    const risposta = await registra();
    expect(risposta.status).toBe(201);
    const corpo = await risposta.json();
    expect(corpo).toMatchObject({
      success: true,
      data: { user: { email: emailDi("ada"), nomeCompleto: "Ada Lovelace" }, emailVerificaInviata: true },
    });

    const utente = await prisma.user.findUniqueOrThrow({
      where: { email: emailDi("ada") },
      select: {
        id: true,
        ruolo: true,
        emailVerificata: true,
        attivo: true,
        matricola: true,
        passwordHash: true,
        tragittoPendolare: true,
        preferenzeAccessibilita: true,
      },
    });
    expect(utente).toMatchObject({
      ruolo: "STUDENTE",
      emailVerificata: false,
      attivo: true,
      matricola: "0512100001",
      tragittoPendolare: "Da: Avellino | Mezzo: Autobus | Tempo: 45 min",
      preferenzeAccessibilita: "Postazione accessibile - Vicino all'ingresso",
    });
    // La password non e' mai salvata in chiaro.
    expect(utente.passwordHash).toMatch(/^\$2[aby]\$/);

    const log = await prisma.logEvento.findFirstOrThrow({ where: { userId: utente.id } });
    // D-01: il log di una registrazione non e' piu' scambiabile per una prenotazione.
    expect(log.tipo).toBe("UTENTE_REGISTRATO");

    await expect(
      prisma.notifica.count({ where: { userId: utente.id, tipo: "SISTEMA", actionUrl: "/" } }),
    ).resolves.toBe(1);

    // Nel database c'e' solo il digest del token, mai il valore inviato all'utente.
    const tokenInChiaro = corpo.data.verification.token as string;
    const salvato = await prisma.authToken.findFirstOrThrow({ where: { userId: utente.id } });
    expect(salvato).toMatchObject({ type: "VERIF", used: false, token: hashToken(tokenInChiaro) });
    expect(salvato.token).not.toBe(tokenInChiaro);
    expect(salvato.expiresAt.getTime()).toBeGreaterThan(Date.now() + 23 * 60 * 60 * 1000);

    expect(mocks.inviaEmail).toHaveBeenCalledTimes(1);
    expect(mocks.inviaEmail.mock.calls[0][0]).toMatchObject({ to: emailDi("ada") });
  });

  it("[TC-REG-002] rifiuta un'email gia' registrata anche se scritta in maiuscolo", async () => {
    expect((await registra()).status).toBe(201);
    const duplicato = await registra({ email: emailDi("ada").toUpperCase(), matricola: "" });
    expect(duplicato.status).toBe(409);
    await expect(prisma.user.count({ where: { email: { startsWith: PREFISSO } } })).resolves.toBe(1);
  });

  it("[TC-REG-003] rifiuta una matricola gia' registrata", async () => {
    expect((await registra()).status).toBe(201);
    const duplicato = await registra({ email: emailDi("grace") });
    expect(duplicato.status).toBe(409);
    await expect(duplicato.json()).resolves.toMatchObject({ error: "Questa matricola è già registrata" });
  });

  it("[TC-REG-004] rifiuta dati incoerenti senza creare nulla", async () => {
    const risposta = await registra({ confermaPassword: "Diversa!2026", matricola: "123" });
    expect(risposta.status).toBe(400);
    const corpo = await risposta.json();
    expect(corpo.details).toHaveProperty("confermaPassword");
    expect(corpo.details).toHaveProperty("matricola");
    await expect(prisma.user.count({ where: { email: { startsWith: PREFISSO } } })).resolves.toBe(0);
    expect(mocks.inviaEmail).not.toHaveBeenCalled();
  });

  it("[TC-REG-005] rifiuta una password lunga ma debole", async () => {
    const risposta = await registra({ password: "passwordlunga", confermaPassword: "passwordlunga" });
    expect(risposta.status).toBe(400);
    await expect(risposta.json()).resolves.toMatchObject({ error: "Password non sufficientemente sicura" });
  });

  it("[TC-REG-006] se l'email non parte l'account resta creato e il client lo sa", async () => {
    mocks.inviaEmail.mockResolvedValue({ inviata: false, motivo: "non_configurato" });
    const risposta = await registra({ isPendolare: false, necessitaAccessibilita: false, matricola: undefined });
    expect(risposta.status).toBe(201);
    await expect(risposta.json()).resolves.toMatchObject({ data: { emailVerificaInviata: false } });
    const utente = await prisma.user.findUniqueOrThrow({
      where: { email: emailDi("ada") },
      select: { tragittoPendolare: true, preferenzeAccessibilita: true, matricola: true },
    });
    expect(utente).toEqual({ tragittoPendolare: null, preferenzeAccessibilita: null, matricola: null });
  });

  it("[TC-REG-007] in produzione il token non viene mai restituito al client", async () => {
    mocks.nodeEnv.valore = "production";
    const risposta = await registra();
    expect(risposta.status).toBe(201);
    const corpo = await risposta.json();
    expect(corpo.data).not.toHaveProperty("verification");
  });
});

describe("GET /api/auth/verify", () => {
  async function registraEPrendiToken() {
    const corpo = await (await registra()).json();
    return { userId: corpo.data.user.id as string, token: corpo.data.verification.token as string };
  }

  it("[TC-VER-001] il link ricevuto verifica l'email e consuma il token", async () => {
    const { userId, token } = await registraEPrendiToken();
    const risposta = await verifica(userId, token);
    expect(risposta.status).toBe(200);
    await expect(risposta.json()).resolves.toMatchObject({ success: true, message: "Email verificata" });
    await expect(
      prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { emailVerificata: true } }),
    ).resolves.toEqual({ emailVerificata: true });
    await expect(prisma.authToken.count({ where: { userId, used: true } })).resolves.toBe(1);
  });

  it("[TC-VER-002] riaprire lo stesso link dopo la verifica non mostra un errore (idempotenza)", async () => {
    const { userId, token } = await registraEPrendiToken();
    await verifica(userId, token);
    const seconda = await verifica(userId, token);
    expect(seconda.status).toBe(200);
    await expect(seconda.json()).resolves.toMatchObject({ message: "Email già verificata" });
  });

  it("[TC-VER-003] rifiuta parametri mancanti, token di un altro utente e token di tipo RESET", async () => {
    const { userId, token } = await registraEPrendiToken();
    const senzaToken = await verifyRoute.GET(
      new NextRequest(`http://localhost/api/auth/verify?userId=${userId}`),
    );
    expect(senzaToken.status).toBe(400);

    expect((await verifica("utente-sconosciuto", token)).status).toBe(400);

    await prisma.authToken.updateMany({ where: { userId }, data: { type: "RESET" } });
    expect((await verifica(userId, token)).status).toBe(400);
    await expect(
      prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { emailVerificata: true } }),
    ).resolves.toEqual({ emailVerificata: false });
  });

  it("[TC-VER-004] rifiuta un token scaduto", async () => {
    const { userId, token } = await registraEPrendiToken();
    await prisma.authToken.updateMany({
      where: { userId },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });
    const risposta = await verifica(userId, token);
    expect(risposta.status).toBe(400);
    await expect(risposta.json()).resolves.toMatchObject({ error: "Token scaduto" });
  });
});

describe("POST /api/auth/verifica/reinvia", () => {
  it("[TC-REINV-001] brucia il vecchio link, ne crea uno nuovo e il vecchio non verifica piu'", async () => {
    const corpo = await (await registra()).json();
    const userId = corpo.data.user.id as string;
    const vecchioToken = corpo.data.verification.token as string;
    mocks.inviaEmail.mockClear();

    const risposta = await reinvia(emailDi("ada").toUpperCase());
    expect(risposta.status).toBe(200);
    expect(mocks.inviaEmail).toHaveBeenCalledTimes(1);

    const token = await prisma.authToken.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });
    expect(token).toHaveLength(2);
    expect(token[0]).toMatchObject({ token: hashToken(vecchioToken), used: true });
    expect(token[1]).toMatchObject({ used: false, type: "VERIF" });

    const vecchio = await verifica(userId, vecchioToken);
    expect(vecchio.status).toBe(400);
    await expect(vecchio.json()).resolves.toMatchObject({
      error: expect.stringContaining("più recente"),
    });
  });

  it("[TC-REINV-002] risponde allo stesso modo per email sconosciute, malformate o gia' verificate", async () => {
    const corpo = await (await registra()).json();
    await verifica(corpo.data.user.id, corpo.data.verification.token);
    mocks.inviaEmail.mockClear();

    const risposte = await Promise.all([
      reinvia(emailDi("nessuno")),
      reinvia("non-una-email"),
      reinvia(emailDi("ada")),
    ]);
    const corpi = await Promise.all(risposte.map((r) => r.json()));
    expect(risposte.map((r) => r.status)).toEqual([200, 200, 200]);
    expect(new Set(corpi.map((c) => c.message)).size).toBe(1);
    expect(mocks.inviaEmail).not.toHaveBeenCalled();
  });

  it("[TC-REINV-003] se il servizio di posta e' guasto lo dice invece di tacere", async () => {
    await registra();
    mocks.inviaEmail.mockResolvedValue({ inviata: false, motivo: "errore_invio", dettaglio: "timeout" });
    const risposta = await reinvia(emailDi("ada"));
    expect(risposta.status).toBe(503);
  });
});
