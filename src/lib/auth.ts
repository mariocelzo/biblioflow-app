// ============================================
// AUTH.JS CONFIGURATION (lato Node.js) - BiblioFlow
// ============================================
// Configurazione autenticazione basata sui requisiti HCI:
// - Flessibilità adattiva (supporto pendolari)
// - Inclusività by design (accessibilità)
// - Trasparenza (messaggi chiari)
//
// ⚠️ QUESTO FILE NON PUO' ESSERE IMPORTATO DAL MIDDLEWARE ⚠️
// Importa Prisma e bcrypt, che nell'Edge Runtime non esistono. E' la META'
// "Node" della configurazione: la meta' condivisibile sta in `auth.config.ts`,
// che viene importata qui sotto e a cui questo file aggiunge soltanto cio' che
// richiede davvero il database — il provider Credentials, il callback `signIn`
// di Google e la rivalidazione periodica del token nel callback `jwt`.
// Il middleware istanzia un proprio `auth()` dalla sola `auth.config.ts`.

import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authConfig } from "./auth.config";
import { prisma } from "./prisma";
import { CODICI_ERRORE_LOGIN, type CodiceErroreLogin } from "./auth-errors";
import type { UserRole } from "@prisma/client";

/**
 * Errore di login che arriva davvero fino al browser.
 *
 * PERCHE': Auth.js lascia passare al client solo un piccolo insieme di errori
 * (`clientErrors` in @auth/core/errors). Un `new Error("...")` lanciato dentro
 * `authorize` NON e' in quell'insieme: viene incartato in un
 * `CallbackRouteError` e riportato al browser come `error=Configuration`,
 * perdendo per strada il motivo reale. `CredentialsSignin` invece e' ammesso e
 * trasporta un campo `code` arbitrario, che Auth.js ricopia nella query string
 * della risposta. Passiamo il motivo li' dentro, come codice e non come frase,
 * cosi' il testo mostrato all'utente resta deciso dal client.
 *
 * `message` resta comunque valorizzato: non raggiunge il browser, ma finisce
 * nei log del server ed e' cio' che i test unit asseriscono.
 */
export class ErroreLogin extends CredentialsSignin {
  constructor(
    public readonly codice: CodiceErroreLogin,
    message: string,
  ) {
    super(message);
    // `code` e' il campo che Auth.js serializza verso il client.
    this.code = codice;
  }
}

// NOTA: le estensioni di tipo di NextAuth (`User`, `Session`, `JWT` con i
// campi applicativi di BiblioFlow) sono state spostate in `auth.config.ts`,
// perche' ora anche il callback `session` vive li'. Essendo augmentation di
// modulo restano valide per tutto il progetto, questo file compreso.

// ============================================
// DIFESE LOGIN (finding di sicurezza A-4 / A-5 / M-6)
// ============================================

/**
 * Messaggio UNICO per "utente inesistente" e "password errata".
 *
 * PERCHE': due testi diversi (o due tempi di risposta diversi) trasformano il
 * login in un oracolo che dice quali email sono registrate (user enumeration),
 * informazione utile per phishing mirato e credential stuffing.
 */
const CREDENZIALI_NON_VALIDE = "Credenziali non valide";

/**
 * Hash bcrypt fittizio, sintatticamente valido ($2a$, cost 12, 53 caratteri di
 * salt+digest) ma che non corrisponde a nessuna password.
 *
 * PERCHE': quando l'email non esiste eseguiamo comunque un `bcrypt.compare`
 * contro questo hash e ne ignoriamo il risultato. Senza questo confronto la
 * risposta per un'email sconosciuta tornerebbe immediatamente, mentre per
 * un'email esistente impiegherebbe le decine di millisecondi di bcrypt: la
 * differenza di latenza e' misurabile e rivela gli account registrati.
 */
const DUMMY_PASSWORD_HASH = "$2a$12$" + "x".repeat(53);

/** Messaggio mostrato quando il limite di tentativi di login e' superato. */
const TROPPI_TENTATIVI = "Troppi tentativi. Riprova più tardi.";

// --- Rate limit per email sui tentativi di login (A-4) ---
//
// PERCHE' NON USIAMO `loginRateLimiter` DI @/lib/rate-limit:
// quel limitatore e' per IP e si aspetta una `NextRequest` (legge
// `request.nextUrl.pathname`). In Auth.js v5 il secondo argomento di
// `authorize` e' una `Request` "nuda", senza `nextUrl`: passargliela
// solleverebbe un TypeError. Qui applichiamo quindi un limite per EMAIL, che
// e' anche la difesa piu' pertinente contro il brute force su un singolo
// account (un attaccante puo' cambiare IP, non l'email della vittima).
//
// LIMITE: 5 tentativi FALLITI ogni 15 minuti per indirizzo email. Il contatore
// viene azzerato dopo un login riuscito, cosi' l'utente legittimo che sbaglia
// qualche volta non resta bloccato.
// NOTA: lo store e' in memoria di processo, come il resto di @/lib/rate-limit;
// su piu' istanze serverless il limite va portato su Redis (vedi TODO in
// rate-limit.ts).
const LOGIN_MAX_TENTATIVI_FALLITI = 5;
const LOGIN_FINESTRA_MS = 15 * 60 * 1000;
const tentativiLoginFalliti = new Map<string, { count: number; resetTime: number }>();

/** True se l'email ha superato il numero di tentativi falliti consentiti. */
function loginBloccato(email: string): boolean {
  const log = tentativiLoginFalliti.get(email);

  if (!log) {
    return false;
  }

  // Finestra scaduta: la voce non serve piu'. La pulizia e' "pigra" (qui e non
  // con un setInterval) per non lasciare timer attivi nel processo.
  if (Date.now() > log.resetTime) {
    tentativiLoginFalliti.delete(email);
    return false;
  }

  return log.count >= LOGIN_MAX_TENTATIVI_FALLITI;
}

/** Registra un tentativo fallito per l'email indicata. */
function registraTentativoFallito(email: string): void {
  const now = Date.now();
  const log = tentativiLoginFalliti.get(email);

  if (!log || now > log.resetTime) {
    tentativiLoginFalliti.set(email, { count: 1, resetTime: now + LOGIN_FINESTRA_MS });
    return;
  }

  log.count += 1;
}

/** Azzera il contatore dopo un login riuscito. */
function azzeraTentativi(email: string): void {
  tentativiLoginFalliti.delete(email);
}

/**
 * Domini istituzionali ammessi per il login con Google (M-6).
 *
 * PERCHE': il callback `signIn` creava un utente STUDENTE con
 * `emailVerificata: true` per QUALUNQUE account Google, quindi chiunque avesse
 * una gmail poteva entrare in BiblioFlow. Corrispondono ai domini usati dal
 * seed: studenti (`@studenti.unisa.it`), staff biblioteca
 * (`@biblioteca.unisa.it`) e ateneo (`@unisa.it`).
 */
const DOMINI_GOOGLE_AMMESSI = ["studenti.unisa.it", "unisa.it", "biblioteca.unisa.it"];

/** True se l'email appartiene a uno dei domini istituzionali ammessi. */
export function isDominioIstituzionale(email: string): boolean {
  const dominio = email.toLowerCase().split("@")[1];
  return !!dominio && DOMINI_GOOGLE_AMMESSI.includes(dominio);
}

/**
 * Intervallo minimo fra due riletture di `attivo`/`ruolo` dal database dentro
 * il callback `jwt` (rilievo di sicurezza R-2).
 *
 * PERCHE': la sessione dura `maxAge` (24 ore) e il callback `jwt` prima
 * popolava i claim SOLO al login, senza mai piu' consultare il database.
 * Disattivazione account, retrocessione di ruolo o reset password non
 * avevano quindi ALCUN effetto fino alla scadenza naturale del token: un
 * ex-bibliotecario poteva continuare per 24 ore a chiamare `/api/admin/*`,
 * dato che `requireUser()` si fida ciecamente di `session.user`.
 *
 * PERCHE' UN INTERVALLO E NON UNA QUERY AD OGNI RICHIESTA: Auth.js invoca
 * `jwt` a ogni richiesta autenticata (middleware incluso). Una query al
 * database per ogni singola richiesta autenticata sarebbe un costo che
 * cresce linearmente col traffico, per un rischio che nella pratica ha una
 * finestra di tollerabilita' di qualche minuto (un bibliotecario retrocesso
 * o un account disattivato non e' un'emergenza al secondo). Un minuto e' un
 * compromesso: abbastanza breve da rendere la finestra di abuso residua
 * trascurabile rispetto alle 24 ore precedenti, abbastanza lungo da non
 * appesantire il database su un'app con traffico da ateneo. Il timestamp
 * dell'ultimo controllo viaggia DENTRO al token (cifrato da Auth.js), non in
 * memoria di processo: cosi' il throttling regge anche su piu' istanze
 * serverless, dove un contatore in-memory per-processo non sarebbe condiviso.
 */
const INTERVALLO_RIVALIDAZIONE_JWT_MS = 60 * 1000;

export const { handlers, signIn, signOut, auth } = NextAuth({
  // Base condivisa con il middleware: provider Google, `pages`, `session`,
  // `trustHost` e i callback `session`/`authorized`. Vedi `auth.config.ts`.
  ...authConfig,

  providers: [
    // I provider dichiarativi (oggi solo Google) arrivano dalla config
    // condivisa: vanno tenuti li' perche' il middleware deve poter istanziare
    // Auth.js con la stessa identica lista, senza trascinarsi dietro Node.
    ...authConfig.providers,

    // Credentials Provider (email/password).
    // RESTA QUI e non in `auth.config.ts`: `authorize` usa bcrypt e Prisma,
    // cioe' esattamente cio' che sull'Edge Runtime non e' disponibile.
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new ErroreLogin(
            CODICI_ERRORE_LOGIN.CAMPI_MANCANTI,
            "Email e password sono obbligatori",
          );
        }

        const email = (credentials.email as string).toLowerCase();
        const password = credentials.password as string;

        // Rate limit anti brute force sul singolo account (A-4).
        // Il controllo sta PRIMA della query cosi' un attaccante bloccato non
        // riesce nemmeno a misurare i tempi di risposta del database.
        if (loginBloccato(email)) {
          throw new ErroreLogin(
            CODICI_ERRORE_LOGIN.TROPPI_TENTATIVI,
            TROPPI_TENTATIVI,
          );
        }

        // Import dinamico di bcrypt (solo quando serve, non a livello di modulo)
        const bcrypt = (await import("bcryptjs")).default;

        // Trova l'utente nel database
        const user = await prisma.user.findUnique({
          where: { email },
          select: {
            id: true,
            email: true,
            passwordHash: true,
            nome: true,
            cognome: true,
            ruolo: true,
            matricola: true,
            isPendolare: true,
            necessitaAccessibilita: true,
            attivo: true,
            emailVerificata: true,
          },
        });

        if (!user) {
          // Confronto "a vuoto" contro un hash fittizio: serve solo a spendere
          // lo stesso tempo del ramo in cui l'utente esiste, cosi' il tempo di
          // risposta non rivela se l'email e' registrata (A-4). Il risultato
          // e' per costruzione `false` e viene ignorato.
          await bcrypt.compare(password, DUMMY_PASSWORD_HASH);
          registraTentativoFallito(email);
          // Stesso identico messaggio del ramo "password errata" (A-4).
          throw new ErroreLogin(
            CODICI_ERRORE_LOGIN.CREDENZIALI_NON_VALIDE,
            CREDENZIALI_NON_VALIDE,
          );
        }

        // Verifica se l'account è attivo.
        // NOTA A-4: questo controllo resta PRIMA della password, come nel
        // comportamento originale documentato dai test di baseline. Rivela che
        // l'indirizzo e' registrato, ma solo per lo stato "disabilitato", che
        // e' raro e deciso da un bibliotecario: l'utente deve poter capire
        // perche' non entra. E' un compromesso consapevole, diverso dal caso
        // "email non verificata" qui sotto.
        if (!user.attivo) {
          throw new ErroreLogin(
            CODICI_ERRORE_LOGIN.ACCOUNT_DISABILITATO,
            "Account disabilitato. Contatta la biblioteca.",
          );
        }

        // Verifica la password
        if (!user.passwordHash) {
          throw new ErroreLogin(
            CODICI_ERRORE_LOGIN.ACCOUNT_NON_CONFIGURATO,
            "Account non configurato correttamente",
          );
        }

        const passwordMatch = await bcrypt.compare(password, user.passwordHash);
        if (!passwordMatch) {
          registraTentativoFallito(email);
          // Stesso identico messaggio del ramo "utente inesistente" (A-4).
          throw new ErroreLogin(
            CODICI_ERRORE_LOGIN.CREDENZIALI_NON_VALIDE,
            CREDENZIALI_NON_VALIDE,
          );
        }

        // Login riuscito: l'utente legittimo non deve restare penalizzato dai
        // tentativi sbagliati precedenti.
        azzeraTentativi(email);

        // Verifica dell'email obbligatoria (A-5).
        //
        // PERCHE' STA QUI E NON PRIMA: il controllo era sopra, prima del
        // confronto della password. Finche' tutti gli errori arrivavano al
        // browser appiattiti su "Configuration" la cosa era invisibile, ma ora
        // che il motivo viene comunicato al client quella posizione sarebbe un
        // oracolo: chiunque, con una password a caso, scoprirebbe quali email
        // sono registrate (finding A-4). Spostandolo DOPO il confronto, il
        // motivo "email non verificata" lo vede solo chi la password la sa
        // gia', cioe' il titolare dell'account.
        //
        // Il controllo resta comunque bloccante (finding A-5): senza di esso
        // ci si potrebbe registrare con l'indirizzo di un altro e usarlo.
        if (user.emailVerificata === false) {
          throw new ErroreLogin(
            CODICI_ERRORE_LOGIN.EMAIL_NON_VERIFICATA,
            "Devi verificare l'email prima di accedere",
          );
        }

        // Aggiorna ultimo accesso
        await prisma.user.update({
          where: { id: user.id },
          data: { ultimoAccesso: new Date() },
        });

        // Ritorna l'utente (senza passwordHash)
        return {
          id: user.id,
          email: user.email,
          nome: user.nome,
          cognome: user.cognome,
          ruolo: user.ruolo,
          matricola: user.matricola,
          isPendolare: user.isPendolare,
          necessitaAccessibilita: user.necessitaAccessibilita,
        };
      },
    }),
  ],
  
  callbacks: {
    // I callback condivisi (`session` e `authorized`) arrivano da
    // `auth.config.ts`. Lo spread va PRIMA di quelli qui sotto, che aggiungono
    // i soli callback che hanno bisogno del database.
    ...authConfig.callbacks,

    // Callback per signin con Google OAuth
    async signIn({ user, account, profile }) {
      // Signin con Credentials - gestito dal provider
      if (account?.provider === "credentials") {
        return true;
      }
      
      // Signin con Google OAuth
      if (account?.provider === "google" && user.email) {
        // Allow-list dei domini istituzionali (M-6).
        // Va controllata QUI, lato server: il parametro `hd` inviato a Google
        // e' solo un suggerimento nella URL di autorizzazione e puo' essere
        // rimosso da chi avvia il flusso. Senza questo controllo il ramo
        // sottostante creava un account STUDENTE con `emailVerificata: true`
        // per qualunque indirizzo Google (es. una gmail personale).
        if (!isDominioIstituzionale(user.email)) {
          console.warn("Signin Google rifiutato: dominio non istituzionale");
          return false;
        }

        try {
          // Cerca utente esistente
          let dbUser = await prisma.user.findUnique({
            where: { email: user.email },
          });
          
          if (!dbUser) {
            // Crea nuovo utente dalla risposta Google
            // Estrai nome e cognome dall'account Google
            const nome = profile?.given_name || user.name?.split(" ")[0] || "Nome";
            const cognome = profile?.family_name || user.name?.split(" ").slice(1).join(" ") || "Cognome";
            
            dbUser = await prisma.user.create({
              data: {
                email: user.email,
                nome: nome,
                cognome: cognome,
                ruolo: "STUDENTE",
                emailVerificata: true, // Google ha già verificato
                attivo: true,
                isPendolare: false,
                necessitaAccessibilita: false,
                notifichePush: true,
                notificheEmail: true,
                // Password non necessaria per OAuth
                passwordHash: null,
              },
            });
          } else {
            // Rilievo di sicurezza R-1: il provider Credentials blocca
            // l'accesso quando `attivo` e' false (vedi ramo `authorize` sopra),
            // ma questo ramo Google saltava DIRETTAMENTE all'aggiornamento di
            // `ultimoAccesso`, senza controllare mai lo stato dell'account.
            // Conseguenza reale: un bibliotecario disattiva uno studente che
            // abusa del servizio, e quello studente rientra comunque cliccando
            // "Accedi con Google", con una sessione piena — il blocco era
            // aggirabile cambiando provider. Controllo qui, PRIMA di
            // qualunque scrittura, cosi' un account disattivato non ottiene
            // ne' una sessione ne' un `ultimoAccesso` aggiornato.
            if (!dbUser.attivo) {
              console.warn("Signin Google rifiutato: account disattivato");
              throw new ErroreLogin(
                CODICI_ERRORE_LOGIN.ACCOUNT_DISABILITATO,
                "Account disabilitato. Contatta la biblioteca.",
              );
            }

            // Aggiorna ultimo accesso
            await prisma.user.update({
              where: { id: dbUser.id },
              data: {
                ultimoAccesso: new Date(),
                emailVerificata: true, // Assicura che sia verificata
              },
            });
          }
          
          // Aggiungi i campi custom al user object per i callback JWT/session
          user.id = dbUser.id;
          user.nome = dbUser.nome;
          user.cognome = dbUser.cognome;
          user.ruolo = dbUser.ruolo;
          user.matricola = dbUser.matricola;
          user.isPendolare = dbUser.isPendolare;
          user.necessitaAccessibilita = dbUser.necessitaAccessibilita;
          
          return true;
        } catch (error) {
          // `ErroreLogin` (es. account disattivato, vedi sopra) va rilanciata
          // cosi' com'e': e' un rifiuto voluto e gia' porta con se' il codice
          // giusto per il client. Se la incartassimo nel `return false` qui
          // sotto, Auth.js la appiattirebbe su un generico `AccessDenied`
          // senza `code`, perdendo il motivo — lo stesso problema che
          // `ErroreLogin` esiste apposta per evitare sul provider Credentials.
          if (error instanceof ErroreLogin) {
            throw error;
          }
          console.error("Errore signin Google:", error);
          return false;
        }
      }
      
      return false;
    },
    
    // Personalizza il JWT token
    async jwt({ token, user }) {
      if (user) {
        // Login appena avvenuto: `user` arriva da `authorize` o dal ramo
        // Google del callback `signIn`, quindi e' gia' fresco di database.
        token.id = user.id;
        token.nome = user.nome;
        token.cognome = user.cognome;
        token.ruolo = user.ruolo;
        token.matricola = user.matricola;
        token.isPendolare = user.isPendolare;
        token.necessitaAccessibilita = user.necessitaAccessibilita;
        // Segna il momento della rilettura: la prossima avverra' non prima
        // di INTERVALLO_RIVALIDAZIONE_JWT_MS (rilievo di sicurezza R-2).
        token.ultimaVerifica = Date.now();
        return token;
      }

      // Richieste successive al login: nessun `user`, solo il token gia'
      // emesso. Throttling della rilettura dal DB (vedi commento su
      // INTERVALLO_RIVALIDAZIONE_JWT_MS): se l'ultimo controllo e' recente,
      // il token torna invariato senza toccare il database.
      const ultimaVerifica = token.ultimaVerifica ?? 0;
      if (Date.now() - ultimaVerifica < INTERVALLO_RIVALIDAZIONE_JWT_MS) {
        return token;
      }

      // Token senza id valido: non e' mai dovuto accadere (viene sempre
      // valorizzato al login qui sopra), ma se capitasse non c'e' nulla da
      // verificare nel database. Meglio invalidare che fidarsi alla cieca.
      if (typeof token.id !== "string" || token.id.length === 0) {
        return null;
      }

      // Rilettura dal database: e' il cuore della correzione R-2. Se
      // l'account e' stato disattivato (o cancellato) dopo l'emissione del
      // token, la sessione va spenta ORA, non fra 24 ore. Auth.js tratta un
      // ritorno `null` da questo callback come token non piu' valido:
      // ripulisce il cookie di sessione e `auth()`/`requireUser()` vedono
      // una sessione assente, esattamente come un logout forzato.
      const dbUser = await prisma.user.findUnique({
        where: { id: token.id },
        select: { attivo: true, ruolo: true },
      });

      if (!dbUser || !dbUser.attivo) {
        return null;
      }

      // Ruolo aggiornato (es. retrocessione BIBLIOTECARIO -> STUDENTE): da
      // qui in poi `requireRole` vede il ruolo vero, non quello del login.
      token.ruolo = dbUser.ruolo;
      token.ultimaVerifica = Date.now();
      return token;
    },
    
    // NOTA: i callback `session` e `authorized` NON sono piu' qui, arrivano
    // dallo spread di `authConfig.callbacks` in cima a questo blocco.
    //
    // `authorized` in particolare conteneva una seconda lista di rotte
    // pubbliche (`["/login", "/registrazione", "/"]`) che non veniva mai
    // eseguita — il middleware non usava Auth.js — e che era gia' divergente
    // da quella vera in `src/middleware.ts`. Ora esiste in un posto solo ed e'
    // il controllo che il middleware esegue davvero.
  },

  // `pages`, `session` e `trustHost` arrivano da `authConfig`: devono essere
  // IDENTICI fra Node ed Edge, altrimenti il token emesso qui e quello atteso
  // dal middleware potrebbero divergere (nome del cookie, scadenza, salt).

  // Messaggi di errore user-friendly (Trasparenza - principio HCI).
  // Resta solo lato Node: su Edge il log verboso di Auth.js finirebbe nei log
  // di ogni singola richiesta che passa dal middleware.
  debug: process.env.NODE_ENV === "development",
});

// ============================================
// HELPER FUNCTIONS
// ============================================

// Re-export password utilities dal file separato
// per mantenere backward compatibility
export { hashPassword, verifyPassword, validatePassword } from "./password";

/**
 * Verifica se l'utente ha un ruolo specifico
 */
export function hasRole(
  userRole: UserRole,
  allowedRoles: UserRole[]
): boolean {
  return allowedRoles.includes(userRole);
}

/**
 * Verifica se l'utente è un bibliotecario o admin
 */
export function isStaff(userRole: UserRole): boolean {
  return hasRole(userRole, ["BIBLIOTECARIO", "ADMIN"]);
}

export type AuthErrorCode =
  | "NON_AUTENTICATO"
  | "RUOLO_NON_AUTORIZZATO"
  | "RISORSA_NON_AUTORIZZATA"
  | "RISORSA_NON_TROVATA";

export class AuthError extends Error {
  constructor(
    public readonly status: 401 | 403 | 404,
    public readonly code: AuthErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

export type AuthenticatedUser = {
  id: string;
  email: string;
  nome: string;
  cognome: string;
  ruolo: UserRole;
  matricola?: string | null;
  isPendolare: boolean;
  necessitaAccessibilita: boolean;
};

export type OwnedResource = {
  userId: string;
};

/** Restituisce l'identita' autenticata derivata dalla sessione. */
export async function requireUser(): Promise<AuthenticatedUser> {
  const session = await auth();

  if (!session?.user?.id) {
    throw new AuthError(
      401,
      "NON_AUTENTICATO",
      "E' richiesta una sessione autenticata",
    );
  }

  return session.user;
}

/** Richiede che l'utente autenticato abbia uno dei ruoli ammessi. */
export async function requireRole(
  allowedRoles: readonly UserRole[],
): Promise<AuthenticatedUser> {
  const user = await requireUser();

  if (!allowedRoles.includes(user.ruolo)) {
    throw new AuthError(
      403,
      "RUOLO_NON_AUTORIZZATO",
      "Il ruolo dell'utente non consente questa operazione",
    );
  }

  return user;
}

/**
 * Verifica la proprieta' senza rivelare agli studenti risorse di altri utenti.
 * Per i ruoli staff la matrice ruoli-operazioni richiede invece un diniego 403.
 */
export function assertOwnership(
  resource: OwnedResource,
  user: AuthenticatedUser,
): void {
  if (resource.userId === user.id) {
    return;
  }

  if (user.ruolo === "STUDENTE") {
    throw new AuthError(
      404,
      "RISORSA_NON_TROVATA",
      "La risorsa richiesta non esiste",
    );
  }

  throw new AuthError(
    403,
    "RISORSA_NON_AUTORIZZATA",
    "L'utente non e' proprietario della risorsa",
  );
}
