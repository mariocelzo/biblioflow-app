/**
 * 🧪 TEST — il middleware NON e' un livello di autenticazione, e le rotte lo sanno
 *
 * CONTESTO: `src/middleware.ts` controlla soltanto che il cookie di sessione
 * ESISTA, senza verificarne firma, contenuto o scadenza. Una riga nella console
 * del browser (`document.cookie = "authjs.session-token=x"`) basta a superarlo
 * su qualunque percorso.
 *
 * Verificare davvero il token nel middleware non e' fattibile oggi: gira su Edge
 * Runtime e `src/lib/auth.ts` importa Prisma e bcrypt, che su Edge non
 * funzionano; la soluzione pulita di Auth.js v5 richiede di spezzare quel file
 * in una configurazione "edge-safe" separata. Il motivo per esteso e' nel blocco
 * di commento in cima a `src/middleware.ts`.
 *
 * PERCHE' QUESTO FILE ESISTE: se la verifica non si puo' fare nel middleware,
 * allora l'unica difesa reale sta dentro i route handler — e va resa
 * VERIFICABILE, non affidata alla memoria di chi scrivera' la prossima rotta.
 * Il rischio concreto non e' il codice di oggi: e' la rotta aggiunta domani da
 * qualcuno convinto che "tanto il middleware protegge le API". Quella rotta
 * nascerebbe pubblica senza che nessuno se ne accorga.
 * Il test [TC-SEC-MW-003] trasforma quell'assunzione taciuta in un controllo
 * automatico che fallisce nella pull request, prima del deploy.
 *
 * 🆔 ID STABILI: `TC-SEC-MW-0xx`.
 */

import { readFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { middleware } from "@/middleware";

const RADICE_PROGETTO = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const CARTELLA_API = path.join(RADICE_PROGETTO, "src/app/api");

function richiesta(pathname: string, cookie?: string) {
  return new NextRequest(`http://localhost${pathname}`, {
    method: "GET",
    headers: cookie ? { cookie } : undefined,
  });
}

describe("middleware: cosa garantisce davvero", () => {
  it("[TC-SEC-MW-001] un cookie di sessione inventato supera il middleware", () => {
    // Questo test NON descrive un comportamento desiderabile: FOTOGRAFA il
    // limite noto, perche' resti scritto e misurabile invece di essere
    // scoperto per caso. Il giorno in cui il middleware verifichera' davvero
    // il token, questo test fallira': andra' aggiornato, ed e' esattamente il
    // promemoria che vogliamo lasciare.
    const response = middleware(
      richiesta("/api/admin/statistiche", "authjs.session-token=valore-inventato"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("[TC-SEC-MW-002] senza alcun cookie le API restano respinte con 401", () => {
    // La parte di utilita' che il middleware fornisce davvero.
    expect(middleware(richiesta("/api/admin/statistiche")).status).toBe(401);
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
 * Rotte NON pubbliche che oggi NON si autenticano da sole: la loro unica
 * barriera e' il controllo di sola presenza del cookie fatto dal middleware,
 * cioe' nessuna barriera reale.
 *
 * CHE DATI ESPONGONO: catalogo libri, mappa dei posti e sale della biblioteca.
 * Nessun dato personale, il che spiega perche' il difetto sia rimasto
 * inosservato — ma sono comunque dati che l'applicazione intende mostrare solo
 * a chi ha effettuato l'accesso.
 *
 * QUESTO ELENCO PUO' SOLO ACCORCIARSI. Il test verifica un SOTTOINSIEME:
 * aggiungere `auth()` a una di queste rotte non rompe nulla, mentre
 * introdurre una NUOVA rotta senza autenticazione fa fallire la suite.
 * Le quattro rotte qui sotto sono fuori dal perimetro di questo intervento
 * (appartengono ad aree in lavorazione da parte di altri): vanno affrontate in
 * un cambiamento dedicato, che deve anche decidere se il catalogo debba essere
 * pubblico per scelta o riservato.
 */
const ECCEZIONI_NOTE = ["libri", "libri/[id]", "posti", "sale"];

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
        "Il middleware controlla solo che ESISTA un cookie di sessione, non che sia valido: " +
        "senza un controllo interno la rotta e' di fatto aperta a chiunque. " +
        "Aggiungi auth()/requireUser() nell'handler (vedi il commento in cima a src/middleware.ts).",
    ).toEqual([]);
  });

  it("[TC-SEC-MW-004] le eccezioni note restano circoscritte e non si moltiplicano", async () => {
    // Se questo test fallisce perche' l'elenco si e' ACCORCIATO, e' una buona
    // notizia: qualcuno ha protetto una di quelle rotte. Basta togliere la
    // voce da `ECCEZIONI_NOTE`.
    expect(ECCEZIONI_NOTE).toHaveLength(4);
  });
});
