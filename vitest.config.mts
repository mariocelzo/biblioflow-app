import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(projectRoot, "src"),
    },
  },
  test: {
    environment: "node",
    // I test dei componenti React (`.test.tsx`) dichiarano in testa
    // `// @vitest-environment jsdom`; tutti gli altri restano in ambiente node.
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx", "tests/**/*.spec.ts"],
    // La suite E2E Playwright ha un runner proprio (`npm run test:e2e`).
    exclude: ["**/node_modules/**", "tests/e2e/**"],
    passWithNoTests: true,
    // I test di integrazione condividono intenzionalmente lo stesso PostgreSQL
    // locale. Eseguire file diversi in parallelo permette a un'automazione
    // globale (per esempio il rilascio no-show) di processare la fixture di un
    // altro file e rende il conteggio non deterministico. La sequenzialita'
    // tra file elimina questa corsa senza cambiare il parallelismo interno al DB.
    fileParallelism: false,
    clearMocks: true,
    restoreMocks: true,
    server: {
      deps: {
        // PERCHE': da quando il middleware usa davvero Auth.js, i test lo
        // caricano insieme a `next-auth`/`@auth/core`. Quei pacchetti sono
        // ESM e importano `next/server`, ma il `package.json` di Next non
        // dichiara un campo `exports`: il resolver ESM nativo di Node non
        // aggiunge l'estensione ai sottopercorsi e fallisce con
        // "Cannot find module .../next/server ... Did you mean next/server.js?".
        // Facendoli passare per la trasformazione di Vite (che invece risolve
        // l'estensione) l'import funziona. Non cambia cosa viene testato,
        // solo come viene caricato.
        inline: [/next-auth/, /@auth\/core/],
      },
    },
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "json-summary", "html", "lcov"],
      reportsDirectory: "coverage",
      // Tutto il codice applicativo, route handler compresi: escluderli
      // (come faceva la configurazione precedente) nascondeva proprio le API.
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.d.ts", "src/types/**"],
      // Soglie minime sul codice server (dominio, API, middleware): una
      // modifica che le fa scendere fa fallire `npm run test:coverage`.
      thresholds: {
        "src/lib/**/*.ts": { statements: 90, branches: 80 },
        "src/app/api/**/*.ts": { statements: 90, branches: 80 },
        "src/middleware.ts": { statements: 100, branches: 100 },
      },
    },
  },
});
