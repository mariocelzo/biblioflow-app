/**
 * BIB-51 · protezione middleware della lista d'attesa.
 *
 * ⚠️ PERCHE' QUESTO FILE E' CAMBIATO (test di baseline della Fase 5) ⚠️
 *
 * Il caso [TC-BIB51-003] era scritto cosi':
 *
 *     it("accetta la coda quando il cookie di sessione è presente", () => {
 *       const response = middleware(request("/api/prenotazioni/coda",
 *         "authjs.session-token=test-session"));
 *       expect(response.status).toBe(200);
 *     });
 *
 * Chiamava `middleware()` in modo SINCRONO e pretendeva che un cookie
 * INVENTATO (`test-session`) venisse accettato. Non descriveva il
 * comportamento voluto: fotografava il difetto. Il middleware infatti si
 * limitava a verificare che il cookie ESISTESSE, senza mai controllarne firma,
 * scadenza o contenuto — un `curl -H 'Cookie: authjs.session-token=x'`
 * otteneva 200 e dati reali in produzione.
 *
 * Un test scritto cosi' non e' neutrale: e' un lucchetto sul difetto. Qualsiasi
 * verifica vera del token e' per forza asincrona (decifratura del JWE) e
 * rifiuta per forza un token inventato, quindi quel test avrebbe fatto fallire
 * la correzione facendola sembrare una regressione.
 *
 * COSA CAMBIA:
 *  - i casi diventano `async`, perche' ora il middleware attende la verifica
 *    del token;
 *  - [TC-BIB51-003] e' CAPOVOLTO: un token inventato ora DEVE essere respinto;
 *  - si aggiunge [TC-BIB51-005], il caso "utente davvero autenticato", con un
 *    token FIRMATO per davvero tramite `encode` di `next-auth/jwt` e lo stesso
 *    segreto dell'applicazione. E' l'unico modo onesto di provare che la
 *    correzione non ha semplicemente chiuso la porta a tutti.
 *
 * L'intento originale della card (la coda non deve essere raggiungibile senza
 * sessione) e' preservato e anzi rafforzato.
 */
import { NextRequest } from "next/server";
import { encode } from "next-auth/jwt";
import { describe, expect, it } from "vitest";

import { config, middleware } from "@/middleware";

/**
 * Nome del cookie di sessione in ambiente non HTTPS. Coincide con il "salt"
 * usato da Auth.js per derivare la chiave di cifratura del token: e' il
 * motivo per cui va passato anche a `encode`.
 */
const COOKIE_SESSIONE = "authjs.session-token";

function request(pathname: string, cookie?: string) {
  return new NextRequest(`http://localhost${pathname}`, {
    method: "POST",
    headers: cookie ? { cookie } : undefined,
  });
}

/**
 * Costruisce un cookie di sessione VERO: un JWE firmato e cifrato con lo
 * stesso segreto che usa l'applicazione, quindi indistinguibile da quello che
 * Auth.js emette dopo un login riuscito.
 */
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

describe("BIB-51 · protezione middleware lista d'attesa", () => {
  it("[TC-BIB51-001] dichiara esplicitamente la rotta coda nel matcher", () => {
    expect(config.matcher).toContain("/api/prenotazioni/coda/:path*");
  });

  it("[TC-BIB51-002] rifiuta la coda senza sessione con HTTP 401", async () => {
    const response = await middleware(request("/api/prenotazioni/coda"));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: "Non autenticato",
    });
  });

  it("[TC-BIB51-003] rifiuta la coda quando il cookie di sessione e' inventato", async () => {
    // Il caso capovolto: prima questa richiesta otteneva 200. Il valore
    // "test-session" non e' un JWT emesso da Auth.js, quindi la decifratura
    // fallisce e la sessione risulta assente.
    const response = await middleware(
      request("/api/prenotazioni/coda", `${COOKIE_SESSIONE}=test-session`),
    );

    expect(
      response.status,
      "Un cookie di sessione inventato non deve piu' superare il middleware: " +
        "era il difetto che questo test fotografava.",
    ).toBe(401);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: "Non autenticato",
    });
  });

  it("[TC-BIB51-004] non indebolisce la protezione delle API admin", async () => {
    const response = await middleware(request("/api/admin/statistiche"));
    expect(response.status).toBe(401);
  });

  it("[TC-BIB51-005] accetta la coda con un token di sessione davvero firmato", async () => {
    // Il contrappeso indispensabile: senza questo caso, "rifiuta tutto"
    // passerebbe per una correzione riuscita.
    const response = await middleware(
      request("/api/prenotazioni/coda", await cookieSessioneValido()),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });
});
