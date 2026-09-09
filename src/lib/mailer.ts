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
// DUE BACKEND, scelti in base alle variabili d'ambiente presenti:
//   1. Resend  -> basta RESEND_API_KEY. Nessuna dipendenza: e' una POST HTTP.
//   2. SMTP    -> SMTP_HOST/PORT/USER/PASSWORD. Funziona con qualunque
//                 provider (Gmail con app password, SMTP di ateneo, Brevo...).
// Se non e' configurato nulla il modulo NON esplode: lo segnala al chiamante e
// in sviluppo stampa il link in console, cosi' il flusso resta percorribile.

import { env } from "./env";

/** Esito di un invio. Non lanciamo mai: l'esito e' un valore di ritorno. */
export type EsitoInvio =
  | { inviata: true; backend: "resend" | "smtp" }
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
 * Mittente delle email. Molti provider rifiutano l'invio se il dominio del
 * mittente non e' verificato: va impostato coerentemente con il servizio scelto.
 */
function mittente(): string {
  if (env.MAIL_FROM) {
    return env.MAIL_FROM;
  }

  // Ripiego per SMTP: quasi tutti i provider (Gmail in testa) accettano come
  // mittente SOLO l'account con cui ci si e' autenticati, e riscrivono o
  // rifiutano un `From` diverso. Se MAIL_FROM non e' stato impostato, usare
  // l'utente SMTP e' quindi la scelta che funziona invece di fallire.
  if (env.SMTP_USER) {
    return `BiblioFlow <${env.SMTP_USER}>`;
  }

  // Ultimo ripiego, valido solo su Resend senza dominio verificato: consente
  // di scrivere unicamente all'indirizzo del titolare dell'account Resend.
  return "BiblioFlow <onboarding@resend.dev>";
}

/** True se almeno un backend di invio e' configurato. */
export function mailerConfigurato(): boolean {
  return Boolean(env.RESEND_API_KEY || env.SMTP_HOST);
}

/** Invio tramite l'API HTTP di Resend: nessuna dipendenza npm necessaria. */
async function inviaConResend(messaggio: MessaggioEmail): Promise<EsitoInvio> {
  const risposta = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: mittente(),
      to: [messaggio.to],
      subject: messaggio.subject,
      html: messaggio.html,
      text: messaggio.text,
    }),
  });

  if (!risposta.ok) {
    // Il corpo dell'errore di Resend e' utile in fase di configurazione
    // (dominio non verificato, chiave errata...): lo teniamo nel dettaglio,
    // che finisce nei log del server e non nella risposta al browser.
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
 * Invio tramite SMTP.
 *
 * `nodemailer` viene importato in modo DINAMICO: se il progetto viene
 * distribuito usando solo Resend, la libreria non serve e non deve essere
 * caricata (ne' far fallire il bundle se non e' installata).
 */
async function inviaConSmtp(messaggio: MessaggioEmail): Promise<EsitoInvio> {
  const nodemailer = (await import("nodemailer")).default;

  const trasporto = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT ?? 587,
    // La porta 465 e' TLS implicito; 587 usa STARTTLS (secure: false).
    secure: (env.SMTP_PORT ?? 587) === 465,
    auth:
      env.SMTP_USER && env.SMTP_PASSWORD
        ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD }
        : undefined,
  });

  await trasporto.sendMail({
    from: mittente(),
    to: messaggio.to,
    subject: messaggio.subject,
    text: messaggio.text,
    html: messaggio.html,
  });

  return { inviata: true, backend: "smtp" };
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
          "imposta RESEND_API_KEY oppure SMTP_HOST/SMTP_USER/SMTP_PASSWORD.",
      );
    }

    return { inviata: false, motivo: "non_configurato" };
  }

  try {
    if (env.RESEND_API_KEY) {
      return await inviaConResend(messaggio);
    }

    return await inviaConSmtp(messaggio);
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
