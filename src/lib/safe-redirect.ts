// ============================================================================
// safe-redirect.ts - guardia anti open-redirect per destinazioni di navigazione
// ============================================================================
// COSA: espone isSafeInternalPath(), unico punto di verita' per decidere se una
//       stringa puo' essere usata come destinazione di navigazione interna
//       (router.push lato client, campo `actionUrl` delle notifiche lato API).
//
// PERCHE': i valori di `actionUrl` provengono da input non fidato (body delle
//       richieste verso POST /api/notifiche e POST /api/admin/utenti/[id]/notifica).
//       Senza validazione un attaccante potrebbe persistere un actionUrl come
//       "https://phishing.example" oppure "javascript:alert(1)" e trasformare la
//       pagina notifiche in un vettore di open-redirect / esecuzione di script al
//       click dell'utente. Accettiamo quindi SOLO path assoluti interni
//       ("/qualcosa"), rifiutando tutto cio' che possa puntare fuori dall'app o
//       introdurre uno schema.

/**
 * Ritorna true solo per un percorso interno assoluto ritenuto sicuro.
 *
 * Regole (devono valere tutte):
 *  - deve essere una stringa (null / undefined / oggetti non sono destinazioni);
 *  - deve iniziare con "/" (path assoluto interno);
 *  - NON deve iniziare con "//" (URL protocol-relative: "//evil.com" viene
 *    interpretato dal browser come host esterno);
 *  - NON deve contenere ":" (blocca qualsiasi schema - "javascript:", "data:",
 *    "http:" - e gli URL assoluti che il browser risolverebbe verso altro host);
 *  - NON deve contenere "\" (i browser normalizzano "\" in "/", quindi
 *    "/\evil.com" o "/a\b" potrebbero aggirare i controlli precedenti).
 */
export function isSafeInternalPath(url: unknown): boolean {
  // Solo stringhe: qualunque altro tipo non e' una destinazione valida.
  if (typeof url !== "string") {
    return false;
  }

  // Deve essere un path assoluto interno.
  if (!url.startsWith("/")) {
    return false;
  }

  // "//..." e' un URL protocol-relative -> punta a un host esterno.
  if (url.startsWith("//")) {
    return false;
  }

  // La presenza di ":" segnala uno schema ("javascript:", "http:", ...).
  if (url.includes(":")) {
    return false;
  }

  // "\" viene normalizzato in "/" dai browser: possibile bypass dei controlli.
  if (url.includes("\\")) {
    return false;
  }

  return true;
}
