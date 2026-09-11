// ============================================
// MIDDLEWARE AUTENTICAZIONE - BiblioFlow
// ============================================
// Middleware leggero compatibile con Edge Runtime
// Non importa moduli Node.js per funzionare su Edge
//
// ⚠️ LIMITE NOTO E DELIBERATO — LEGGERE PRIMA DI AGGIUNGERE UNA ROTTA ⚠️
//
// COSA FA DAVVERO QUESTO MIDDLEWARE: verifica che nella richiesta ESISTA un
// cookie di sessione. Nient'altro. NON ne verifica la firma, NON lo decifra,
// NON ne legge l'utente, NON ne controlla la scadenza e NON conosce i ruoli.
// Una riga come `document.cookie = "authjs.session-token=x"` nella console del
// browser — o un banale `curl -H 'Cookie: authjs.session-token=x'` — supera
// questo controllo su QUALSIASI percorso.
//
// QUINDI: questo middleware NON e' un livello di autenticazione. E' solo una
// scorciatoia di comodita' che evita di far arrivare al server le richieste
// palesemente anonime (e che manda l'utente alla pagina di login invece di
// mostrargli un errore). L'AUTENTICAZIONE VERA avviene, e deve continuare ad
// avvenire, dentro ogni singolo route handler tramite `auth()` /
// `requireUser()` da `@/lib/auth`, che leggono e verificano il JWT lato Node.
//
// SE STAI AGGIUNGENDO UNA NUOVA ROTTA `/api/...`: chiama `auth()` o
// `requireUser()` al suo interno. Non dare per scontato che il middleware
// abbia gia' stabilito CHI e' il chiamante, perche' non lo ha fatto.
// Il test `tests/unit/middleware-autenticazione.test.ts` verifica in modo
// automatico che ogni nuova rotta non pubblica si autentichi da sola: se hai
// scordato il controllo, quel test fallisce e ti dice dove.
//
// PERCHE' NON SI VERIFICA IL TOKEN QUI (vincoli reali, non pigrizia):
//  1. Il middleware gira su Edge Runtime. `src/lib/auth.ts` importa Prisma e
//     bcrypt, che su Edge non funzionano: importare `auth()` qui romperebbe
//     l'intera applicazione al primo deploy.
//  2. La soluzione pulita di Auth.js v5 e' separare la configurazione in due
//     file (`auth.config.ts` senza adapter/provider Node, usato dal middleware
//     + `auth.ts` completo, usato dal server). E' una ristrutturazione di
//     `src/lib/auth.ts`, che va pianificata a parte.
//  3. Una scorciatoia — decifrare il JWT qui con `getToken` di
//     `next-auth/jwt` — duplicherebbe fuori da Auth.js le assunzioni su nome
//     del cookie, segreto e formato del token: due fonti di verita' che
//     possono divergere in silenzio a ogni modifica di `auth.ts`. Per una
//     difesa di sicurezza e' un rischio peggiore del problema che risolve.
//
// Finche' il punto 2 non viene affrontato, la garanzia del sistema e' quella
// scritta sopra: la sicurezza sta nei route handler, non qui.

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

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

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Verifica se è una route pubblica
  const isPublicRoute = publicRoutes.some(
    (route) => pathname === route || pathname.startsWith(route + "/")
  );
  
  // Verifica se è un'API pubblica
  const isPublicApi = publicApiPrefixes.some(
    (prefix) => pathname.startsWith(prefix)
  );

  // Se la route è pubblica, permetti accesso
  if (isPublicRoute || isPublicApi) {
    return NextResponse.next();
  }

  // Verifica la sola PRESENZA del session token di NextAuth.
  // Il nome del cookie dipende dal setting NEXTAUTH_URL (secure in prod).
  //
  // ⚠️ Il valore non viene mai controllato: qualunque stringa passa. Vedi il
  // blocco in cima al file — chi legge questa riga sta guardando il punto
  // esatto in cui il middleware SMETTE di fare sicurezza e la delega ai route
  // handler.
  const sessionToken =
    request.cookies.get("authjs.session-token")?.value ||
    request.cookies.get("__Secure-authjs.session-token")?.value;

  // Se non c'è il token di sessione
  if (!sessionToken) {
    // Per le API, ritorna 401
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { success: false, error: "Non autenticato" },
        { status: 401 }
      );
    }
    
    // Per le pagine, redirect al login con callback URL
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Token presente, permetti accesso
  // La verifica completa del token e dei ruoli avviene nelle API routes
  return NextResponse.next();
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
