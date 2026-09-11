// ============================================================================
// La pagina di reset e la sua API devono parlare la stessa lingua
// ============================================================================
// COSA: verifica che i campi inviati da src/app/reset-password/page.tsx siano
//       esattamente quelli letti da src/app/api/auth/reset-password/route.ts.
//
// PERCHE' ESISTE QUESTO TEST (bug reale, riprodotto in produzione):
// la pagina inviava `{ token, password }`, l'API leggeva
// `{ userId, token, newPassword }`. Due campi su tre non combaciavano, quindi
// la risposta era SEMPRE `400 "Parametri mancanti"` e il reset della password
// non poteva riuscire nemmeno con un link perfettamente valido.
//
// E' un difetto invisibile leggendo un file alla volta: entrambi i lati, presi
// da soli, sembrano corretti. Si vede solo mettendoli a confronto — che e'
// esattamente quello che fa questo test.
//
// Era anche rimasto nascosto a lungo: finche' l'email di reset non veniva
// spedita, a quella pagina non ci arrivava nessuno.

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const RADICE = path.resolve(__dirname, "../..");

function leggi(relativo: string): string {
  return readFileSync(path.join(RADICE, relativo), "utf8");
}

const pagina = leggi("src/app/reset-password/page.tsx");
const api = leggi("src/app/api/auth/reset-password/route.ts");

/** I nomi dei campi che l'API destruttura dal corpo della richiesta. */
function campiLettiDallApi(): string[] {
  const destrutturazione = api.match(
    /const\s*\{([^}]+)\}\s*=\s*body\s*;/,
  );

  if (!destrutturazione) {
    throw new Error(
      "Non trovo la destrutturazione del body in reset-password/route.ts",
    );
  }

  return destrutturazione[1]
    .split(",")
    .map((campo) => campo.trim())
    .filter(Boolean);
}

/** I nomi dei campi che la pagina mette nel corpo della `fetch`. */
function campiInviatiDallaPagina(): string[] {
  const corpo = pagina.match(/JSON\.stringify\(\{([^}]+)\}\)/);

  if (!corpo) {
    throw new Error("Non trovo il corpo della fetch in reset-password/page.tsx");
  }

  // Gestisce sia `token` sia `newPassword: password`.
  return corpo[1]
    .split(",")
    .map((voce) => voce.split(":")[0].trim())
    .filter(Boolean);
}

describe("reset password: contratto fra pagina e API", () => {
  const letti = campiLettiDallApi();
  const inviati = campiInviatiDallaPagina();

  it("[TC-RESET-CONTR-001] il test non gira a vuoto", () => {
    // Se una delle due espressioni regolari smettesse di trovare riscontro,
    // il confronto qui sotto passerebbe in silenzio senza verificare nulla.
    expect(letti.length).toBeGreaterThan(0);
    expect(inviati.length).toBeGreaterThan(0);
  });

  it("[TC-RESET-CONTR-002] la pagina invia ogni campo richiesto dall'API", () => {
    const mancanti = letti.filter((campo) => !inviati.includes(campo));

    expect(
      mancanti,
      `La pagina di reset non invia ${mancanti.join(", ")}. L'API li legge dal ` +
        "corpo e risponde 400 'Parametri mancanti' se mancano: il reset " +
        "fallirebbe anche con un link valido.",
    ).toEqual([]);
  });

  it("[TC-RESET-CONTR-003] userId e token vengono presi dalla query string", () => {
    // Sono i due valori che viaggiano nel link dell'email: se la pagina
    // smettesse di leggerli, il modulo si aprirebbe ma non servirebbe a nulla.
    expect(pagina).toContain('searchParams.get("token")');
    expect(pagina).toContain('searchParams.get("userId")');
  });

  it("[TC-RESET-CONTR-004] senza uno dei due parametri il modulo non viene mostrato", () => {
    // Meglio dire subito che il link e' incompleto che far compilare il modulo
    // per poi fallire all'invio.
    expect(pagina).toMatch(/if\s*\(!token\s*\|\|\s*!userId\)/);
  });
});
