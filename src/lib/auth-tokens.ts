// ============================================
// TOKEN DI AUTENTICAZIONE - BiblioFlow
// ============================================
// Utility condivise per generare e "digerire" i token monouso salvati nella
// tabella `AuthToken` (reset password con `type: "RESET"`, verifica email con
// `type: "VERIF"`).
//
// PERCHE' ESISTE QUESTO MODULO (finding di sicurezza C-2)
//
// 1. I token erano generati con `Math.random().toString(36).slice(2, 22)`.
//    `Math.random()` NON e' un generatore crittografico: la sua sequenza e'
//    ricostruibile osservando pochi output, quindi un attaccante poteva
//    predire il token di reset di un altro utente e impossessarsi del suo
//    account. In piu' `slice(2, 22)` produceva al massimo ~20 caratteri
//    base36 (~103 bit teorici, molti meno in pratica vista la predicibilita').
//
// 2. Il token veniva salvato IN CHIARO nel database. Chiunque riuscisse a
//    leggere la tabella (dump, backup non cifrato, SQL injection, accesso di
//    un operatore) poteva riusare i token ancora validi per reimpostare le
//    password altrui.
//
// COSA FACCIAMO: separiamo il token "raw" (casuale, 256 bit, consegnato solo
// all'utente nel link) dal valore persistito, che e' il suo digest SHA-256.
// Il digest e' deterministico, quindi la verifica resta una semplice lookup
// per uguaglianza (`where: { token: hashToken(rawRicevuto) }`) e non serve
// modificare lo schema Prisma: `AuthToken.token` e' `String @unique` e un
// digest SHA-256 in esadecimale occupa 64 caratteri.
// Dal contenuto del database, invece, non si puo' risalire al token originale
// (SHA-256 e' unidirezionale e l'input ha 256 bit di entropia, quindi non e'
// attaccabile ne' per inversione ne' per forza bruta / rainbow table).

import crypto from "crypto";

/**
 * Genera un token monouso casuale da consegnare all'utente (link di reset o
 * di verifica email).
 *
 * 32 byte da `crypto.randomBytes` = 256 bit di entropia da un CSPRNG:
 * imprevedibile anche conoscendo tutti i token generati in precedenza.
 * L'output esadecimale (64 caratteri) e' sicuro da mettere in una query
 * string senza ulteriore encoding.
 */
export function generateRawToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Calcola il digest SHA-256 (esadecimale, 64 caratteri) del token ricevuto.
 *
 * E' il valore che finisce nella colonna `AuthToken.token`. Essendo
 * deterministico, la verifica di un token consiste nel ricalcolare il digest
 * di quanto arriva dall'utente e cercarlo nel database.
 *
 * Nota: qui NON serve un KDF lento (bcrypt/argon2) come per le password: il
 * token non e' scelto da un umano ma ha 256 bit di entropia casuale, quindi
 * non e' indovinabile per forza bruta e un hash veloce e' sufficiente.
 */
export function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}
