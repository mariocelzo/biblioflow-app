// ============================================================================
// CONFIGURAZIONE AUTH.JS CONDIVISA E "EDGE-SAFE" - BiblioFlow
// ============================================================================
//
// COSA E': la parte di configurazione di Auth.js che puo' girare OVUNQUE —
// sia nel runtime Node.js (route handler, server component) sia nell'Edge
// Runtime in cui Next.js esegue `src/middleware.ts`.
//
// PERCHE' ESISTE (ed e' il punto centrale di questo intervento):
// il middleware si limitava a verificare che ESISTESSE un cookie di sessione,
// senza mai controllarne firma, scadenza o contenuto. Bastava un
//     curl -H 'Cookie: authjs.session-token=x' https://.../api/sale
// per ottenere 200 e dati reali. La verifica vera non si poteva fare nel
// middleware perche' `src/lib/auth.ts` importa Prisma e bcrypt — moduli Node
// che su Edge non esistono — e importare `auth()` da li' avrebbe fatto
// fallire il deploy, non i test.
//
// La soluzione ufficiale di Auth.js v5 e' esattamente questo file: si spezza
// la configurazione in due.
//   - `auth.config.ts` (questo file): tutto cio' che NON richiede Node.
//     Il middleware ne istanzia un proprio `auth()`, che decifra e verifica
//     davvero il JWT usando la stessa chiave e lo stesso formato del server.
//   - `auth.ts`: importa questo file e vi aggiunge cio' che richiede Node —
//     il provider Credentials (bcrypt + Prisma), il callback `signIn` e il
//     callback `jwt` che rilegge l'utente dal database.
//
// ⚠️ REGOLA DA NON VIOLARE ⚠️
// In questo file NON si importa — ne' direttamente ne' di rimbalzo —
// `@/lib/prisma`, `bcryptjs`, `@/lib/env`, `@/lib/mailer` o qualunque altro
// modulo che usi API di Node (`fs`, `crypto` di Node, `process.exit`, ...).
// `@/lib/env` in particolare chiama `process.exit(1)`, che su Edge non
// esiste: basterebbe quello a rompere il middleware in produzione.
// Gli unici import ammessi sono quelli qui sotto: tipi (cancellati in
// compilazione), `next/server` e i provider dichiarativi di Auth.js.
// Il test `tests/unit/auth-config-edge-safe.test.ts` verifica la regola in
// automatico, cosi' non dipende dalla buona memoria di chi tocchera' il file.

import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import { NextResponse } from "next/server";
// `import type` viene CANCELLATO dal compilatore: non produce alcun require di
// @prisma/client a runtime, quindi resta compatibile con l'Edge Runtime.
// (Se un giorno servisse il valore e non il tipo, andrebbe ridefinito qui.)
import type { UserRole } from "@prisma/client";

// ============================================
// ESTENSIONI DI TIPO
// ============================================
// Vivono qui e non piu' in `auth.ts` perche' il callback `session` — che usa
// questi campi — e' ora condiviso. Essendo augmentation di modulo, valgono
// comunque per tutto il progetto.

declare module "next-auth" {
  interface User {
    id: string;
    email: string;
    nome: string;
    cognome: string;
    ruolo: UserRole;
    matricola?: string | null;
    isPendolare: boolean;
    necessitaAccessibilita: boolean;
  }

  interface Session {
    user: {
      id: string;
      email: string;
      nome: string;
      cognome: string;
      ruolo: UserRole;
      matricola?: string | null;
      isPendolare: boolean;
      necessitaAccessibilita: boolean;
    };
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    id: string;
    nome: string;
    cognome: string;
    ruolo: UserRole;
    matricola?: string | null;
    isPendolare: boolean;
    necessitaAccessibilita: boolean;
    /**
     * Epoch ms dell'ultima volta che il callback `jwt` ha riletto lo stato
     * dell'utente dal database (rilievo di sicurezza R-2, vedi `auth.ts`).
     */
    ultimaVerifica?: number;
  }
}

/**
 * Corpo della risposta negata per una chiamata API.
 *
 * Resta identico a quello che il middleware produceva prima (`{ success:
 * false, error: "Non autenticato" }`): i client esistenti e i test di baseline
 * lo riconoscono, e cambiarlo sarebbe una rottura di contratto gratuita.
 */
export const CORPO_NON_AUTENTICATO = {
  success: false,
  error: "Non autenticato",
} as const;

export const authConfig = {
  providers: [
    // Google OAuth: e' pura configurazione dichiarativa (URL, scope, chiavi),
    // nessuna logica che tocchi il database, quindi puo' stare nella parte
    // condivisa. Il provider Credentials NO: il suo `authorize` usa bcrypt e
    // Prisma e resta in `auth.ts`.
    //
    // PERCHE' `process.env` E NON `@/lib/env`: quest'ultimo valida le
    // variabili con Zod e, in caso di errore, chiama `process.exit(1)` — una
    // API Node che su Edge non esiste. La validazione di GOOGLE_CLIENT_ID /
    // GOOGLE_CLIENT_SECRET continua comunque ad avvenire in `@/lib/env`, che
    // e' importato dalle rotte Node (registrazione, recupero password, cron).
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      authorization: {
        params: {
          // NOTA su `hd` (hosted domain): il parametro accetta UN SOLO dominio,
          // mentre l'ateneo usa piu' domini Workspace distinti
          // (studenti.unisa.it, biblioteca.unisa.it, unisa.it). Impostare
          // `hd: "unisa.it"` bloccherebbe quindi gli studenti.
          // In ogni caso `hd` e' solo un suggerimento lato client: viaggia
          // nella URL di autorizzazione e un attaccante puo' rimuoverlo, per
          // cui il filtro che conta e' quello server-side nel callback
          // `signIn` (vedi DOMINI_GOOGLE_AMMESSI / isDominioIstituzionale in
          // `auth.ts`).
          prompt: "consent",
          access_type: "offline",
          response_type: "code",
        },
      },
    }),
  ],

  pages: {
    signIn: "/login",
    error: "/login",
  },

  session: {
    // La strategia JWT e' cio' che rende possibile tutto questo: la sessione
    // vive dentro un token cifrato nel cookie, quindi il middleware puo'
    // verificarla senza toccare il database (che su Edge non potrebbe
    // raggiungere).
    strategy: "jwt",
    maxAge: 24 * 60 * 60, // 24 ore
  },

  // PERCHE' ESPLICITO E NON LASCIATO AL DEFAULT:
  // Auth.js calcola `trustHost` da `AUTH_URL ?? AUTH_TRUST_HOST ?? VERCEL ??
  // NODE_ENV !== "production"`. In produzione su Vercel il valore era gia'
  // `true` (la variabile di sistema VERCEL e' definita), quindi qui NON si
  // cambia nulla rispetto a prima. Lo si fissa perche' ora da questo flag
  // dipende anche il middleware: se nell'Edge Runtime quella variabile non
  // fosse visibile, Auth.js risponderebbe `UntrustedHost`, la sessione
  // risulterebbe assente PER TUTTI e l'applicazione si chiuderebbe in faccia
  // a ogni utente. Un fallimento "fail-closed" totale e silenzioso e' il
  // rischio peggiore di questa modifica: lo togliamo di mezzo.
  // Non indebolisce nulla: essendo NEXTAUTH_URL sempre configurata (e
  // obbligatoria in `@/lib/env`), Auth.js costruisce le proprie URL da quella
  // e non dall'header Host della richiesta.
  trustHost: true,

  // ============================================
  // LOGGER: un cookie non decifrabile non e' un guasto
  // ============================================
  // PERCHE': da quando il middleware verifica davvero il token, OGNI richiesta
  // con un cookie di sessione scaduto, troncato o inventato fa scattare in
  // Auth.js un `JWTSessionError` registrato a livello `error`, con tanto di
  // stack trace di `jose`. E' il meccanismo che FUNZIONA — il token fasullo
  // non viene decifrato, la richiesta viene respinta — ma a livello `error`
  // riempirebbe i log di Vercel di falsi allarmi: basta un utente che torna
  // sul sito il giorno dopo, con la sessione scaduta, per generarne uno a ogni
  // richiesta. Sommerge i guasti veri, che e' esattamente il motivo per cui
  // esistono i livelli di log.
  //
  // Viene quindi declassato a `warn` e ridotto a una riga: resta visibile
  // (serve a diagnosticare un segreto ruotato male, che si manifesta proprio
  // cosi' ma su TUTTE le sessioni insieme), senza essere un allarme.
  // Tutti gli altri errori — configurazione, provider, callback — continuano
  // ad andare a `console.error` intatti: declassarli in blocco sarebbe
  // sostituire un problema con uno peggiore.
  logger: {
    error(error: Error) {
      if (error?.name === "JWTSessionError") {
        console.warn(
          "[auth] cookie di sessione non decifrabile (scaduto, troncato o " +
            "contraffatto): richiesta respinta.",
        );
        return;
      }

      console.error(error);
    },
  },

  callbacks: {
    /**
     * Copia nella sessione i campi applicativi che viaggiano nel token.
     *
     * E' condiviso fra Node ed Edge di proposito: cosi' il middleware vede la
     * stessa identita' che vedono i route handler (id, ruolo, ...) e in
     * futuro puo' decidere anche in base al ruolo, senza una seconda
     * definizione che potrebbe divergere in silenzio.
     */
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string;
        session.user.nome = token.nome as string;
        session.user.cognome = token.cognome as string;
        session.user.ruolo = token.ruolo as UserRole;
        session.user.matricola = token.matricola as string | null | undefined;
        session.user.isPendolare = token.isPendolare as boolean;
        session.user.necessitaAccessibilita = token.necessitaAccessibilita as boolean;
      }
      return session;
    },

    /**
     * IL VERO CANCELLO DI AUTENTICAZIONE.
     *
     * Viene invocato da Auth.js DOPO che il JWT del cookie e' stato decifrato
     * e verificato (firma + scadenza): `auth` e' `null` — o privo di `user` —
     * se il token manca, e' scaduto, e' stato manomesso o e' semplicemente
     * inventato. E' esattamente il controllo che prima non esisteva.
     *
     * PERCHE' QUI NON C'E' L'ELENCO DELLE ROTTE PUBBLICHE: le rotte pubbliche
     * vengono intercettate PRIMA, in `src/middleware.ts`, che per quelle non
     * invoca affatto Auth.js (il motivo e' spiegato li'). Questo callback
     * viene quindi raggiunto solo da richieste che devono essere autenticate,
     * e l'elenco delle eccezioni resta scritto in un posto solo.
     *
     * Restituire una `Response` e' previsto da Auth.js e serve a distinguere i
     * due tipi di chiamante, esattamente come faceva il middleware prima:
     *  - un'API risponde 401 in JSON (un redirect HTML dato in pasto a un
     *    `fetch()` sarebbe inutile e confondente);
     *  - una pagina viene rimandata al login conservando la destinazione.
     */
    authorized({ auth, request }) {
      if (auth?.user) {
        return true;
      }

      const { pathname } = request.nextUrl;

      if (pathname.startsWith("/api/")) {
        return NextResponse.json(CORPO_NON_AUTENTICATO, { status: 401 });
      }

      const urlLogin = new URL("/login", request.nextUrl.origin);
      // Si passa il solo pathname (non l'URL assoluto): la pagina di login lo
      // valida con `safeRedirect` e un percorso relativo e' l'unica forma che
      // non puo' portare l'utente fuori dal sito dopo l'accesso.
      urlLogin.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(urlLogin);
    },
  },
} satisfies NextAuthConfig;
