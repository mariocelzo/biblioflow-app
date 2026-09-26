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
 * PERCHE' UN TERZO PARAMETRO `chiaveUtente` (findings revisione PR #81): la
 * chiave storica del contatore e' `${ip}:${percorso}`. Per una route che
 * limita DOPO aver autenticato il chiamante (`requireUser()` gia' chiamato),
 * usare ancora l'IP condivide la quota fra TUTTI gli utenti dietro lo stesso
 * indirizzo — tipicamente il NAT di un'intera rete universitaria (lo stesso
 * rischio gia' documentato sopra `registrationRateLimiter`). Con un limitatore
 * come `bookingRateLimiter` (10 creazioni/30min), collegato per la prima volta
 * a un endpoint ad altissima concorrenza per-rete come la creazione di una
 * prenotazione, questo significa che pochi studenti sulla stessa rete possono
 * esaurire la quota comune e far scattare 429 su richieste legittime di
 * studenti diversi che non hanno mai chiamato l'API.
 *
 * Passando l'id utente autenticato come `chiaveUtente`, il contatore diventa
 * per-PERSONA invece che per-RETE: la chiave usata e' `chiaveUtente` invece
 * dell'IP. Il parametro e' opzionale e va valorizzato SOLO dopo
 * un'autenticazione riuscita: i limitatori che proteggono le route
 * PRE-autenticazione (login, registrazione, reset password), dove l'utente
 * non esiste ancora, continuano a ricadere sull'IP — l'unico identificativo
 * disponibile in quel momento.
 *
 * @example
 * ```ts
 * const limiter = createRateLimiter({
 *   max: 10,
 *   windowMs: 60 * 1000, // 10 richieste al minuto
 * });
 *
 * export async function POST(request: NextRequest) {
 *   const user = await requireUser();
 *   // Chiave per utente, non per IP: vedi commento sopra.
 *   const rateLimitResult = await limiter(request, "verifica-e-conta", user.id);
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
    // Id dell'utente autenticato: quando presente sostituisce l'IP come
    // identificativo del chiamante (vedi commento su `createRateLimiter`).
    // Da passare SOLO dopo `requireUser()`: prima dell'autenticazione l'unico
    // identificativo disponibile e' l'IP.
    chiaveUtente?: string,
  ): Promise<NextResponse | null> => {
    const identificativo = chiaveUtente ?? getClientIp(request);
    const now = Date.now();

    // Crea una chiave univoca per la route e il chiamante (utente se
    // autenticato, altrimenti IP: vedi `chiaveUtente` sopra).
    const key = `${identificativo}:${request.nextUrl.pathname}`;

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
 * STATO ATTUALE (RI-verificato con grep su tutto `src/`, settembre 2026,
 * insieme al collegamento di `bookingRateLimiter`/`criticalApiRateLimiter`
 * qui sotto): nessuna route lo importa ancora. Le route di sola lettura usano
 * `readApiRateLimiter` (300/min), quelle di scrittura/cancellazione usano
 * `criticalApiRateLimiter` o `staffCriticalApiRateLimiter` qui sotto.
 *
 * Questa riverifica ha anche trovato, con lo stesso grep, alcune route di
 * scrittura ANCORA senza alcun limitatore (`POST /api/prenotazioni/[id]/estendi`,
 * `POST /api/admin/scanner/validate`, `PATCH /api/admin/anomalie`, `POST
 * /api/admin/utenti/[id]/notifica`): NESSUNA di queste è pero' il "futuro
 * endpoint non critico" per cui `apiRateLimiter` è pensato — sono tutte
 * operazioni critiche (estendono una prenotazione, effettuano un check-in,
 * annullano prenotazioni in blocco, notificano un utente), quindi andrebbero
 * semmai su `criticalApiRateLimiter`/`staffCriticalApiRateLimiter`. Collegarle
 * è fuori dal perimetro di questa PR (che si limita a creazione prenotazione e
 * check-in autonomo) ed è tracciato separatamente.
 *
 * Non lo si rimuove perché resta la scelta corretta per un futuro endpoint di
 * scrittura "non critico" (che cioè non cancella né modifica dati sensibili):
 * usarlo direttamente eviterebbe di inventare un quinto limitatore ad hoc. Se
 * in futuro risultasse ancora inutilizzato, andrebbe rimosso davvero: codice
 * morto che "sembra" già collegato è un rischio, non una comodità.
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
 *
 * CHIAVE: PATCH/DELETE `/api/prenotazioni/[id]` e POST/DELETE
 * `/api/prenotazioni/coda` lo invocano ancora con la chiave storica per IP
 * (`limiter(request)`, nessun terzo argomento). Il check-in autonomo (POST
 * `/api/prenotazioni/[id]/check-in`, findings revisione PR #81) lo invoca
 * invece con `user.id` come chiave (vedi `chiaveUtente` su
 * `createRateLimiter`): stesso motivo di `bookingRateLimiter` sopra, un NAT di
 * ateneo condivide un solo IP fra molti studenti. Portare la chiave per utente
 * anche sugli altri call-site di questo limitatore e' un follow-up naturale e
 * a basso rischio (stessa funzione, stessa firma), ma e' fuori dal perimetro
 * della PR che ha introdotto il check-in autonomo: quelle route esistevano
 * gia' prima e non sono quelle in cui e' stato rilevato il problema.
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
 *
 * COLLEGATO A: POST /api/prenotazioni. Era dichiarato ma non collegato a
 * nessuna route: la creazione di una prenotazione non aveva alcun limite,
 * a differenza di check-in/check-out/cancellazione (`criticalApiRateLimiter`)
 * e della lista d'attesa (`criticalApiRateLimiter` anche li').
 *
 * CHIAVE PER UTENTE, NON PER IP (findings revisione PR #81): la route lo
 * invoca passando `user.id` come terzo argomento (vedi `chiaveUtente` su
 * `createRateLimiter` sopra), perche' `requireUser()` e' gia' stato chiamato
 * prima. Con una chiave per IP, un'intera rete universitaria dietro un NAT di
 * ateneo condividerebbe la stessa quota di 10 creazioni/30min: pochi studenti
 * sulla stessa rete l'avrebbero esaurita per tutti gli altri, esattamente la
 * dinamica gia' documentata sopra `registrationRateLimiter`. Per IP restano
 * invece i limitatori PRE-autenticazione (login, registrazione, reset
 * password), dove l'utente non esiste ancora.
 *
 * PERCHÉ 10 OGNI 30 MINUTI E NON DI MENO: un uso legittimo crea al più
 * qualche prenotazione per sessione — anche contando chi sbaglia orario/sala e
 * ricrea subito la richiesta dopo un errore di validazione (422) o un
 * conflitto di disponibilità (409), che qui CONTANO comunque come tentativi
 * (a differenza di `registrationRateLimiter`, questo limitatore non separa
 * "verifica" da "conta": un ripensamento legittimo consuma un tentativo, ma
 * dieci ne restano ampiamente sufficienti anche per diversi errori di fila).
 * Il valore resta invece stretto contro uno script che tenti di intasare i
 * posti disponibili creando prenotazioni a raffica. Ora che la chiave e' per
 * utente (non piu' per rete), la soglia protegge davvero il singolo account e
 * non deve piu' essere alzata per compensare la condivisione di rete.
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
