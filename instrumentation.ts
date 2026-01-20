/**
 * Next.js Instrumentation
 * Questo file viene caricato automaticamente all'avvio dell'app
 * Usa per inizializzare Sentry e altri monitoring tools
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Server-side instrumentation
    await import('./sentry.server.config');
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    // Edge runtime instrumentation (middleware)
    await import('./sentry.edge.config');
  }
}

// Client-side viene gestito automaticamente dal withSentryConfig in next.config.ts
