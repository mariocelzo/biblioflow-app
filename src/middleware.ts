// ============================================
// MIDDLEWARE AUTENTICAZIONE - BiblioFlow
// ============================================
// Middleware leggero compatibile con Edge Runtime
// Non importa moduli Node.js per funzionare su Edge

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Route pubbliche che non richiedono autenticazione
const publicRoutes = [
  "/",
  "/login",
  "/registrazione",
  "/recupera-password",
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

  // Verifica presenza del session token di NextAuth
  // Il nome del cookie dipende dal setting NEXTAUTH_URL (secure in prod)
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
    /*
     * Match tutti i request path eccetto:
     * - _next/static (file statici)
     * - _next/image (ottimizzazione immagini)
     * - favicon.ico (icona)
     * - file statici (immagini, font, etc.)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js)$).*)",
  ],
};
