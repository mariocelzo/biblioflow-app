// ============================================================================
// Test di runAllAutomations — isolamento dei passi del cron
// ============================================================================
// COSA: se il database fallisce, ogni passo delle automazioni (promemoria,
//       avvisi prestiti, scadenza promozioni, no-show, completamenti) deve
//       fallire da solo, venire registrato in `errors` e non impedire agli
//       altri passi di essere tentati.
// PERCHE': il cron gira ogni 5 minuti senza nessuno che lo osservi. Un errore
//       nel primo passo che interrompesse la catena bloccherebbe in silenzio
//       il rilascio dei posti e la promozione della lista d'attesa. I rami
//       d'errore di `runAllAutomations` non erano mai stati eseguiti.

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const chiamate: string[] = [];
  // Ogni accesso a `prisma.<modello>.<metodo>` (e `$transaction`, `$queryRaw`
  // ecc.) registra il nome e fallisce come farebbe un database irraggiungibile.
  const fallisce = (nome: string) =>
    vi.fn(async () => {
      chiamate.push(nome);
      throw new Error(`database irraggiungibile (${nome})`);
    });
  const prisma = new Proxy(
    {},
    {
      get: (_t, modello: string) =>
        modello.startsWith("$")
          ? fallisce(modello)
          : new Proxy({}, { get: (_m, metodo: string) => fallisce(`${modello}.${metodo}`) }),
    },
  );
  return { prisma, chiamate };
});

vi.mock("@/lib/prisma", () => ({ default: mocks.prisma, prisma: mocks.prisma }));

const { runAllAutomations } = await import("@/lib/automation-service");

beforeEach(() => {
  mocks.chiamate.length = 0;
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("runAllAutomations", () => {
  it("[TC-AUTO-ISO-001] un database guasto fa fallire ogni passo singolarmente, senza interrompere la catena", async () => {
    const esito = await runAllAutomations();

    expect(esito.errors).toHaveLength(5);
    expect(esito.errors.map((e) => e.split(":")[0])).toEqual([
      "Reminders",
      "Loan alerts",
      "Promozioni scadute",
      "No-shows",
      "Completamenti automatici",
    ]);
    // I contatori restano ai valori iniziali: nessun passo dichiara un lavoro mai fatto.
    expect(esito).toMatchObject({
      reminders: { sent: 0 },
      loanAlerts: { sent: 0 },
      noShows: { released: 0, promoted: 0 },
      promozioniScadute: { scadute: 0, promozioniInnescate: 0 },
      completamenti: { completed: 0 },
    });
    expect(esito.timestamp).toBeInstanceOf(Date);
  });

  it("[TC-AUTO-ISO-002] tutti e cinque i passi vengono comunque tentati", async () => {
    await runAllAutomations();
    // Almeno un accesso al database per ogni passo: cinque fallimenti distinti.
    expect(mocks.chiamate.length).toBeGreaterThanOrEqual(5);
  });
});
