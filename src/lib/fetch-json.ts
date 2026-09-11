// ============================================================================
// fetch-json.ts - helper condiviso per fetch client-side con controllo .ok
// ============================================================================
// COSA: `fetchJson` esegue una fetch e, a differenza del solito
//       `fetch(...).then(r => r.json())`, verifica sempre `response.ok`
//       PRIMA di provare a leggere il corpo come dati validi. Se la
//       risposta è un errore HTTP (4xx/5xx) o la fetch lancia (rete
//       assente, CORS, ecc.), viene sollevata una `ApiError` con un
//       messaggio leggibile, così un unico `catch` a chiamata basta per
//       gestire ENTRAMBI i casi.
//
// PERCHÉ: l'audit di sicurezza/UX ha rilevato diverse pagine con pattern
//       `if (res.ok) { ... }` senza ramo `else`: su un errore del server la
//       pagina restava con lo stato iniziale (spesso una lista vuota),
//       indistinguibile per l'utente da "non c'è niente". Centralizzare il
//       controllo qui evita che lo stesso bug si ripresenti ogni volta che
//       si aggiunge una fetch, ed è più facile da testare in isolamento.

/** Errore sollevato da fetchJson quando la risposta HTTP non è "ok" (2xx). */
export class ApiError extends Error {
  /** Status HTTP della risposta che ha causato l'errore. */
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/**
 * Esegue `fetch(input, init)` e restituisce il corpo già parsato come JSON.
 * Se `response.ok` è false, lancia una ApiError con il messaggio letto dal
 * campo `error` del corpo (se presente) o un messaggio generico basato sullo
 * status. Le eccezioni di rete (fetch che rifiuta la Promise) si propagano
 * invariate: il chiamante le intercetta con lo stesso `catch`.
 */
export async function fetchJson<T = unknown>(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<T> {
  const response = await fetch(input, init);

  if (!response.ok) {
    // Messaggio di default basato sullo status, sovrascritto se il corpo
    // della risposta contiene un campo `error` leggibile (molte API di
    // BiblioFlow rispondono con { error: "..." } su errore).
    let message = `Richiesta fallita con stato ${response.status}`;
    try {
      const body = await response.json();
      if (body && typeof body.error === "string" && body.error.trim().length > 0) {
        message = body.error;
      }
    } catch {
      // Corpo non JSON o vuoto: manteniamo il messaggio generico.
    }
    throw new ApiError(message, response.status);
  }

  return (await response.json()) as T;
}
