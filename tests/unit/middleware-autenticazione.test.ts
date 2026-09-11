/**
 * 🧪 TEST — il middleware e' un livello di autenticazione VERO, e le rotte
 *          continuano comunque ad autenticarsi da sole
 *
 * COM'ERA: `src/middleware.ts` controllava soltanto che il cookie di sessione
 * ESISTESSE, senza verificarne firma, contenuto o scadenza. Una riga nella
 * console del browser (`document.cookie = "authjs.session-token=x"`) — o un
 * `curl -H 'Cookie: authjs.session-token=x'` — bastava a superarlo su
 * qualunque percorso. Questo file fotografava quel limite in [TC-SEC-MW-001],
 * con l'avvertenza esplicita: "il giorno in cui il middleware verifichera'
 * davvero il token, questo test fallira'". Quel giorno e' arrivato, e il caso
 * e' stato CAPOVOLTO.
 *
 * COM'E' ORA: il middleware istanzia `auth()` da `src/lib/auth.config.ts` — la
 * configurazione Auth.js edge-safe, senza Prisma ne' bcrypt — e decifra
 * davvero il JWT. Un token inventato viene respinto.
 *
 * PERCHE' IL FILE CONTINUA A ESISTERE: perche' il middleware, pur essendo ora
 * una difesa reale, non deve restare l'UNICA. Il `matcher` e' una regex e una
 * regex sbagliata ha gia' aggirato il controllo una volta (finding M-5); i
 * ruoli e la proprieta' delle risorse il middleware non li conosce. Il rischio
 * concreto e' la rotta aggiunta domani da qualcuno convinto che "tanto il
 * middleware protegge le API". [TC-SEC-MW-003] trasforma quell'assunzione
 * taciuta in un controllo automatico che fallisce nella pull request.
 *
 * 🆔 ID STABILI: `TC-SEC-MW-0xx`.
 */

import { readFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { NextRequest } from "next/server";
import { encode } from "next-auth/jwt";
import { describe, expect, it } from "vitest";

import { middleware } from "@/middleware";

const RADICE_PROGETTO = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const CARTELLA_API = path.join(RADICE_PROGETTO, "src/app/api");

/** Nome del cookie di sessione (e salt di derivazione della chiave) in HTTP. */
const COOKIE_SESSIONE = "authjs.session-token";

function richiesta(pathname: string, cookie?: string) {
  return new NextRequest(`http://localhost${pathname}`, {
    method: "GET",
    headers: cookie ? { cookie } : undefined,
  });
}

/** Cookie con un JWE emesso davvero, con il segreto dell'applicazione. */
async function cookieSessioneValido(): Promise<string> {
  const token = await encode({
    salt: COOKIE_SESSIONE,
    secret: process.env.NEXTAUTH_SECRET as string,
    maxAge: 24 * 60 * 60,
    token: {
      id: "utente-test",
      email: "studente@studenti.unisa.it",
      name: "Studente Test",
      nome: "Studente",
      cognome: "Test",
      ruolo: "STUDENTE",
      isPendolare: false,
      necessitaAccessibilita: false,
      ultimaVerifica: Date.now(),
    },
  });

  return `${COOKIE_SESSIONE}=${token}`;
}

describe("middleware: cosa garantisce davvero", () => {
  it("[TC-SEC-MW-001] un cookie di sessione inventato NON supera piu' il middleware", async () => {
    // Il caso capovolto rispetto alla baseline: qui stava scritto
    // `expect(response.status).toBe(200)`, con la nota che descriveva il
    // difetto. Ora il valore del cookie viene decifrato e verificato.
    const response = await middleware(
      richiesta("/api/admin/statistiche", `${COOKIE_SESSIONE}=valore-inventato`),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: "Non autenticato",
    });
  });

  it("[TC-SEC-MW-002] senza alcun cookie le API restano respinte con 401", async () => {
    const response = await middleware(richiesta("/api/admin/statistiche"));
    expect(response.status).toBe(401);
  });

  it("[TC-SEC-MW-005] un token firmato davvero continua a passare", async () => {
    // Contrappeso a [TC-SEC-MW-001]: senza questo, un middleware che rifiuta
    // chiunque sembrerebbe corretto.
    const response = await middleware(
      richiesta("/api/admin/statistiche", await cookieSessioneValido()),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("[TC-SEC-MW-006] una pagina protetta con cookie inventato porta al login", async () => {
    // Per le pagine il rifiuto non e' un 401 in JSON (illeggibile in un
    // browser) ma un redirect che conserva la destinazione.
    const response = await middleware(
      richiesta("/dashboard", `${COOKIE_SESSIONE}=valore-inventato`),
    );

    expect(response.status).toBe(307);

    const destinazione = new URL(response.headers.get("location") as string);
    expect(destinazione.pathname).toBe("/login");
    expect(destinazione.searchParams.get("callbackUrl")).toBe("/dashboard");
  });

  it("[TC-SEC-MW-007] le rotte pubbliche restano raggiungibili da anonimi", async () => {
    // Non-regressione: il link di verifica email e quello di reset password
    // arrivano per definizione a chi non e' autenticato.
    for (const percorso of ["/", "/login", "/verifica-email", "/reset-password"]) {
      const response = await middleware(richiesta(percorso));
      expect(response.status, `${percorso} deve restare pubblica`).toBe(200);
    }
  });
});

/**
 * Prefissi dichiarati PUBBLICI dal middleware stesso: qui l'assenza di
 * `auth()` e' voluta (login, registrazione, recupero password, health check).
 * `/api/cron` non usa la sessione ma un segreto condiviso nell'header
 * Authorization, quindi ha una difesa propria ed e' trattato a parte.
 */
const PREFISSI_PUBBLICI = ["auth/", "health", "cron/"];

/**
 * Rotte non pubbliche che NON si autenticano da sole.
 *
 * L'elenco era `["libri", "libri/[id]", "posti", "sale"]` e ora e' VUOTO:
 * quelle quattro rotte (catalogo, dettaglio libro, posti, sale) chiamano
 * `requireUser()` al proprio interno. Erano l'unico caso in cui il controllo
 * di sola presenza del cookie fatto dal middleware costituiva l'intera
 * difesa — cioe' nessuna difesa.
 *
 * QUESTO ELENCO PUO' SOLO RESTARE VUOTO: una nuova rotta senza autenticazione
 * fa fallire [TC-SEC-MW-003].
 */
const ECCEZIONI_NOTE: string[] = [];

/**
 * Indizi che un route handler stabilisca l'identita' del chiamante per conto
 * proprio. L'elenco e' volutamente permissivo: un falso negativo (rotta
 * protetta segnalata come scoperta) si nota subito e si corregge, mentre il
 * costo di essere troppo severi e' solo un po' di rumore.
 */
const INDIZI_DI_AUTENTICAZIONE = [
  "auth()",
  "requireUser",
  "requireRole",
  "verificaAccessoStaff",
  "CRON_SECRET",
];

async function elencaRotteApi(): Promise<string[]> {
  const rotte: string[] = [];

  async function esplora(cartella: string): Promise<void> {
    const voci = await readdir(cartella, { withFileTypes: true });
    for (const voce of voci) {
      const completo = path.join(cartella, voce.name);
      if (voce.isDirectory()) {
        await esplora(completo);
      } else if (voce.name === "route.ts") {
        rotte.push(path.relative(CARTELLA_API, path.dirname(completo)));
      }
    }
  }

  await esplora(CARTELLA_API);
  return rotte.sort();
}

describe("invariante: ogni rotta API non pubblica si autentica da sola", () => {
  it("[TC-SEC-MW-003] nessuna NUOVA rotta si affida al solo middleware", async () => {
    const rotte = await elencaRotteApi();

    // Sanity: se la scansione non trova nulla (cartella spostata, refactor),
    // il test diventerebbe verde a vuoto — la peggiore delle bugie.
    expect(rotte.length).toBeGreaterThan(20);

    const scoperte = rotte.filter((rotta) => {
      const percorsoRotta = rotta.split(path.sep).join("/");

      if (PREFISSI_PUBBLICI.some((p) => `${percorsoRotta}/`.startsWith(p))) {
        return false;
      }

      const sorgente = readFileSync(
        path.join(CARTELLA_API, rotta, "route.ts"),
        "utf8",
      );
      return !INDIZI_DI_AUTENTICAZIONE.some((indizio) => sorgente.includes(indizio));
    });

    const inattese = scoperte
      .map((rotta) => rotta.split(path.sep).join("/"))
      .filter((rotta) => !ECCEZIONI_NOTE.includes(rotta));

    // Messaggio esplicito: chi vede fallire questo test deve capire in un
    // colpo d'occhio cosa ha dimenticato e perche' non basta il middleware.
    expect(
      inattese,
      `Queste rotte API non chiamano auth()/requireUser() e NON sono dichiarate pubbliche: ${inattese.join(", ")}.\n` +
        "Il middleware verifica la sessione, ma dipende da un `matcher` a regex " +
        "e non conosce ruoli ne' proprieta' delle risorse: non deve restare " +
        "l'unica barriera. Aggiungi auth()/requireUser() nell'handler (vedi il " +
        "commento in cima a src/middleware.ts).",
    ).toEqual([]);
  });

  it("[TC-SEC-MW-004] non esistono piu' rotte scoperte", async () => {
    // Il test precedente tollerava quattro eccezioni storiche. Ora non ce ne
    // sono: se questo elenco tornasse a popolarsi sarebbe un passo indietro.
    expect(ECCEZIONI_NOTE).toHaveLength(0);
  });
});
