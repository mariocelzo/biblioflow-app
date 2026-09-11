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
    include: ["tests/**/*.test.ts", "tests/**/*.spec.ts"],
    passWithNoTests: true,
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
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "coverage",
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.d.ts",
        "src/app/**/layout.ts",
        "src/app/**/page.ts",
        "src/app/**/route.ts",
      ],
    },
  },
});
