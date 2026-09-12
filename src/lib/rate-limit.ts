import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Rate Limiting Middleware per Next.js App Router
 * 
 * Limita il numero di richieste per IP in una finestra temporale
 * per prevenire spam, brute force attacks e abusi dell'API.
 * 
 * In produzione, considerare Redis per distribuire i limiti
 * tra multiple istanze serverless.
 */

interface RateLimitConfig {
  /**
   * Numero massimo di richieste consentite nella finestra temporale
   */
  max: number;
  
  /**
   * Finestra temporale in millisecondi (default: 1 minuto)
   */
  windowMs: number;
  
  /**
   * Messaggio di errore personalizzato
   */
  message?: string;
}

interface RequestLog {
  count: number;
  resetTime: number;
}

// In-memory store per rate limiting
// ⚠️ TODO(rate-limit-redis): questa Map vive nella memoria del singolo
// processo. Su Vercel/serverless ogni istanza (e ogni cold start) ha la
// PROPRIA Map: due richieste allo stesso limite possono finire su due
// istanze diverse e nessuna delle due vede il conteggio dell'altra. In pratica
// i limiti dichiarati qui sotto (es. "60 al minuto") sono un tetto PER
// ISTANZA, non un tetto globale: con più istanze attive il limite reale
// osservato da un singolo chiamante è più permissivo di quanto documentato.
// Non è un difetto di questa remediation: è un limite noto dell'approccio
// in-memory, da risolvere spostando lo stato su Redis (es. Upstash) quando il
// traffico lo giustificherà. Finché resta così, questi limiti vanno letti
// come "protezione contro l'abuso ovvio", non come garanzia matematica.
const rateLimitStore = new Map<string, RequestLog>();

/**
 * Pulisce le entry scadute ogni 5 minuti
 */
setInterval(() => {
  const now = Date.now();
  for (const [key, log] of rateLimitStore.entries()) {
    if (now > log.resetTime) {
      rateLimitStore.delete(key);
    }
  }
}, 5 * 60 * 1000);

/**
 * Legge un header che deve contenere un indirizzo IP e ne restituisce il primo
 * elemento ripulito, oppure `null` se l'header manca o e' vuoto.
 *
 * PERCHE' IL PRIMO ELEMENTO E NON L'ULTIMO: su Vercel questi header contengono
 * un solo indirizzo, quindi la distinzione non si pone. In una catena di piu'
 * proxy, invece, sapere quale elemento sia attendibile richiede di sapere
 * QUANTI proxy fidati ci sono davanti: un numero che questo codice non conosce.
 * Prendere l'ultimo non sarebbe "piu' sicuro", sarebbe solo un'altra ipotesi
 * non verificata. Manteniamo il primo elemento, coerente con il comportamento
 * storico.
 *
 * PERCHE' SI SCARTA IL VALORE VUOTO: un header presente ma vuoto produrrebbe
 * una chiave "" condivisa da tutti i client, cioe' un limitatore che blocca
 * chiunque non appena una sola persona supera la soglia.
 */
function primoIndirizzo(request: NextRequest, header: string): string | null {
  const valore = request.headers.get(header);
  if (!valore) return null;

  const primo = valore.split(",")[0].trim();
  return primo.length > 0 ? primo : null;
}

/**
 * Ricava l'identificativo del client usato come chiave del rate limiter.
 *
 * PERCHE' L'ORDINE CONTA (ed e' questo): la chiave del limitatore e' cio' che
 * un aggressore deve poter cambiare per azzerare il contatore. Se la si legge
 * da un header che il client puo' scrivere da se', tutte le protezioni che si
 * appoggiano al limitatore diventano decorative — in particolare
 * `passwordResetRateLimiter`, che e' la difesa contro il tentativo a forza
 * bruta dei token di reset password (rilievo M-7).
 *
 * COSA GARANTISCE VERCEL (documentazione ufficiale "Request Headers",
 * https://vercel.com/docs/headers/request-headers, consultata il 2026-09-09):
 *  - `x-forwarded-for` — "The public IP address of the client that made the
 *    request. If you are trying to use Vercel behind a proxy, we currently
 *    overwrite the X-Forwarded-For header and do not forward external IPs.
 *    This restriction is in place to prevent IP spoofing."
 *  - `x-real-ip` — "This header is identical to the x-forwarded-for header."
 *  - `x-vercel-forwarded-for` — "This header is identical to the
 *    x-forwarded-for header. However, x-forwarded-for could be overwritten if
 *    you're using a proxy on top of Vercel."
 *
 * Quindi IN PRODUZIONE l'header che arriva dal client viene sostituito dalla
 * piattaforma e la falsificazione non funziona. L'ordine qui sotto serve a non
 * far dipendere la correttezza da quella garanzia in modo implicito:
 *  1. `x-vercel-forwarded-for` — la documentazione lo indica esplicitamente
 *     come quello che resta valido anche con un proxy davanti a Vercel;
 *  2. `x-real-ip` — impostato dalla piattaforma; e' l'header su cui il
 *     pacchetto ufficiale `@vercel/functions` basa la sua `ipAddress()`;
 *  3. `x-forwarded-for` — ripiego per lo sviluppo locale e per ambienti non
 *     Vercel, dove nessuno dei due precedenti esiste.
 *
 * `cf-connecting-ip` NON e' piu' considerato: l'applicazione e' servita da
 * Vercel, non da Cloudflare, quindi nessuna infrastruttura lo imposta e
 * l'unico che potrebbe scriverlo e' proprio il client da limitare.
 *
 * RIPIEGO "unknown": se nessun header e' disponibile, tutti i chiamanti
 * condividono un unico contatore. E' volutamente la scelta piu' restrittiva:
 * in caso di dubbio si limita di piu', non di meno.
 */
function getClientIp(request: NextRequest): string {
  return (
    primoIndirizzo(request, "x-vercel-forwarded-for") ??
    primoIndirizzo(request, "x-real-ip") ??
    primoIndirizzo(request, "x-forwarded-for") ??
    "unknown"
  );
}

/**
 * Crea un rate limiter configurabile
 * 
 * @example
 * ```ts
 * const limiter = createRateLimiter({
 *   max: 10,
 *   windowMs: 60 * 1000, // 10 richieste al minuto
 * });
 * 
 * export async function POST(request: NextRequest) {
 *   const rateLimitResult = await limiter(request);
 *   if (rateLimitResult) return rateLimitResult;
 *   
 *   // ... resto della logica API
 * }
 * ```
 */
/**
 * Come la richiesta corrente interagisce con il contatore.
 *
 * PERCHE' ESISTE: nella modalita' unica di prima ogni chiamata all'endpoint
 * consumava un tentativo, comprese quelle rifiutate per dati non validi. Tre
 * errori di battitura sulla password bastavano quindi a bloccare la
 * registrazione per un'ora, senza che fosse stato creato alcun account: un
 * limite pensato contro lo spam finiva per punire l'utente distratto.
 *
 * - "verifica-e-conta" (predefinito): comportamento storico, usato da tutti
 *   gli altri limitatori.
 * - "verifica": controlla soltanto. Da usare all'inizio dell'handler.
 * - "conta": incrementa soltanto, senza mai rifiutare. Da chiamare a
 *   operazione riuscita, cosi' il contatore misura le azioni effettive.
 */
export type ModoRateLimit = "verifica-e-conta" | "verifica" | "conta";

export function createRateLimiter(config: RateLimitConfig) {
  const {
    max,
    windowMs,
    message = "Troppi tentativi. Riprova tra qualche istante.",
  } = config;

  return async (
    request: NextRequest,
    modo: ModoRateLimit = "verifica-e-conta",
  ): Promise<NextResponse | null> => {
    const ip = getClientIp(request);
    const now = Date.now();

    // Crea una chiave univoca per la route e l'IP
    const key = `${ip}:${request.nextUrl.pathname}`;

    let log = rateLimitStore.get(key);

    if (!log || now > log.resetTime) {
      // Nuova finestra temporale. In sola verifica non si apre nulla: il
      // conteggio parte quando l'operazione va davvero a buon fine.
      if (modo === "verifica") {
        return null;
      }

      log = {
        count: 1,
        resetTime: now + windowMs,
      };
      rateLimitStore.set(key, log);
      return null; // Richiesta consentita
    }

    // Incremento puro: non rifiuta mai, serve solo a registrare l'operazione
    // appena completata.
    if (modo === "conta") {
      log.count++;
      rateLimitStore.set(key, log);
      return null;
    }

    if (log.count >= max) {
      // Limite superato
      const retryAfter = Math.ceil((log.resetTime - now) / 1000);
      
      return NextResponse.json(
        {
          error: message,
          retryAfter: `${retryAfter} secondi`,
        },
        {
          status: 429,
          headers: {
            "Retry-After": retryAfter.toString(),
            "X-RateLimit-Limit": max.toString(),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": new Date(log.resetTime).toISOString(),
          },
        }
      );
    }
    
    // Sotto il limite. In sola verifica il contatore non si tocca.
    if (modo === "verifica") {
      return null;
    }

    // Incrementa il contatore
    log.count++;
    rateLimitStore.set(key, log);

    return null; // Richiesta consentita
  };
}

/**
 * Rate limiter predefiniti per diverse use-case
 */

/**
 * Rate limiter STRICT per login (previene brute force)
 * 5 tentativi ogni 15 minuti
 */
export const loginRateLimiter = createRateLimiter({
  max: 5,
  windowMs: 15 * 60 * 1000,
  message: "Troppi tentativi di login. Riprova tra 15 minuti.",
});

/**
 * Rate limiter per la registrazione (previene spam)
 * 20 account creati ogni ora, per indirizzo IP.
 *
 * PERCHE' 20 E NON 3: il limite precedente era troppo stretto per l'uso reale.
 * La chiave del contatore e' l'indirizzo IP PUBBLICO, e un'intera aula
 * universitaria esce da un solo IP attraverso il NAT di ateneo: con 3
 * all'ora bastavano tre iscrizioni per bloccare tutti gli altri, per esempio
 * durante una dimostrazione del progetto. Venti resta un tetto efficace
 * contro la creazione automatizzata di account e non ostacola l'uso legittimo.
 *
 * Da leggere insieme al modo "conta": il contatore ora misura gli account
 * effettivamente creati, non i tentativi rifiutati per dati non validi.
 */
export const registrationRateLimiter = createRateLimiter({
  max: 20,
  windowMs: 60 * 60 * 1000,
  message:
    "Sono state create troppe registrazioni da questa rete nell'ultima ora. Riprova più tardi.",
});

/**
 * Rate limiter MEDIO per reset password (previene enumerazione email)
 * 3 richieste ogni 15 minuti
 */
export const passwordResetRateLimiter = createRateLimiter({
  max: 3,
  windowMs: 15 * 60 * 1000,
  message: "Troppi tentativi. Riprova tra 15 minuti.",
});

/**
 * Rate limiter STANDARD per API generiche
 * 100 richieste al minuto
 *
 * STATO ATTUALE (verificato con grep su tutto `src/`, settembre 2026): nessuna
 * route lo importa. Le route di sola lettura usano `readApiRateLimiter`
 * (300/min), quelle di scrittura/cancellazione usano `criticalApiRateLimiter`
 * o `staffCriticalApiRateLimiter` qui sotto. Non lo si rimuove perché resta
 * la scelta corretta per un futuro endpoint di scrittura "non critico" (che
 * cioè non cancella né modifica dati sensibili): usarlo direttamente eviterebbe
 * di inventare un quarto limitatore ad hoc. Se in futuro risultasse ancora
 * inutilizzato, andrebbe rimosso davvero: codice morto che "sembra" già
 * collegato è un rischio, non una comodità.
 */
export const apiRateLimiter = createRateLimiter({
  max: 100,
  windowMs: 60 * 1000,
  message: "Limite richieste superato. Riprova tra qualche istante.",
});

/**
 * Rate limiter PERMISSIVO per letture (GET)
 * 300 richieste al minuto
 */
export const readApiRateLimiter = createRateLimiter({
  max: 300,
  windowMs: 60 * 1000,
  message: "Troppe richieste. Rallenta.",
});

/**
 * Rate limiter STRICT per operazioni critiche di un utente (cancellazioni,
 * modifiche su risorse proprie: prenotazioni, lista d'attesa).
 * 10 richieste al minuto.
 *
 * COLLEGATO A: PATCH/DELETE `/api/prenotazioni/[id]`, POST/DELETE
 * `/api/prenotazioni/coda`. In precedenza era dichiarato ma non collegato a
 * nessuna route: uno studente poteva cancellare/modificare senza alcun limite.
 *
 * PERCHÉ 10 VA BENE QUI E NON PER LO STAFF: un utente normale interagisce con
 * queste operazioni una alla volta (annulla la propria prenotazione, esce
 * dalla coda). Dieci al minuto è già abbondante per l'uso legittimo e resta
 * stretto contro uno script che tenti di intasare la coda o annullare a
 * ripetizione. Per il personale che lavora "a raffica" sul pannello admin
 * (es. venti check-in di fila) questa soglia sarebbe invece troppo bassa: per
 * quel caso c'è `staffCriticalApiRateLimiter` qui sotto, non questo.
 */
export const criticalApiRateLimiter = createRateLimiter({
  max: 10,
  windowMs: 60 * 1000,
  message: "Limite operazioni critiche superato.",
});

/**
 * Rate limiter STRICT per operazioni critiche dello STAFF (ADMIN/BIBLIOTECARIO)
 * sul pannello di amministrazione: cambi di stato posti, evasione richieste,
 * cancellazioni/modifiche prenotazioni, gestione prestiti, attivazione utenti.
 * 60 richieste al minuto.
 *
 * PERCHÉ UN LIMITATORE DEDICATO E NON `criticalApiRateLimiter`: un
 * bibliotecario che valida una coda di prenotazioni al banco, o smista un
 * lotto di richieste di preparazione, compie legittimamente molte più di 10
 * operazioni al minuto — pensare a venti check-in o venti solleciti di fila.
 * Con la soglia da 10/min pensata per un utente singolo, il primo turno di
 * lavoro reale avrebbe fatto scattare un 429 sul proprio account, cioè
 * l'esatto scenario che questa remediation deve evitare di introdurre.
 *
 * PERCHÉ 60 E NON DI PIÙ: resta comunque un limite "critico", non generico.
 * Sessanta al minuto (uno al secondo in media) copre con ampio margine anche
 * una sessione di lavoro intensa, ma continua a proteggere da uno script che
 * usi le credenziali di un account BIBLIOTECARIO/ADMIN compromesso per
 * automatizzare cancellazioni o modifiche di massa.
 *
 * COLLEGATO A: PATCH `/api/admin/posti/[id]`, PATCH `/api/admin/richieste`,
 * POST `/api/admin/prenotazioni`, POST `/api/admin/prestiti`, PATCH
 * `/api/admin/utenti/[id]`.
 */
export const staffCriticalApiRateLimiter = createRateLimiter({
  max: 60,
  windowMs: 60 * 1000,
  message: "Limite operazioni critiche superato.",
});

/**
 * Rate limiter per creazione prenotazioni
 * 10 prenotazioni ogni 30 minuti
 */
export const bookingRateLimiter = createRateLimiter({
  max: 10,
  windowMs: 30 * 60 * 1000,
  message: "Limite prenotazioni superato. Riprova tra 30 minuti.",
});

/**
 * Rate limiter per richieste prestiti
 * 5 richieste prestito al giorno (simulato con 24h)
 */
export const loanRequestRateLimiter = createRateLimiter({
  max: 5,
  windowMs: 24 * 60 * 60 * 1000,
  message: "Limite giornaliero richieste prestito raggiunto.",
});
