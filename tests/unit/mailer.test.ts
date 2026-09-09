// ============================================================================
// Test del mailer (invio del link di verifica email)
// ============================================================================
// COSA: verifica la scelta del backend, la forma esatta della richiesta HTTP
//       verso Brevo e Resend, e soprattutto il fatto che un fallimento di
//       invio NON venga mai propagato come eccezione.
//
// PERCHE': il mailer sta sul percorso critico della registrazione. Se lanciasse
// un'eccezione, un provider di posta irraggiungibile farebbe fallire la
// creazione dell'account — che invece deve restare valida, lasciando all'utente
// la possibilita' di farsi rimandare il messaggio. Ed e' l'unico modo di
// convalidare il payload verso Brevo senza possedere una chiave reale.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// L'ambiente e' mockato perche' `@/lib/env` fa `process.exit(1)` se le
// variabili obbligatorie mancano: sotto vitest ucciderebbe il runner.
const envMock = vi.hoisted(() => ({
  valori: {
    BREVO_API_KEY: undefined as string | undefined,
    RESEND_API_KEY: undefined as string | undefined,
    MAIL_FROM: undefined as string | undefined,
    NEXTAUTH_URL: "http://localhost:3000",
    NEXT_PUBLIC_APP_URL: undefined as string | undefined,
    NODE_ENV: "test",
  },
}));

vi.mock("@/lib/env", () => ({
  get env() {
    return envMock.valori;
  },
}));

import {
  emailRecuperoPassword,
  emailVerifica,
  inviaEmail,
  mailerConfigurato,
  separaMittente,
  urlResetPassword,
  urlVerificaEmail,
} from "@/lib/mailer";

const messaggio = {
  to: "studente@studenti.unisa.it",
  subject: "Oggetto",
  html: "<p>ciao</p>",
  text: "ciao",
};

/** Risposta fetch minimale, sufficiente al mailer. */
function risposta(ok: boolean, status = 200, corpo = "") {
  return {
    ok,
    status,
    text: async () => corpo,
  } as unknown as Response;
}

beforeEach(() => {
  envMock.valori.BREVO_API_KEY = undefined;
  envMock.valori.RESEND_API_KEY = undefined;
  envMock.valori.MAIL_FROM = undefined;
  envMock.valori.NEXT_PUBLIC_APP_URL = undefined;
  envMock.valori.NODE_ENV = "test";
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("separaMittente", () => {
  it("[TC-MAIL-001] separa la forma 'Nome <indirizzo>'", () => {
    // Brevo vuole nome e indirizzo in due campi distinti.
    expect(separaMittente("BiblioFlow <no-reply@unisa.it>")).toEqual({
      nome: "BiblioFlow",
      email: "no-reply@unisa.it",
    });
  });

  it("[TC-MAIL-002] accetta anche il solo indirizzo", () => {
    expect(separaMittente("no-reply@unisa.it")).toEqual({
      nome: "BiblioFlow",
      email: "no-reply@unisa.it",
    });
  });

  it("[TC-MAIL-003] tollera spazi e nome vuoto", () => {
    expect(separaMittente("  <no-reply@unisa.it>  ")).toEqual({
      nome: "BiblioFlow",
      email: "no-reply@unisa.it",
    });
  });
});

describe("mailerConfigurato", () => {
  it("[TC-MAIL-004] falso senza nessuna chiave, vero con una qualsiasi", () => {
    expect(mailerConfigurato()).toBe(false);

    envMock.valori.BREVO_API_KEY = "chiave-brevo";
    expect(mailerConfigurato()).toBe(true);

    envMock.valori.BREVO_API_KEY = undefined;
    envMock.valori.RESEND_API_KEY = "chiave-resend";
    expect(mailerConfigurato()).toBe(true);
  });
});

describe("inviaEmail: scelta del backend e forma della richiesta", () => {
  it("[TC-MAIL-005] senza configurazione non invia e non lancia", async () => {
    const fetchSpia = vi.fn();
    vi.stubGlobal("fetch", fetchSpia);
    // In sviluppo il link viene stampato in console: silenziamo l'avviso.
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const esito = await inviaEmail(messaggio);

    expect(esito).toEqual({ inviata: false, motivo: "non_configurato" });
    // Nessuna chiamata di rete a vuoto.
    expect(fetchSpia).not.toHaveBeenCalled();
  });

  it("[TC-MAIL-006] con Brevo invia il payload nel formato atteso dall'API", async () => {
    envMock.valori.BREVO_API_KEY = "chiave-brevo";
    envMock.valori.MAIL_FROM = "BiblioFlow <verificato@unisa.it>";

    const fetchSpia = vi.fn().mockResolvedValue(risposta(true, 201));
    vi.stubGlobal("fetch", fetchSpia);

    const esito = await inviaEmail(messaggio);

    expect(esito).toEqual({ inviata: true, backend: "brevo" });

    const [url, opzioni] = fetchSpia.mock.calls[0];
    expect(url).toBe("https://api.brevo.com/v3/smtp/email");
    // Brevo si autentica con l'header `api-key`, non con un Bearer token.
    expect(opzioni.headers["api-key"]).toBe("chiave-brevo");

    const corpo = JSON.parse(opzioni.body);
    expect(corpo).toMatchObject({
      sender: { name: "BiblioFlow", email: "verificato@unisa.it" },
      to: [{ email: "studente@studenti.unisa.it" }],
      subject: "Oggetto",
      htmlContent: "<p>ciao</p>",
      textContent: "ciao",
    });
  });

  it("[TC-MAIL-007] Brevo ha la precedenza quando ci sono entrambe le chiavi", async () => {
    envMock.valori.BREVO_API_KEY = "chiave-brevo";
    envMock.valori.RESEND_API_KEY = "chiave-resend";

    const fetchSpia = vi.fn().mockResolvedValue(risposta(true));
    vi.stubGlobal("fetch", fetchSpia);

    const esito = await inviaEmail(messaggio);

    expect(esito).toEqual({ inviata: true, backend: "brevo" });
    expect(fetchSpia.mock.calls[0][0]).toContain("brevo.com");
  });

  it("[TC-MAIL-008] con la sola chiave Resend usa Resend", async () => {
    envMock.valori.RESEND_API_KEY = "chiave-resend";

    const fetchSpia = vi.fn().mockResolvedValue(risposta(true));
    vi.stubGlobal("fetch", fetchSpia);

    const esito = await inviaEmail(messaggio);

    expect(esito).toEqual({ inviata: true, backend: "resend" });
    const [url, opzioni] = fetchSpia.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(opzioni.headers.Authorization).toBe("Bearer chiave-resend");
  });
});

describe("inviaEmail: i fallimenti non diventano mai eccezioni", () => {
  it("[TC-MAIL-009] una risposta HTTP di errore diventa un esito negativo", async () => {
    envMock.valori.BREVO_API_KEY = "chiave-brevo";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(risposta(false, 401, "unauthorized")),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});

    const esito = await inviaEmail(messaggio);

    expect(esito.inviata).toBe(false);
    if (!esito.inviata) {
      expect(esito.motivo).toBe("errore_invio");
      // Il dettaglio serve a diagnosticare la configurazione lato server.
      expect(esito.dettaglio).toContain("401");
    }
  });

  it("[TC-MAIL-010] un errore di rete viene catturato e non propagato", async () => {
    envMock.valori.BREVO_API_KEY = "chiave-brevo";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));
    vi.spyOn(console, "error").mockImplementation(() => {});

    // Il punto centrale: la registrazione a monte non deve MAI fallire per
    // colpa del provider di posta.
    const esito = await inviaEmail(messaggio);

    expect(esito).toMatchObject({ inviata: false, motivo: "errore_invio" });
  });
});

describe("urlVerificaEmail ed emailVerifica", () => {
  it("[TC-MAIL-011] costruisce un URL assoluto con i parametri corretti", () => {
    envMock.valori.NEXT_PUBLIC_APP_URL = "https://biblioflow-app.vercel.app/";

    // La barra finale della base non deve produrre un doppio slash.
    expect(urlVerificaEmail("usr-1", "tok-1")).toBe(
      "https://biblioflow-app.vercel.app/verifica-email?userId=usr-1&token=tok-1",
    );
  });

  it("[TC-MAIL-012] ripiega su NEXTAUTH_URL quando manca APP_URL", () => {
    expect(urlVerificaEmail("usr-1", "tok-1")).toBe(
      "http://localhost:3000/verifica-email?userId=usr-1&token=tok-1",
    );
  });

  it("[TC-MAIL-013] il messaggio contiene il link sia in HTML sia in testo", () => {
    const link = "https://esempio.test/verifica-email?userId=a&token=b";
    const corpo = emailVerifica("Mario", link);

    expect(corpo.text).toContain(link);
    expect(corpo.html).toContain(`href="${link}"`);
    expect(corpo.subject).toContain("BiblioFlow");
  });
});

describe("emailRecuperoPassword e urlResetPassword", () => {
  it("[TC-MAIL-014] costruisce un URL di reset assoluto e ben formato", () => {
    envMock.valori.NEXT_PUBLIC_APP_URL = "https://biblioflow-app.vercel.app/";

    expect(urlResetPassword("usr-9", "tok-9")).toBe(
      "https://biblioflow-app.vercel.app/reset-password?userId=usr-9&token=tok-9",
    );
  });

  it("[TC-MAIL-015] il messaggio di reset contiene il link in HTML e in testo", () => {
    const link = "https://esempio.test/reset-password?userId=a&token=b";
    const corpo = emailRecuperoPassword("Mario", link);

    expect(corpo.text).toContain(link);
    expect(corpo.html).toContain(`href="${link}"`);
    // Deve distinguersi dall'email di verifica: sono due flussi diversi e
    // l'oggetto e' cio' che l'utente legge nell'elenco della posta.
    expect(corpo.subject).not.toBe(emailVerifica("Mario", link).subject);
    expect(corpo.subject.toLowerCase()).toContain("password");
  });

  it("[TC-MAIL-016] avvisa chi non ha richiesto il cambio", () => {
    // Un'email di reset non richiesta e' un segnale di tentato accesso: il
    // destinatario deve sapere che ignorarla e' sicuro.
    const corpo = emailRecuperoPassword("Mario", "https://esempio.test/x");

    expect(corpo.text).toMatch(/non hai richiesto/i);
    expect(corpo.html).toMatch(/non hai richiesto/i);
  });
});
