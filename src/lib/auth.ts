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

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    // Google OAuth Provider per login universitario
    Google({
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      authorization: {
        params: {
          // Limita il dominio per login universitario (opzionale)
          // hd: "studenti.unisa.it",
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

        const email = credentials.email as string;
        const password = credentials.password as string;

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
          throw new Error("Credenziali non valide");
        }

        // Verifica se l'account è attivo
        if (!user.attivo) {
          throw new Error("Account disabilitato. Contatta la biblioteca.");
        }

        // Verifica la password
        if (!user.passwordHash) {
          throw new Error("Account non configurato correttamente");
        }

        // Import dinamico di bcrypt (solo quando serve, non a livello di modulo)
        const bcrypt = (await import("bcryptjs")).default;
        const passwordMatch = await bcrypt.compare(password, user.passwordHash);
        if (!passwordMatch) {
          throw new Error("Credenziali non valide");
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
    // Callback per signin con Google OAuth
    async signIn({ user, account, profile }) {
      // Signin con Credentials - gestito dal provider
      if (account?.provider === "credentials") {
        return true;
      }
      
      // Signin con Google OAuth
      if (account?.provider === "google" && user.email) {
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
