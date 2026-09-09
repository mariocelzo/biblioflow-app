/**
 * 🧪 TEST — quale header decide la chiave del rate limiter
 *
 * CONTESTO: la chiave del limitatore e' `${ip}:${percorso}`. Se l'"ip" si
 * potesse scegliere a piacere, basterebbe cambiarlo a ogni richiesta per
 * azzerare il contatore e rendere inutile ogni protezione che vi si appoggia:
 * l'anti-spam sulla registrazione e soprattutto `passwordResetRateLimiter`, che
 * e' la difesa contro il tentativo a forza bruta dei token di reset password
 * (rilievo M-7).
 *
 * COSA DICE LA DOCUMENTAZIONE VERCEL (verificata su
 * https://vercel.com/docs/headers/request-headers, 2026-09-09):
 *  - `x-forwarded-for`: "The public IP address of the client that made the
 *    request. If you are trying to use Vercel behind a proxy, we currently
 *    overwrite the X-Forwarded-For header and do not forward external IPs.
 *    This restriction is in place to prevent IP spoofing."
 *  - `x-real-ip`: "identical to the x-forwarded-for header".
 *  - `x-vercel-forwarded-for`: "identical to the x-forwarded-for header.
 *    However, x-forwarded-for could be overwritten if you're using a proxy on
 *    top of Vercel."
 * In produzione, quindi, un `x-forwarded-for` scritto dal client viene
 * SOSTITUITO dalla piattaforma: l'attacco non funziona. Ma la sicurezza del
 * codice non deve dipendere in modo implicito da una garanzia esterna e non
 * scritta da nessuna parte nel sorgente. Questi test fissano l'ordine di
 * fiducia — prima gli header che solo la piattaforma puo' impostare, poi
 * `x-forwarded-for` — cosi' il limitatore resta corretto anche in sviluppo
 * locale, dietro un eventuale proxy davanti a Vercel, o su un altro hosting.
 *
 * L'ordine scelto e' lo stesso su cui si basa Vercel: il suo pacchetto
 * ufficiale `@vercel/functions` implementa `ipAddress()` leggendo `x-real-ip`.
 *
 * NOTA: NON si prende "l'ultimo elemento" di `x-forwarded-for`. Quale sia
 * l'elemento attendibile in una catena dipende da quanti proxy fidati ci sono,
 * numero che qui non conosciamo: su Vercel l'header contiene un solo indirizzo.
 *
 * 🆔 ID STABILI: `TC-SEC-IP-0xx`.
 */

import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { createRateLimiter } from "@/lib/rate-limit";

/**
 * Ogni test usa un percorso diverso: la chiave del contatore include il
 * pathname e lo store vive nel modulo per tutta la durata del file, quindi
 * percorsi distinti tengono i test isolati fra loro.
 */
function richiesta(percorso: string, headers: Record<string, string>) {
  return new NextRequest(`http://localhost${percorso}`, {
    method: "POST",
    headers,
  });
}

describe("chiave del rate limiter: ordine di fiducia degli header", () => {
  it("[TC-SEC-IP-001] `x-vercel-forwarded-for` prevale su un `x-forwarded-for` cambiato a ogni richiesta", async () => {
    // SCENARIO DI ATTACCO: l'aggressore martella /api/auth/reset-password
    // variando `x-forwarded-for` a ogni tentativo per non essere mai contato.
    // Se l'header della piattaforma ha la precedenza, tutte le richieste
    // cadono nello stesso contatore e il limite scatta comunque.
    const limiter = createRateLimiter({ max: 2, windowMs: 60_000 });
    const percorso = "/api/test-ip-001";

    const primo = await limiter(
      richiesta(percorso, {
        "x-vercel-forwarded-for": "203.0.113.7",
        "x-forwarded-for": "1.1.1.1",
      }),
    );
    const secondo = await limiter(
      richiesta(percorso, {
        "x-vercel-forwarded-for": "203.0.113.7",
        "x-forwarded-for": "2.2.2.2",
      }),
    );
    const terzo = await limiter(
      richiesta(percorso, {
        "x-vercel-forwarded-for": "203.0.113.7",
        "x-forwarded-for": "3.3.3.3",
      }),
    );

    expect(primo).toBeNull();
    expect(secondo).toBeNull();
    expect(terzo?.status).toBe(429);
  });

  it("[TC-SEC-IP-002] `x-real-ip` prevale su `x-forwarded-for`", async () => {
    // `x-real-ip` e' l'header che il pacchetto ufficiale @vercel/functions usa
    // per ricavare l'IP del chiamante.
    const limiter = createRateLimiter({ max: 1, windowMs: 60_000 });
    const percorso = "/api/test-ip-002";

    const primo = await limiter(
      richiesta(percorso, { "x-real-ip": "203.0.113.9", "x-forwarded-for": "1.1.1.1" }),
    );
    const secondo = await limiter(
      richiesta(percorso, { "x-real-ip": "203.0.113.9", "x-forwarded-for": "9.9.9.9" }),
    );

    expect(primo).toBeNull();
    expect(secondo?.status).toBe(429);
  });

  it("[TC-SEC-IP-003] in assenza degli header di piattaforma usa `x-forwarded-for` (primo elemento)", async () => {
    // Retro-compatibilita': in sviluppo locale e nei test esistenti l'unico
    // header disponibile e' `x-forwarded-for`. Il limitatore deve continuare a
    // funzionare, altrimenti l'ambiente di sviluppo non replica la produzione.
    const limiter = createRateLimiter({ max: 1, windowMs: 60_000 });
    const percorso = "/api/test-ip-003";

    const primo = await limiter(
      richiesta(percorso, { "x-forwarded-for": "198.51.100.4, 10.0.0.1" }),
    );
    const secondo = await limiter(
      richiesta(percorso, { "x-forwarded-for": "198.51.100.4, 10.0.0.99" }),
    );

    expect(primo).toBeNull();
    expect(secondo?.status).toBe(429);
  });

  it("[TC-SEC-IP-004] `cf-connecting-ip` non fa piu' da chiave", async () => {
    // PERCHE': l'applicazione e' servita da Vercel, non da Cloudflare. Su
    // Vercel nessuno imposta `cf-connecting-ip`, quindi l'unico che puo'
    // scriverlo e' il client: era una chiave interamente sotto il controllo di
    // chi si vuole limitare. Due valori diversi devono ora finire nello stesso
    // contatore, non in due contatori separati.
    const limiter = createRateLimiter({ max: 1, windowMs: 60_000 });
    const percorso = "/api/test-ip-004";

    const primo = await limiter(richiesta(percorso, { "cf-connecting-ip": "1.2.3.4" }));
    const secondo = await limiter(richiesta(percorso, { "cf-connecting-ip": "5.6.7.8" }));

    expect(primo).toBeNull();
    expect(secondo?.status).toBe(429);
  });

  it("[TC-SEC-IP-005] non-regressione: client con IP di piattaforma diversi restano indipendenti", async () => {
    // Il rovescio della medaglia: irrigidire la chiave non deve trasformare il
    // limitatore in un blocco collettivo. Utenti diversi non devono consumare
    // il contatore altrui.
    const limiter = createRateLimiter({ max: 1, windowMs: 60_000 });
    const percorso = "/api/test-ip-005";

    expect(await limiter(richiesta(percorso, { "x-real-ip": "203.0.113.20" }))).toBeNull();
    expect(await limiter(richiesta(percorso, { "x-real-ip": "203.0.113.21" }))).toBeNull();
    // Il secondo tentativo del PRIMO client, invece, viene rifiutato.
    expect(
      (await limiter(richiesta(percorso, { "x-real-ip": "203.0.113.20" })))?.status,
    ).toBe(429);
  });

  it("[TC-SEC-IP-006] un header di piattaforma vuoto non crea una chiave vuota", async () => {
    // Un header presente ma vuoto (o con soli spazi) non deve essere accettato
    // come identificativo: si passerebbe a una chiave "" condivisa da tutti,
    // con l'effetto opposto a quello voluto in un ambiente e imprevedibile in
    // un altro. Deve scattare il ripiego sull'header successivo.
    const limiter = createRateLimiter({ max: 1, windowMs: 60_000 });
    const percorso = "/api/test-ip-006";

    expect(
      await limiter(
        richiesta(percorso, { "x-real-ip": "   ", "x-forwarded-for": "198.51.100.77" }),
      ),
    ).toBeNull();
    // Stesso `x-forwarded-for` → stesso contatore → rifiutata.
    expect(
      (
        await limiter(
          richiesta(percorso, { "x-real-ip": "", "x-forwarded-for": "198.51.100.77" }),
        )
      )?.status,
    ).toBe(429);
  });
});
