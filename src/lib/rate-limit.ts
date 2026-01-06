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
// ⚠️ NOTA: In produzione con Vercel/serverless, usare Redis (Upstash)
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
 * Estrae l'IP reale del client considerando proxy e CDN
 */
function getClientIp(request: NextRequest): string {
  // Vercel/CloudFlare forwarded IP
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim();
  }
  
  // Vercel real IP
  const realIp = request.headers.get("x-real-ip");
  if (realIp) {
    return realIp;
  }
  
  // CloudFlare connecting IP
  const cfConnectingIp = request.headers.get("cf-connecting-ip");
  if (cfConnectingIp) {
    return cfConnectingIp;
  }
  
  // Fallback
  return "unknown";
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
export function createRateLimiter(config: RateLimitConfig) {
  const {
    max,
    windowMs,
    message = "Troppi tentativi. Riprova tra qualche istante.",
  } = config;

  return async (request: NextRequest): Promise<NextResponse | null> => {
    const ip = getClientIp(request);
    const now = Date.now();
    
    // Crea una chiave univoca per la route e l'IP
    const key = `${ip}:${request.nextUrl.pathname}`;
    
    let log = rateLimitStore.get(key);
    
    if (!log || now > log.resetTime) {
      // Nuova finestra temporale
      log = {
        count: 1,
        resetTime: now + windowMs,
      };
      rateLimitStore.set(key, log);
      return null; // Richiesta consentita
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
 * Rate limiter MEDIO per registrazione (previene spam)
 * 3 registrazioni ogni ora
 */
export const registrationRateLimiter = createRateLimiter({
  max: 3,
  windowMs: 60 * 60 * 1000,
  message: "Troppi tentativi di registrazione. Riprova tra un'ora.",
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
 * Rate limiter STRICT per operazioni critiche (cancellazioni, modifiche admin)
 * 10 richieste al minuto
 */
export const criticalApiRateLimiter = createRateLimiter({
  max: 10,
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
