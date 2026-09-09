// ============================================================================
// INVIO EMAIL - BiblioFlow
// ============================================================================
// COSA: unico punto da cui l'applicazione manda email transazionali.
//
// PERCHE' ESISTE: la verifica dell'email e' obbligatoria per accedere
// (finding A-5), ma il progetto non ha mai avuto un modo per RECAPITARE il
// token di verifica. In produzione il token non viene nemmeno restituito al
// client (finding C-1, giustamente: esporlo permetterebbe di auto-verificare
// l'indirizzo di un altro). Risultato: chi si registrava non poteva piu'
// accedere, mai. Questo modulo chiude quel buco.
//
// DUE BACKEND, entrambi via API HTTP, scelti in base alle variabili presenti:
//   1. Brevo  -> BREVO_API_KEY   (piano gratuito, 300 email/giorno, basta
//                verificare un singolo indirizzo mittente: nessun dominio)
//   2. Resend -> RESEND_API_KEY  (senza dominio verificato scrive SOLO
//                all'indirizzo del titolare dell'account)
//
// PERCHE' HTTP E NON SMTP: la strada SMTP passa da `nodemailer`, ma next-auth
// 5.0.0-beta.32 dichiara `peerOptional nodemailer@"^7.0.7 || ^8.0.5"` mentre
// TUTTE le versioni <= 9.1.0 hanno vulnerabilita' di gravita' alta
// (GHSA-p6gq-j5cr-w38f e altre quattro). Non esiste quindi una versione allo
// stesso tempo compatibile e non vulnerabile: installarla farebbe fallire
// `npm audit --audit-level=high` in CI. Le API HTTP non richiedono alcuna
// dipendenza e tolgono di mezzo il problema.
//
// Se non e' configurato nulla il modulo NON esplode: lo segnala al chiamante e
// in sviluppo stampa il link in console, cosi' il flusso resta percorribile.

import { env } from "./env";

/** Esito di un invio. Non lanciamo mai: l'esito e' un valore di ritorno. */
export type EsitoInvio =
  | { inviata: true; backend: "brevo" | "resend" }
  | { inviata: false; motivo: "non_configurato" | "errore_invio"; dettaglio?: string };

export interface MessaggioEmail {
  to: string;
  subject: string;
  /** Corpo HTML. */
  html: string;
  /** Corpo testuale, per i client che non renderizzano HTML. */
  text: string;
}

/**
 * Mittente, nella forma "Nome <indirizzo>" oppure solo "indirizzo".
 *
 * Deve corrispondere a un mittente autorizzato presso il provider, altrimenti
 * l'invio viene rifiutato: su Brevo e' l'indirizzo verificato in dashboard, su
 * Resend un indirizzo del dominio verificato.
 */
function mittenteGrezzo(): string {
  // Ripiego valido solo su Resend senza dominio verificato: consente di
  // scrivere unicamente all'indirizzo del titolare dell'account Resend.
  return env.MAIL_FROM ?? "BiblioFlow <onboarding@resend.dev>";
}

/**
 * Separa "Nome <indirizzo@dominio>" nelle due parti.
 *
 * Serve perche' Brevo vuole nome e indirizzo in due campi distinti, mentre
 * Resend accetta la forma unica. Se non c'e' la parte fra parentesi angolari
 * si assume che il valore sia gia' il solo indirizzo.
 */
export function separaMittente(valore: string): { nome: string; email: string } {
  const conNome = valore.match(/^\s*(.*?)\s*<\s*([^>]+)\s*>\s*$/);

  if (conNome) {
    return { nome: conNome[1] || "BiblioFlow", email: conNome[2] };
  }

  return { nome: "BiblioFlow", email: valore.trim() };
}

/** True se almeno un backend di invio e' configurato. */
export function mailerConfigurato(): boolean {
  return Boolean(env.BREVO_API_KEY || env.RESEND_API_KEY);
}

/** Invio tramite l'API transazionale di Brevo. */
async function inviaConBrevo(messaggio: MessaggioEmail): Promise<EsitoInvio> {
  const mittente = separaMittente(mittenteGrezzo());

  const risposta = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": env.BREVO_API_KEY as string,
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      sender: { name: mittente.nome, email: mittente.email },
      to: [{ email: messaggio.to }],
      subject: messaggio.subject,
      htmlContent: messaggio.html,
      textContent: messaggio.text,
    }),
  });

  if (!risposta.ok) {
    // Il corpo dell'errore e' prezioso in fase di configurazione (mittente non
    // verificato, chiave errata, quota esaurita): resta nei log del server e
    // non viene mai rimandato al browser.
    const dettaglio = await risposta.text().catch(() => "");
    return {
      inviata: false,
      motivo: "errore_invio",
      dettaglio: `Brevo HTTP ${risposta.status}: ${dettaglio.slice(0, 300)}`,
    };
  }

  return { inviata: true, backend: "brevo" };
}

/** Invio tramite l'API HTTP di Resend. */
async function inviaConResend(messaggio: MessaggioEmail): Promise<EsitoInvio> {
  const risposta = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: mittenteGrezzo(),
      to: [messaggio.to],
      subject: messaggio.subject,
      html: messaggio.html,
      text: messaggio.text,
    }),
  });

  if (!risposta.ok) {
    const dettaglio = await risposta.text().catch(() => "");
    return {
      inviata: false,
      motivo: "errore_invio",
      dettaglio: `Resend HTTP ${risposta.status}: ${dettaglio.slice(0, 300)}`,
    };
  }

  return { inviata: true, backend: "resend" };
}

/**
 * Manda un'email.
 *
 * NON LANCIA MAI: chi la chiama sta quasi sempre completando un'operazione piu'
 * importante (la registrazione di un utente) che non deve fallire solo perche'
 * il provider di posta e' irraggiungibile. L'esito va invece ispezionato e, se
 * negativo, comunicato all'utente come "email non inviata, puoi richiederla".
 */
export async function inviaEmail(
  messaggio: MessaggioEmail,
): Promise<EsitoInvio> {
  if (!mailerConfigurato()) {
    // In sviluppo il link va comunque mostrato, altrimenti non c'e' modo di
    // completare la verifica in locale. In produzione ci limitiamo a un
    // avviso: stampare un token di verifica nei log sarebbe un rischio.
    if (env.NODE_ENV !== "production") {
      console.warn(
        `[mailer] Nessun backend configurato. Email NON inviata a ${messaggio.to}.\n` +
          `[mailer] Contenuto testuale:\n${messaggio.text}`,
      );
    } else {
      console.error(
        "[mailer] Nessun backend email configurato in produzione: " +
          "imposta BREVO_API_KEY oppure RESEND_API_KEY.",
      );
    }

    return { inviata: false, motivo: "non_configurato" };
  }

  try {
    if (env.BREVO_API_KEY) {
      return await inviaConBrevo(messaggio);
    }

    return await inviaConResend(messaggio);
  } catch (errore) {
    const dettaglio = errore instanceof Error ? errore.message : String(errore);
    console.error("[mailer] Invio fallito:", dettaglio);
    return { inviata: false, motivo: "errore_invio", dettaglio };
  }
}

// ---------------------------------------------------------------------------
// Template: email di verifica dell'indirizzo
// ---------------------------------------------------------------------------

/**
 * Costruisce l'URL assoluto su cui l'utente deve cliccare.
 *
 * Deve essere ASSOLUTO: dentro un'email un path relativo non significa nulla.
 * La base viene da NEXT_PUBLIC_APP_URL (o NEXTAUTH_URL come ripiego), cosi'
 * l'ambiente di sviluppo genera link a localhost e la produzione al dominio
 * vero, senza codice condizionale sparso.
 */
export function urlVerificaEmail(userId: string, token: string): string {
  const base = (env.NEXT_PUBLIC_APP_URL ?? env.NEXTAUTH_URL).replace(/\/+$/, "");
  const parametri = new URLSearchParams({ userId, token });

  return `${base}/verifica-email?${parametri.toString()}`;
}

/** Email di benvenuto con il link di verifica. */
export function emailVerifica(
  nome: string,
  link: string,
): Omit<MessaggioEmail, "to"> {
  const testo =
    `Ciao ${nome},\n\n` +
    "per completare la registrazione a BiblioFlow devi confermare il tuo " +
    "indirizzo email. Apri questo link:\n\n" +
    `${link}\n\n` +
    "Il link resta valido 24 ore. Se non hai richiesto tu la registrazione, " +
    "puoi ignorare questo messaggio: senza conferma l'account non potra' essere usato.\n\n" +
    "— BiblioFlow, Biblioteca UNISA";

  const html = `
    <div style="font-family: system-ui, -apple-system, Segoe UI, sans-serif; max-width: 520px; margin: 0 auto; color: #0f172a;">
      <h1 style="font-size: 20px; margin-bottom: 4px;">Conferma il tuo indirizzo email</h1>
      <p style="color: #475569; margin-top: 0;">Ciao ${nome}, ci manca solo un passaggio.</p>
      <p>Per completare la registrazione a <strong>BiblioFlow</strong> e poter accedere, conferma il tuo indirizzo email.</p>
      <p style="margin: 28px 0;">
        <a href="${link}"
           style="background: #2563eb; color: #ffffff; text-decoration: none; padding: 12px 22px; border-radius: 8px; font-weight: 600; display: inline-block;">
          Verifica la mia email
        </a>
      </p>
      <p style="color: #475569; font-size: 13px;">
        Se il pulsante non funziona, copia questo indirizzo nel browser:<br />
        <a href="${link}" style="color: #2563eb; word-break: break-all;">${link}</a>
      </p>
      <p style="color: #64748b; font-size: 13px;">
        Il link resta valido <strong>24 ore</strong>. Se non hai richiesto tu la
        registrazione puoi ignorare questo messaggio: senza conferma l'account
        non potrà essere usato.
      </p>
      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
      <p style="color: #94a3b8; font-size: 12px; margin: 0;">BiblioFlow — Biblioteca UNISA</p>
    </div>
  `.trim();

  return {
    subject: "Conferma il tuo indirizzo email — BiblioFlow",
    text: testo,
    html,
  };
}
