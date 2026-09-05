// ============================================
// AUTH.JS CONFIGURATION - BiblioFlow
// ============================================
// Configurazione autenticazione basata sui requisiti HCI:
// - Flessibilità adattiva (supporto pendolari)
// - Inclusività by design (accessibilità)
// - Trasparenza (messaggi chiari)

import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { prisma } from "./prisma";
import { env } from "./env";
import type { UserRole } from "@prisma/client";

// Estendi i tipi di NextAuth per includere i campi custom
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
  }
}

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

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    // Google OAuth Provider per login universitario
    Google({
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      authorization: {
        params: {
          // NOTA su `hd` (hosted domain): il parametro accetta UN SOLO dominio,
          // mentre l'ateneo usa piu' domini Workspace distinti
          // (studenti.unisa.it, biblioteca.unisa.it, unisa.it). Impostare
          // `hd: "unisa.it"` bloccherebbe quindi gli studenti.
          // In ogni caso `hd` e' solo un suggerimento lato client: viaggia
          // nella URL di autorizzazione e un attaccante puo' rimuoverlo, per
          // cui il filtro che conta e' quello server-side nel callback
          // `signIn` (vedi DOMINI_GOOGLE_AMMESSI / isDominioIstituzionale).
          prompt: "consent",
          access_type: "offline",
          response_type: "code",
        },
      },
    }),
    
    // Credentials Provider (email/password)
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error("Email e password sono obbligatori");
        }

        const email = (credentials.email as string).toLowerCase();
        const password = credentials.password as string;

        // Rate limit anti brute force sul singolo account (A-4).
        // Il controllo sta PRIMA della query cosi' un attaccante bloccato non
        // riesce nemmeno a misurare i tempi di risposta del database.
        if (loginBloccato(email)) {
          throw new Error(TROPPI_TENTATIVI);
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
          throw new Error(CREDENZIALI_NON_VALIDE);
        }

        // Verifica se l'account è attivo
        if (!user.attivo) {
          throw new Error("Account disabilitato. Contatta la biblioteca.");
        }

        // Verifica dell'email obbligatoria (A-5).
        // PERCHE': la registrazione crea l'utente con `emailVerificata: false`
        // e genera un token di verifica, ma il login non controllava il campo:
        // di fatto la verifica dell'email era facoltativa e chiunque poteva
        // registrarsi con un indirizzo non suo e usarlo subito.
        if (user.emailVerificata === false) {
          throw new Error("Devi verificare l'email prima di accedere");
        }

        // Verifica la password
        if (!user.passwordHash) {
          throw new Error("Account non configurato correttamente");
        }

        const passwordMatch = await bcrypt.compare(password, user.passwordHash);
        if (!passwordMatch) {
          registraTentativoFallito(email);
          // Stesso identico messaggio del ramo "utente inesistente" (A-4).
          throw new Error(CREDENZIALI_NON_VALIDE);
        }

        // Login riuscito: l'utente legittimo non deve restare penalizzato dai
        // tentativi sbagliati precedenti.
        azzeraTentativi(email);

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
          console.error("Errore signin Google:", error);
          return false;
        }
      }
      
      return false;
    },
    
    // Personalizza il JWT token
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.nome = user.nome;
        token.cognome = user.cognome;
        token.ruolo = user.ruolo;
        token.matricola = user.matricola;
        token.isPendolare = user.isPendolare;
        token.necessitaAccessibilita = user.necessitaAccessibilita;
      }
      return token;
    },
    
    // Personalizza la sessione
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
    
    // Controlla accesso alle pagine
    async authorized({ auth, request }) {
      const isLoggedIn = !!auth?.user;
      const { pathname } = request.nextUrl;
      
      // Route pubbliche
      const publicRoutes = ["/login", "/registrazione", "/"];
      if (publicRoutes.includes(pathname)) {
        return true;
      }
      
      // Route API pubbliche
      if (pathname.startsWith("/api/auth")) {
        return true;
      }
      
      // Tutte le altre route richiedono autenticazione
      return isLoggedIn;
    },
  },
  
  pages: {
    signIn: "/login",
    error: "/login",
  },
  
  session: {
    strategy: "jwt",
    maxAge: 24 * 60 * 60, // 24 ore
  },
  
  // Messaggi di errore user-friendly (Trasparenza - principio HCI)
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
