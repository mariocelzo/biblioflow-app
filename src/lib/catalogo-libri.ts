// ============================================================================
// catalogo-libri.ts - helper condivisi per la ricerca nel catalogo libri
// ============================================================================
// COSA: costruisce l'URL di ricerca verso GET /api/libri ed estrae l'elenco
//       libri dalla busta di risposta { success, data, pagination }.
//
// PERCHE': il tab "Catalogo" di src/app/prestiti/page.tsx aveva due difetti
//       verificati:
//        1. mandava `?search=`, ma GET /api/libri (src/app/api/libri/route.ts)
//           legge SOLO il parametro `q`: il filtro di ricerca non veniva mai
//           applicato lato server (tornavano sempre i primi risultati, non
//           filtrati);
//        2. faceva `setLibri(data)` dove `data` e' l'INTERA busta di risposta
//           `{ success, data, pagination }`, assegnata a uno stato tipizzato
//           `Libro[]`: al primo render `libri.map(...)` lanciava un TypeError
//           (un oggetto non e' un array).
//       Le due funzioni sono estratte qui, invece di restare inline nel
//       componente, per poter essere testate senza dover montare un
//       componente React: questo repository esegue i test vitest in ambiente
//       "node" (vedi vitest.config.mts), senza DOM/testing-library.

/** Costruisce l'URL di ricerca per `GET /api/libri` con il parametro CORRETTO (`q`). */
export function urlRicercaLibri(query: string): string {
  return `/api/libri?q=${encodeURIComponent(query)}`;
}

/** Forma minima della busta di risposta di `GET /api/libri` che ci interessa. */
export interface RispostaRicercaLibri {
  success?: unknown;
  data?: unknown;
}

/**
 * Estrae l'array di libri dalla busta `{ success, data, pagination }`.
 * Ritorna SEMPRE un array (mai l'intera busta): un corpo malformato,
 * `success: false` o un `data` che non e' un array producono un array vuoto,
 * mai un TypeError al successivo `.map(...)` lato componente.
 */
export function estraiLibriDaRisposta<T = unknown>(
  corpo: RispostaRicercaLibri | null | undefined,
): T[] {
  if (!corpo || corpo.success !== true || !Array.isArray(corpo.data)) {
    return [];
  }
  return corpo.data as T[];
}

/** Campi del modello Prisma `Libro` che servono a costruire la risposta del catalogo. */
export interface LibroDb {
  anno: number | null;
  scaffale: string | null;
  piano: number | null;
  copieDisponibili: number;
}

/**
 * Aggiunge ai campi del database i nomi che le pagine `/libri` e `/libri/[id]`
 * leggono davvero: `disponibile`, `annoPubblicazione`, `posizione`.
 *
 * PERCHE': le API restituivano il modello Prisma cosi' com'e' (`anno`,
 * `scaffale`, `piano`), mentre le pagine leggono `disponibile`,
 * `annoPubblicazione` e `posizione`, che non esistevano: tutti i libri
 * risultavano "Non disponibile" anche con copie libere, e anno e posizione
 * restavano vuoti. I campi originali restano nella risposta (nessuna
 * regressione per chi li usa).
 */
export function arricchisciLibro<T extends LibroDb>(libro: T) {
  const parti: string[] = [];
  if (libro.piano !== null && libro.piano !== undefined) {
    parti.push(`Piano ${libro.piano}`);
  }
  if (libro.scaffale) parti.push(`Scaffale ${libro.scaffale}`);
  return {
    ...libro,
    disponibile: libro.copieDisponibili > 0,
    annoPubblicazione: libro.anno,
    posizione: parti.length > 0 ? parti.join(" - ") : null,
  };
}
