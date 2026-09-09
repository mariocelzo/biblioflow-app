// ============================================================================
// Test dei modi del rate limiter
// ============================================================================
// COSA: verifica che "verifica" non consumi tentativi, che "conta" li
//       consumi senza mai rifiutare, e che il limite continui a scattare.
//
// PERCHE': in produzione la registrazione risultava bloccata con un 429
// ("Troppi tentativi di registrazione") pur non avendo creato alcun account.
// Il limitatore incrementava il contatore all'INIZIO dell'handler, quindi
// anche le richieste poi rifiutate per dati non validi bruciavano un
// tentativo: tre errori di battitura e l'utente restava fuori un'ora.
// Questi test fissano il contratto che impedisce la regressione.

import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { createRateLimiter } from "@/lib/rate-limit";

/**
 * Richiesta con un IP scelto da noi: la chiave del contatore e'
 * `${ip}:${pathname}`, quindi un IP diverso per test li tiene isolati fra loro
 * (lo store vive nel modulo per tutta la durata del file).
 */
function richiesta(ip: string, path = "/api/test") {
  return new NextRequest(`http://localhost${path}`, {
    method: "POST",
    headers: { "x-forwarded-for": ip },
  });
}

describe("rate limiter: modo predefinito (verifica-e-conta)", () => {
  it("[TC-RL-001] consente fino al limite e poi risponde 429", async () => {
    const limiter = createRateLimiter({ max: 3, windowMs: 60_000 });
    const req = richiesta("10.0.0.1");

    // Le prime tre passano.
    expect(await limiter(req)).toBeNull();
    expect(await limiter(req)).toBeNull();
    expect(await limiter(req)).toBeNull();

    const bloccata = await limiter(req);
    expect(bloccata).not.toBeNull();
    expect(bloccata?.status).toBe(429);
  });
});

describe("rate limiter: modo 'verifica'", () => {
  it("[TC-RL-002] non consuma tentativi, per quante volte lo si chiami", async () => {
    const limiter = createRateLimiter({ max: 3, windowMs: 60_000 });
    const req = richiesta("10.0.0.2");

    // Dieci verifiche di fila: nessuna deve incidere sul contatore.
    for (let i = 0; i < 10; i += 1) {
      expect(await limiter(req, "verifica")).toBeNull();
    }

    // Il contatore e' ancora a zero: restano disponibili tutti e tre gli slot.
    expect(await limiter(req, "conta")).toBeNull();
    expect(await limiter(req, "conta")).toBeNull();
    expect(await limiter(req, "conta")).toBeNull();

    // Solo ora la verifica deve rifiutare.
    const bloccata = await limiter(req, "verifica");
    expect(bloccata?.status).toBe(429);
  });

  it("[TC-RL-003] rifiuta quando il limite e' gia' stato raggiunto", async () => {
    const limiter = createRateLimiter({ max: 2, windowMs: 60_000 });
    const req = richiesta("10.0.0.3");

    await limiter(req, "conta");
    await limiter(req, "conta");

    const bloccata = await limiter(req, "verifica");
    expect(bloccata).not.toBeNull();
    expect(bloccata?.status).toBe(429);

    const corpo = await bloccata!.json();
    // Il messaggio deve dire all'utente quanto attendere.
    expect(corpo.retryAfter).toMatch(/secondi/);
  });
});

describe("rate limiter: modo 'conta'", () => {
  it("[TC-RL-004] incrementa ma non rifiuta mai, nemmeno oltre il limite", async () => {
    const limiter = createRateLimiter({ max: 1, windowMs: 60_000 });
    const req = richiesta("10.0.0.4");

    // Anche superando il tetto, "conta" non deve produrre una risposta: viene
    // invocato quando l'operazione e' gia' andata a buon fine e restituire un
    // 429 a quel punto lascerebbe l'utente con un account creato e un errore
    // a schermo.
    expect(await limiter(req, "conta")).toBeNull();
    expect(await limiter(req, "conta")).toBeNull();
    expect(await limiter(req, "conta")).toBeNull();
  });
});

describe("rate limiter: isolamento della chiave", () => {
  it("[TC-RL-005] indirizzi IP diversi hanno contatori indipendenti", async () => {
    const limiter = createRateLimiter({ max: 1, windowMs: 60_000 });

    await limiter(richiesta("10.0.0.5"), "conta");
    // Il secondo IP non deve essere toccato dal consumo del primo.
    expect(await limiter(richiesta("10.0.0.6"), "verifica")).toBeNull();
    expect(await limiter(richiesta("10.0.0.5"), "verifica")).not.toBeNull();
  });

  it("[TC-RL-006] percorsi diversi hanno contatori indipendenti", async () => {
    const limiter = createRateLimiter({ max: 1, windowMs: 60_000 });
    const ip = "10.0.0.7";

    await limiter(richiesta(ip, "/api/uno"), "conta");
    expect(await limiter(richiesta(ip, "/api/due"), "verifica")).toBeNull();
    expect(await limiter(richiesta(ip, "/api/uno"), "verifica")).not.toBeNull();
  });
});
