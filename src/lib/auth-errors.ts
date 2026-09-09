// ============================================================================
// CODICI DI ERRORE DEL LOGIN - BiblioFlow
// ============================================================================
// COSA: l'elenco chiuso dei motivi per cui un login con credenziali puo'
//       fallire, piu' il messaggio in italiano da mostrare all'utente.
//
// PERCHE': Auth.js non lascia passare al browser il messaggio di un `Error`
//       generico lanciato dentro `authorize`. Lo classifica come errore NON
//       "client-safe" e lo appiattisce tutto su `error=Configuration` (vedi
//       `clientErrors` in @auth/core/errors). Risultato: qualunque fallimento
//       — password errata, account disabilitato, email non verificata —
//       arrivava al client identico e indistinguibile, e la pagina di login
//       finiva sempre sul messaggio generico "Errore durante l'accesso".
//       L'unica eccezione ammessa da Auth.js e' `CredentialsSignin`, che
//       trasporta un campo `code` libero: passiamo di li'.
//
// Questo modulo NON importa nulla (in particolare non importa next-auth):
// deve poter essere incluso anche in un componente client senza trascinarsi
// dietro codice server.

/** I motivi di fallimento che il server puo' comunicare al browser. */
export const CODICI_ERRORE_LOGIN = {
  /**
   * Email inesistente OPPURE password errata: volutamente lo stesso codice per
   * entrambi i rami, altrimenti si potrebbe capire se un indirizzo e'
   * registrato (finding A-4, enumerazione degli account).
   */
  CREDENZIALI_NON_VALIDE: "credenziali_non_valide",
  /** Account esistente ma disattivato da un bibliotecario. */
  ACCOUNT_DISABILITATO: "account_disabilitato",
  /** Password corretta, ma l'indirizzo non e' ancora stato verificato (A-5). */
  EMAIL_NON_VERIFICATA: "email_non_verificata",
  /** Troppi tentativi falliti ravvicinati sullo stesso indirizzo (A-4). */
  TROPPI_TENTATIVI: "troppi_tentativi",
  /** Il form e' stato inviato senza email o senza password. */
  CAMPI_MANCANTI: "campi_mancanti",
  /** Utente creato via OAuth: non ha una password con cui accedere. */
  ACCOUNT_NON_CONFIGURATO: "account_non_configurato",
} as const;

export type CodiceErroreLogin =
  (typeof CODICI_ERRORE_LOGIN)[keyof typeof CODICI_ERRORE_LOGIN];

/**
 * Messaggi mostrati all'utente, uno per codice.
 *
 * Nota A-4: "credenziali non valide" resta volutamente vago. Non deve far
 * capire QUALE dei due campi e' sbagliato, altrimenti diventa un oracolo per
 * scoprire quali email sono registrate.
 */
const MESSAGGI: Record<CodiceErroreLogin, string> = {
  [CODICI_ERRORE_LOGIN.CREDENZIALI_NON_VALIDE]:
    "Email o password non corretti. Riprova.",
  [CODICI_ERRORE_LOGIN.ACCOUNT_DISABILITATO]:
    "Il tuo account è stato disabilitato. Contatta la biblioteca per assistenza.",
  [CODICI_ERRORE_LOGIN.EMAIL_NON_VERIFICATA]:
    "Devi verificare la tua email prima di accedere. Controlla la posta in arrivo: se non trovi il messaggio puoi richiederne un altro.",
  [CODICI_ERRORE_LOGIN.TROPPI_TENTATIVI]:
    "Troppi tentativi di accesso. Attendi qualche minuto e riprova.",
  [CODICI_ERRORE_LOGIN.CAMPI_MANCANTI]:
    "Inserisci email e password per accedere.",
  [CODICI_ERRORE_LOGIN.ACCOUNT_NON_CONFIGURATO]:
    "Questo account non ha una password: accedi con Google oppure reimposta la password.",
};

/** True se `codice` e' uno dei codici noti (type guard per input dal browser). */
export function isCodiceErroreLogin(
  codice: unknown,
): codice is CodiceErroreLogin {
  return (
    typeof codice === "string" &&
    Object.prototype.hasOwnProperty.call(MESSAGGI, codice)
  );
}

/**
 * Traduce in italiano il codice arrivato dal server.
 *
 * Il valore arriva da una query string, quindi puo' essere qualunque cosa:
 * su un codice sconosciuto (o assente) si ripiega su un messaggio generico
 * invece di mostrare all'utente una stringa tecnica.
 */
export function messaggioErroreLogin(codice: unknown): string {
  if (isCodiceErroreLogin(codice)) {
    return MESSAGGI[codice];
  }

  return "Errore durante l'accesso. Riprova.";
}
