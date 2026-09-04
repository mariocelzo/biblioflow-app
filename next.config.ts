import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

// ============================================================================
// SECURITY HEADERS — BiblioFlow (audit sicurezza 2026-09-04)
// ============================================================================
// Header applicati a TUTTE le risposte. Scelte volutamente PERMISSIVE sulla CSP
// per non rompere Next.js / le pagine esistenti; da stringere in un secondo
// momento (idealmente con nonce sugli script). Ogni direttiva è commentata.
// ----------------------------------------------------------------------------

// `unsafe-inline` per script/style è necessario finché Next.js inietta il
// bootstrap di idratazione inline senza nonce; `unsafe-eval` serve al Fast
// Refresh in sviluppo (e ad alcune dipendenze). `ws:`/`wss:` coprono l'HMR di
// `next dev`. `*.sentry.io` è l'endpoint di ingestion del client Sentry.
const cspDirectives = [
  "default-src 'self'", // fallback: tutto ciò che non ha una direttiva dedicata
  "base-uri 'self'", // impedisce l'iniezione di <base> per dirottare URL relativi
  "object-src 'none'", // niente <object>/<embed>/<applet> (vettore XSS legacy)
  "frame-ancestors 'none'", // equivalente moderno di X-Frame-Options: DENY
  "form-action 'self'", // i form possono postare solo verso la stessa origine
  "img-src 'self' data: blob: https:", // copertine libri remote + immagini inline/blob
  "font-src 'self' data:", // font locali ed eventuali data: URI
  "style-src 'self' 'unsafe-inline'", // styled-jsx / stili inline di Next e Radix
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // vedi nota sopra
  "connect-src 'self' https://*.sentry.io https://*.ingest.sentry.io ws: wss:", // fetch/XHR/beacon + HMR
  "worker-src 'self' blob:", // service worker (/sw.js) e worker del lettore QR
  "manifest-src 'self'", // /manifest.json della PWA
].join("; ");

const securityHeaders = [
  {
    // Content Security Policy: riduce drasticamente l'impatto di un XSS
    // limitando le origini da cui si possono caricare script, stili, ecc.
    key: "Content-Security-Policy",
    value: cspDirectives,
  },
  {
    // Forza HTTPS per un anno su tutti i sottodomini (ignorato su http/localhost).
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  },
  {
    // Nessun sito può incorniciare l'app: difesa anti-clickjacking.
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    // Blocca il MIME-sniffing: il browser rispetta il Content-Type dichiarato.
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    // Invia il referer completo solo same-origin; cross-origin solo l'origine.
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
];

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
      {
        protocol: 'https',
        hostname: 'via.placeholder.com',
      },
      {
        protocol: 'https',
        hostname: 'picsum.photos',
      },
      {
        protocol: 'https',
        hostname: 'covers.openlibrary.org',
      },
    ],
  },

  // Applica gli header di sicurezza a ogni rotta (pagine e API).
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

// Esporta la configurazione con Sentry integrato
export default withSentryConfig(nextConfig, {
  // For all available options, see:
  // https://github.com/getsentry/sentry-webpack-plugin#options

  org: "biblioflow",
  project: "biblioflow-app",

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  // Uncomment to route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
  // This can increase your server load as well as your hosting bill.
  // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
  // side errors will fail.
  // tunnelRoute: "/monitoring",

  // Hides source maps from generated client bundles
  sourcemaps: {
    disable: true,
  },

  // Automatically tree-shake Sentry logger statements to reduce bundle size
  disableLogger: true,

  // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
  // See the following for more information:
  // https://docs.sentry.io/product/crons/
  // https://vercel.com/docs/cron-jobs
  automaticVercelMonitors: true,
});
