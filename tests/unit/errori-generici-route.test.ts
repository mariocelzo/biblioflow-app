// ============================================================================
// Test trasversale — un guasto del database non esce mai dalle API
// ============================================================================
// COSA: ogni route handler viene chiamato con un utente staff autenticato e
//       con un database che rifiuta qualunque operazione.
// PERCHE': e' la regola B-1 dell'audit di sicurezza: un errore interno deve
//       diventare un 500 con un messaggio generico, mai un messaggio che
//       riporta nomi di tabelle, driver, query o stack. Verificarla route per
//       route, una alla volta, lascerebbe sempre qualche handler scoperto:
//       qui l'elenco e' unico e ogni nuova route va aggiunta.
//
// Restano fuori, con motivo:
//   - `auth/[...nextauth]`: delega interamente a NextAuth;
//   - `cron/automations`: per progetto non risponde 500, riporta gli errori
//     dei singoli passi (vedi tests/unit/automation-run-isolamento.test.ts);
//   - `admin/scanner/validate`: rifiuta il QR non firmato prima di toccare il
//     database (vedi tests/unit/admin-scanner-validate.test.ts);
//   - `auth/recupera-password`: risponde sempre allo stesso modo per non
//     rivelare quali email esistono (vedi tests/unit/auth-recupera-password.test.ts).

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const SEGRETO = "relation \"User\" does not exist at pg-pool/index.js:45";

const mocks = vi.hoisted(() => {
  const segreto = 'relation "User" does not exist at pg-pool/index.js:45';
  const fallisce = () => vi.fn(async () => Promise.reject(new Error(segreto)));
  const prisma = new Proxy(
    {},
    {
      get: (_t, modello: string) =>
        modello === "then"
          ? undefined
          : modello.startsWith("$")
            ? fallisce()
            : new Proxy({}, { get: () => fallisce() }),
    },
  );
  class AuthError extends Error {
    constructor(
      public readonly status: 401 | 403 | 404,
      public readonly code: string,
      message: string,
    ) {
      super(message);
      this.name = "AuthError";
    }
  }
  const admin = {
    id: "admin-1",
    email: "admin@biblioflow.test",
    nome: "Ada",
    cognome: "Admin",
    ruolo: "ADMIN",
    matricola: null,
    isPendolare: false,
    necessitaAccessibilita: false,
  };
  const limitatore = () => vi.fn(async () => null);
  return { prisma, AuthError, admin, limitatore };
});

vi.mock("@/lib/prisma", () => ({ default: mocks.prisma, prisma: mocks.prisma }));
vi.mock("@/lib/auth", async () => {
  const password = await vi.importActual<typeof import("@/lib/password")>("@/lib/password");
  return {
    ...password,
    AuthError: mocks.AuthError,
    auth: vi.fn(async () => ({ user: mocks.admin })),
    requireUser: vi.fn(async () => mocks.admin),
    requireRole: vi.fn(async () => mocks.admin),
    assertOwnership: vi.fn(),
    isStaff: (ruolo: string) => ruolo === "BIBLIOTECARIO" || ruolo === "ADMIN",
    hasRole: () => true,
  };
});
vi.mock("@/lib/rate-limit", () => ({
  createRateLimiter: () => mocks.limitatore(),
  loginRateLimiter: mocks.limitatore(),
  registrationRateLimiter: mocks.limitatore(),
  passwordResetRateLimiter: mocks.limitatore(),
  apiRateLimiter: mocks.limitatore(),
  readApiRateLimiter: mocks.limitatore(),
  criticalApiRateLimiter: mocks.limitatore(),
  staffCriticalApiRateLimiter: mocks.limitatore(),
  bookingRateLimiter: mocks.limitatore(),
  loanRequestRateLimiter: mocks.limitatore(),
}));
vi.mock("@/lib/mailer", async () => {
  const reale = await vi.importActual<typeof import("@/lib/mailer")>("@/lib/mailer");
  return { ...reale, inviaEmail: vi.fn(async () => ({ inviata: true, backend: "brevo" })) };
});

type Handler = (richiesta: NextRequest, contesto: { params: Promise<Record<string, string>> }) => Promise<Response>;
type Caso = [descrizione: string, modulo: string, metodo: string, url: string, corpo?: unknown];

const ID = "id-1";
const prenotazione = { postoId: "posto-a1", data: "2030-01-15", oraInizio: "09:00", oraFine: "11:00" };

const casi: Caso[] = [
  ["GET elenco prenotazioni", "prenotazioni/route", "GET", "/api/prenotazioni"],
  ["POST nuova prenotazione", "prenotazioni/route", "POST", "/api/prenotazioni", prenotazione],
  ["GET prenotazione", "prenotazioni/[id]/route", "GET", `/api/prenotazioni/${ID}`],
  ["PATCH prenotazione", "prenotazioni/[id]/route", "PATCH", `/api/prenotazioni/${ID}`, { azione: "cancella" }],
  ["DELETE prenotazione", "prenotazioni/[id]/route", "DELETE", `/api/prenotazioni/${ID}`],
  ["POST check-in", "prenotazioni/[id]/check-in/route", "POST", `/api/prenotazioni/${ID}/check-in`, {}],
  ["GET slot estensione", "prenotazioni/[id]/estendi/route", "GET", `/api/prenotazioni/${ID}/estendi`],
  ["POST estensione", "prenotazioni/[id]/estendi/route", "POST", `/api/prenotazioni/${ID}/estendi`, { nuovaOraFine: "13:00" }],
  ["GET QR prenotazione", "prenotazioni/[id]/qr/route", "GET", `/api/prenotazioni/${ID}/qr`],
  ["GET lista d'attesa", "prenotazioni/coda/route", "GET", "/api/prenotazioni/coda"],
  ["POST ingresso in coda", "prenotazioni/coda/route", "POST", "/api/prenotazioni/coda", prenotazione],
  ["DELETE uscita dalla coda", "prenotazioni/coda/route", "DELETE", `/api/prenotazioni/coda?id=${ID}`],
  ["GET posti", "posti/route", "GET", "/api/posti?salaId=sala-1"],
  ["GET sale", "sale/route", "GET", "/api/sale"],
  ["GET disponibilita' giorni", "disponibilita-giorni/route", "GET", "/api/disponibilita-giorni?startDate=2030-01-14&endDate=2030-01-20"],
  ["GET catalogo", "libri/route", "GET", "/api/libri"],
  ["GET libro", "libri/[id]/route", "GET", `/api/libri/${ID}`],
  ["GET prestiti", "prestiti/route", "GET", "/api/prestiti"],
  ["POST prestito", "prestiti/route", "POST", "/api/prestiti", { libroId: "libro-1" }],
  ["GET prestito", "prestiti/[id]/route", "GET", `/api/prestiti/${ID}`],
  ["PATCH prestito", "prestiti/[id]/route", "PATCH", `/api/prestiti/${ID}`, { azione: "restituisci" }],
  ["POST rinnovo prestito", "prestiti/[id]/rinnova/route", "POST", `/api/prestiti/${ID}/rinnova`, {}],
  ["GET richieste", "richieste/route", "GET", "/api/richieste"],
  ["POST richiesta di preparazione", "richieste/route", "POST", "/api/richieste", { libroId: "libro-1" }],
  ["GET notifiche", "notifiche/route", "GET", "/api/notifiche"],
  ["PATCH notifiche", "notifiche/route", "PATCH", "/api/notifiche", { segnaTutteLette: true }],
  ["DELETE notifica", "notifiche/route", "DELETE", `/api/notifiche?id=${ID}`],
  ["POST notifica (staff)", "notifiche/route", "POST", "/api/notifiche", { userId: "u1", tipo: "SISTEMA", titolo: "t", messaggio: "m" }],
  ["GET profilo", "profilo/route", "GET", "/api/profilo"],
  ["PATCH profilo", "profilo/route", "PATCH", "/api/profilo", { darkMode: true }],
  ["POST registrazione", "auth/registrazione/route", "POST", "/api/auth/registrazione", {
    email: "nuovo@biblioflow.test", password: "Biblio2026x", confermaPassword: "Biblio2026x", nome: "Nuovo", cognome: "Utente",
  }],
  ["GET verifica email", "auth/verify/route", "GET", "/api/auth/verify?userId=u1&token=t"],
  ["POST reinvio verifica", "auth/verifica/reinvia/route", "POST", "/api/auth/verifica/reinvia", { email: "nuovo@biblioflow.test" }],
  ["POST reset password", "auth/reset-password/route", "POST", "/api/auth/reset-password", { userId: "u1", token: "t", newPassword: "Biblio2026x" }],
  ["POST azioni anomalie", "admin/anomalie/route", "POST", "/api/admin/anomalie", { azione: "INVIA_ALERT_BROADCAST" }],
  ["POST email dallo staff", "admin/email/route", "POST", "/api/admin/email", { to: "u@biblioflow.test", oggetto: "Avviso", messaggio: "Testo" }],
  ["GET posto (staff)", "admin/posti/[id]/route", "GET", `/api/admin/posti/${ID}`],
  ["PATCH posto (staff)", "admin/posti/[id]/route", "PATCH", `/api/admin/posti/${ID}`, { stato: "DISPONIBILE" }],
  ["GET dettagli posto", "admin/posti/[id]/dettagli/route", "GET", `/api/admin/posti/${ID}/dettagli`],
  ["POST azioni prenotazioni (staff)", "admin/prenotazioni/route", "POST", "/api/admin/prenotazioni", { azione: "ANNULLA_SINGOLA", prenotazioneId: ID }],
  ["POST azioni prestiti (staff)", "admin/prestiti/route", "POST", "/api/admin/prestiti", { azione: "RINNOVA", prestitoId: ID }],
  ["GET richieste (staff)", "admin/richieste/route", "GET", "/api/admin/richieste"],
  ["PATCH richiesta (staff)", "admin/richieste/route", "PATCH", "/api/admin/richieste", { id: ID, stato: "PRONTA_RITIRO" }],
  ["GET statistiche", "admin/statistiche/route", "GET", "/api/admin/statistiche?tipo=utenti-attivi"],
  ["GET utente (staff)", "admin/utenti/[id]/route", "GET", `/api/admin/utenti/${ID}`],
  ["PATCH utente (admin)", "admin/utenti/[id]/route", "PATCH", `/api/admin/utenti/${ID}`, { attivo: false }],
  ["GET profilo utente (staff)", "admin/utenti/[id]/profilo/route", "GET", `/api/admin/utenti/${ID}/profilo`],
  ["GET storico utente (staff)", "admin/utenti/[id]/storico/route", "GET", `/api/admin/utenti/${ID}/storico`],
  ["POST notifica a un utente (staff)", "admin/utenti/[id]/notifica/route", "POST", `/api/admin/utenti/${ID}/notifica`, { titolo: "Avviso", messaggio: "Testo" }],
];

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "log").mockImplementation(() => undefined);
});

describe("guasto del database", () => {
  it.each(casi)("[TC-ERR-GEN-001] %s risponde 500 senza dettagli interni", async (_descrizione, modulo, metodo, url, corpo) => {
    const route = (await import(`@/app/api/${modulo}`)) as Record<string, Handler>;
    const richiesta = new NextRequest(`http://localhost${url}`, {
      method: metodo,
      headers: corpo === undefined ? undefined : { "content-type": "application/json" },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });

    const risposta = await route[metodo](richiesta, { params: Promise.resolve({ id: ID }) });

    expect(risposta.status).toBe(500);
    const testo = await risposta.text();
    expect(testo).not.toContain("relation");
    expect(testo).not.toContain("pg-pool");
    expect(testo).not.toContain(SEGRETO);
    expect(() => JSON.parse(testo)).not.toThrow();
  });
});
