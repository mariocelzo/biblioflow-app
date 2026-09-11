// ============================================================================
// Le pagine raggiunte dai link nelle email devono essere PUBBLICHE
// ============================================================================
// COSA: verifica che ogni pagina a cui il mailer manda l'utente sia fra le
//       rotte pubbliche del middleware.
//
// PERCHE' ESISTE QUESTO TEST (bug reale, riprodotto in produzione):
// `/reset-password` non era dichiarata pubblica. Il link del recupero password
// finiva quindi intercettato dal middleware:
//
//   /reset-password?userId=…&token=…  →  307  →  /login?callbackUrl=%2Freset-password
//
// Due conseguenze, entrambe fatali:
//  1. all'utente si chiedeva di AUTENTICARSI per poter reimpostare la password
//     che ha dimenticato — un vicolo cieco per definizione;
//  2. il redirect perdeva `userId` e `token`, quindi il link era anche bruciato.
//
// Il difetto e' rimasto invisibile finche' l'email di reset non veniva spedita
// (il mailer non esisteva): a quella pagina non ci arrivava mai nessuno.
// Appena l'invio ha iniziato a funzionare, il link ha smesso di funzionare.
//
// Questo test lega le due cose: se domani il mailer manda a una nuova pagina,
// o se qualcuno toglie una voce da `publicRoutes`, la suite si ferma.

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const RADICE = path.resolve(__dirname, "../..");

function leggi(relativo: string): string {
  return readFileSync(path.join(RADICE, relativo), "utf8");
}

/** I percorsi elencati in `publicRoutes` dentro src/middleware.ts. */
function rottePubbliche(): string[] {
  const sorgente = leggi("src/middleware.ts");
  const blocco = sorgente.match(/const publicRoutes\s*=\s*\[([\s\S]*?)\]/);

  if (!blocco) {
    throw new Error("Blocco `publicRoutes` non trovato in src/middleware.ts");
  }

  // Si prendono solo le stringhe, ignorando i commenti fra una e l'altra.
  return [...blocco[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

/**
 * I percorsi verso cui il mailer costruisce un link.
 *
 * Si leggono dal sorgente invece di elencarli a mano: se domani si aggiunge un
 * `urlQualcosa()` che punta a una pagina nuova, il test la vede da solo.
 */
function paginePuntateDalleEmail(): string[] {
  const sorgente = leggi("src/lib/mailer.ts");

  // Le funzioni costruttrici compongono `${base}/percorso?...`.
  return [
    ...new Set(
      [...sorgente.matchAll(/\$\{base\}\/([a-z0-9-]+)/g)].map((m) => `/${m[1]}`),
    ),
  ];
}

describe("le pagine linkate dalle email sono pubbliche", () => {
  const pubbliche = rottePubbliche();
  const daEmail = paginePuntateDalleEmail();

  it("[TC-MAIL-PUB-001] il mailer punta ad almeno una pagina (il test non gira a vuoto)", () => {
    // Difesa contro un falso verde: se la lettura del sorgente smettesse di
    // funzionare, il ciclo qui sotto non verificherebbe nulla in silenzio.
    expect(daEmail.length).toBeGreaterThan(0);
    expect(pubbliche.length).toBeGreaterThan(0);
  });

  it.each([
    ["/verifica-email", "link di verifica dell'indirizzo"],
    ["/reset-password", "link di recupero password"],
  ])("[TC-MAIL-PUB-002] %s e' pubblica (%s)", (percorso) => {
    expect(
      pubbliche,
      `${percorso} non e' fra le rotte pubbliche del middleware: chi ci arriva ` +
        "dal link nell'email verrebbe rimandato al login, perdendo i parametri.",
    ).toContain(percorso);
  });

  it("[TC-MAIL-PUB-003] ogni pagina puntata dal mailer e' dichiarata pubblica", () => {
    const nonPubbliche = daEmail.filter((p) => !pubbliche.includes(p));

    expect(
      nonPubbliche,
      "Il mailer manda l'utente su pagine che il middleware protegge. Chi " +
        "apre quel link non e' autenticato per definizione: aggiungile a " +
        "`publicRoutes` in src/middleware.ts.",
    ).toEqual([]);
  });
});
