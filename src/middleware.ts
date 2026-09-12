// ============================================
// MIDDLEWARE AUTENTICAZIONE - BiblioFlow
// ============================================
// Middleware compatibile con Edge Runtime: NON importa moduli Node.js.
//
// COSA FA DAVVERO QUESTO MIDDLEWARE (stato attuale)
// -------------------------------------------------
// Verifica l'autenticazione SUL SERIO: decifra il JWT contenuto nel cookie di
// sessione con la stessa chiave che lo ha emesso e ne controlla firma,
// scadenza e contenuto. Un cookie inventato — `document.cookie =
// "authjs.session-token=x"` nella console del browser, o un
// `curl -H 'Cookie: authjs.session-token=x'` — NON passa piu': viene respinto
// e il cookie fasullo viene anche ripulito dalla risposta.
//
// COM'ERA PRIMA, E PERCHE' E' CAMBIATO
// ------------------------------------
// Fino a questo intervento il middleware controllava soltanto che il cookie
// ESISTESSE. Non ne verificava la firma, non lo decifrava, non ne leggeva
// l'utente, non ne controllava la scadenza. Riprodotto in produzione:
//
//     curl -H "Cookie: authjs.session-token=x" https://.../api/sale
//     → HTTP 200 + dati reali
//
// Non era pigrizia: il middleware gira su Edge Runtime e `src/lib/auth.ts`
// importa Prisma e bcrypt, che su Edge non funzionano; importare `auth()` da
// li' avrebbe rotto l'applicazione al primo deploy. La soluzione ufficiale di
// Auth.js v5 e' spezzare la configurazione in due file, ed e' esattamente
// quello che e' stato fatto: `src/lib/auth.config.ts` contiene la parte
// edge-safe, da cui qui si istanzia un `auth()` che sa verificare il token
// senza toccare il database.
//
// COSA RESTA VALIDO PER CHI AGGIUNGE UNA ROTTA
// --------------------------------------------
// Il middleware ora e' un livello di autenticazione vero, ma NON deve restare
// l'unico: e' una difesa in profondita'. Continua a valere la regola —
// ogni rotta `/api/...` non pubblica chiama `auth()` o `requireUser()` al
// proprio interno. Motivi concreti:
//  - il `matcher` e' una regex, e una regex sbagliata (e' gia' successo:
//    finding M-5) puo' escludere una rotta dal middleware senza che nessuno
//    se ne accorga;
//  - il middleware sa solo SE c'e' una sessione valida, non decide su ruoli
//    e proprieta' delle risorse: quello e' compito di `requireRole` /
//    `assertOwnership`;
//  - una rotta invocata internamente o da un altro runtime non passa di qui.
// Il test `tests/unit/middleware-autenticazione.test.ts` verifica in modo
// automatico che ogni rotta non pubblica si autentichi da sola: se hai
// scordato il controllo, quel test fallisce e ti dice dove.

import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import type { NextFetchEvent, NextRequest } from "next/server";

import { authConfig } from "@/lib/auth.config";

// `auth()` costruito SOLO sulla configurazione edge-safe: nessun Prisma,
// nessun bcrypt, nessun `@/lib/env` nella catena degli import.
// Il cancello vero e' il callback `authorized` dichiarato in `auth.config.ts`,
// che Auth.js invoca dopo aver decifrato e verificato il token.
const { auth } = NextAuth(authConfig);

/**
 * Firma di `auth()` quando lo si usa come middleware.
 *
 * PERCHE' UN CAST: `auth()` e' dichiarato con piu' firme sovrapposte (server
 * component, route handler, pagine API, `getServerSideProps`) e nessuna di
 * esse descrive l'uso "da middleware" — che pure e' quello documentato da
 * Auth.js, dove l'esempio ufficiale e' `export { auth as middleware }` e il
 * controllo di tipo non scatta perche' l'export non viene confrontato con
 * `NextMiddleware`. Qui l'export ha invece una firma nostra, quindi il tipo va
 * dichiarato a mano: lo si fa UNA volta sola e con la spiegazione accanto,
 * invece di disseminare cast nel resto del file.
 *
 * A runtime il comportamento e' quello di Auth.js: decifra il token, invoca il
 * callback `authorized` e, se questo restituisce una `Response` (il nostro
 * rifiuto), la usa; altrimenti lascia proseguire con `NextResponse.next()`.
 */
type GestoreMiddleware = (
  request: NextRequest,
  event: NextFetchEvent,
) => Promise<Response>;

const verificaSessione = auth as unknown as GestoreMiddleware;

// Route pubbliche che non richiedono autenticazione
const publicRoutes = [
  "/",
  "/login",
  "/registrazione",
  "/recupera-password",
  // Deve restare pubblica: ci si arriva cliccando il link ricevuto per email,
  // quando per definizione non si e' ancora autenticati (e non lo si puo'
  // essere, perche' il login richiede proprio questa verifica).
  "/verifica-email",
  // Idem, ed e' il caso piu' stringente di tutti: ci si arriva dal link di
  // recupero password, cioe' proprio quando la password NON si ricorda.
  //
  // PERCHE' MANCAVA E NESSUNO SE N'ERA ACCORTO: finche' l'email di reset non
  // veniva spedita (il mailer non esisteva), a questa pagina non ci arrivava
  // mai nessuno e il difetto restava invisibile. Appena l'invio ha iniziato a
  // funzionare, il link ha smesso di funzionare: il middleware reindirizzava
  // a `/login?callbackUrl=/reset-password`, PERDENDO `userId` e `token` —
  // quindi il link era anche bruciato — e chiedendo di autenticarsi a chi non
  // puo' farlo per definizione. Un vicolo cieco perfetto.
  "/reset-password",
  "/accessibilita",
];

// API pubbliche
const publicApiPrefixes = [
  "/api/auth",
  "/api/health",
  "/api/cron", // Cron jobs protetti da Authorization header
];

/**
 * True se il percorso non richiede una sessione.
 *
 * L'elenco sta QUI, e non dentro `auth.config.ts`, per due ragioni:
 *  1. e' la prima cosa che si cerca quando si aggiunge una pagina, ed e' dove
 *     i test (`pagine-da-email-pubbliche`) vanno a leggerla;
 *  2. serve PRIMA di invocare Auth.js, non dentro (vedi `middleware`).
 */
function isPercorsoPubblico(pathname: string): boolean {
  const isPublicRoute = publicRoutes.some(
    (route) => pathname === route || pathname.startsWith(route + "/")
  );

  const isPublicApi = publicApiPrefixes.some(
    (prefix) => pathname.startsWith(prefix)
  );

  return isPublicRoute || isPublicApi;
}

/**
 * `event` e' opzionale solo per comodita' dei test unitari: Next.js lo passa
 * sempre, e Auth.js si limita a inoltrarlo all'handler senza usarlo.
 */
export async function middleware(
  request: NextRequest,
  event?: NextFetchEvent,
): Promise<Response> {
  const { pathname } = request.nextUrl;

  // Le rotte pubbliche escono da qui SENZA passare da Auth.js.
  //
  // PERCHE' IL CORTOCIRCUITO E' NECESSARIO (non e' solo un'ottimizzazione):
  // `auth()` legge la sessione e, se il token e' valido, riemette il cookie
  // con scadenza aggiornata (rolling session), allegandolo alla risposta. Su
  // `/api/auth/*` questo entrerebbe in conflitto con le risposte di Auth.js
  // stesso: durante il logout il route handler cancella il cookie e il
  // middleware, che aveva letto la sessione un istante prima, ne rimetterebbe
  // uno valido — rischiando di resuscitare la sessione appena chiusa.
  // Il risparmio di una decifratura per ogni asset e ogni pagina pubblica e'
  // un effetto collaterale gradito.
  if (isPercorsoPubblico(pathname)) {
    return NextResponse.next();
  }

  return verificaSessione(request, event as NextFetchEvent);
}

// Configura quali path devono passare attraverso il middleware
export const config = {
  matcher: [
    // BIB-51 / CA-01: la rotta della lista d'attesa resta dichiarata in modo
    // esplicito, oltre al matcher generale, per evitare regressioni quando
    // quest'ultimo verrà ristretto o migrato al nuovo proxy di Next.js.
    "/api/prenotazioni/coda/:path*",
    /*
     * Match di tutti i request path ECCETTO:
     * - _next/static  (bundle e asset statici di Next.js)
     * - _next/image   (ottimizzazione immagini)
     * - favicon.ico   (icona)
     * - file statici serviti da /public riconosciuti per estensione
     *   (immagini, css, js, ...) MA SOLO se il path NON inizia con "api/".
     *
     * Hardening M-5 (audit sicurezza 2026-09-04): la vecchia esclusione
     * `.*\.(svg|png|...|css|js)$` era ancorata alla FINE del path, quindi una
     * rotta API con un suffisso a estensione statica — es. `/api/libri/x.js`
     * o `/api/prenotazioni/<id>.css` (il segmento dinamico accetta qualsiasi
     * stringa) — NON passava dal middleware e ne aggirava il controllo di
     * sessione. Il lookahead `(?!api/)` limita l'esclusione ai soli path
     * pubblici: qualunque cosa sotto `/api/` attraversa sempre il middleware.
     */
    "/((?!_next/static|_next/image|favicon.ico|(?!api/).*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js)$).*)",
  ],
};
