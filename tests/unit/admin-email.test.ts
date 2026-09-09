// ============================================================================
// Test di POST /api/admin/email (rilievo #1 dell'audit: bottone "Invia Email")
// ============================================================================
// COSA: il dialog "Invia Email" in utenti-actions.tsx mostrava "Email Inviata"
//       dopo un `setTimeout` di 1.5s, senza ALCUNA chiamata di rete. Questi
//       test verificano che la route reale usi il mailer (src/lib/mailer.ts)
//       e che l'esito riportato al chiamante rispecchi quello vero del
//       mailer, invece di essere sempre un successo.
//
// PERCHE' QUESTI TEST: senza di essi la regressione sarebbe invisibile, dato
// che sia "email inviata" sia "email finta" producono la stessa esperienza
// visiva se non si controlla la richiesta di rete effettivamente fatta.

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  inviaEmail: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));

// Si mocka solo `inviaEmail`, lasciando reale il resto del modulo (i template
// non servono qui, ma cosi' l'export shape resta fedele al modulo vero).
vi.mock("@/lib/mailer", async (importOriginal) => {
  const originale = await importOriginal<typeof import("@/lib/mailer")>();
  return { ...originale, inviaEmail: mocks.inviaEmail };
});

type AdminEmailRoute = typeof import("@/app/api/admin/email/route");

let route: AdminEmailRoute;

const bibliotecario = {
  id: "bibliotecario-1",
  email: "bibliotecario@biblioflow.test",
  ruolo: "BIBLIOTECARIO",
};

const studente = {
  id: "studente-1",
  email: "studente@biblioflow.test",
  ruolo: "STUDENTE",
};

function request(body: object) {
  return new NextRequest("http://localhost/api/admin/email", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

const payloadValido = {
  to: "utente@studenti.unisa.it",
  oggetto: "Comunicazione dalla Biblioteca",
  messaggio: "Il tuo prestito e' in ritardo.",
};

beforeEach(async () => {
  vi.clearAllMocks();
  route = await import("@/app/api/admin/email/route");
});

describe("POST /api/admin/email", () => {
  it("[TC-ADMEMAIL-001] rifiuta chi non e' autenticato", async () => {
    mocks.auth.mockResolvedValue(null);

    const res = await route.POST(request(payloadValido));

    expect(res.status).toBe(401);
    expect(mocks.inviaEmail).not.toHaveBeenCalled();
  });

  it("[TC-ADMEMAIL-002] rifiuta un ruolo non abilitato (STUDENTE)", async () => {
    mocks.auth.mockResolvedValue({ user: studente });

    const res = await route.POST(request(payloadValido));

    expect(res.status).toBe(403);
    expect(mocks.inviaEmail).not.toHaveBeenCalled();
  });

  it("[TC-ADMEMAIL-003] rifiuta un payload con campi mancanti", async () => {
    mocks.auth.mockResolvedValue({ user: bibliotecario });

    const res = await route.POST(request({ to: "x@y.it", oggetto: "", messaggio: "" }));

    expect(res.status).toBe(400);
    expect(mocks.inviaEmail).not.toHaveBeenCalled();
  });

  it("[TC-ADMEMAIL-004] con l'invio riuscito chiama davvero il mailer e risponde successo", async () => {
    mocks.auth.mockResolvedValue({ user: bibliotecario });
    mocks.inviaEmail.mockResolvedValue({ inviata: true, backend: "resend" });

    const res = await route.POST(request(payloadValido));
    const data = await res.json();

    // La chiamata di rete e' avvenuta per davvero: e' questo il fatto che
    // il bottone originale simulava senza farlo mai.
    expect(mocks.inviaEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: payloadValido.to,
        subject: payloadValido.oggetto,
        text: payloadValido.messaggio,
      })
    );
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
  });

  it("[TC-ADMEMAIL-005] se il mailer non e' configurato NON dichiara un successo finto", async () => {
    mocks.auth.mockResolvedValue({ user: bibliotecario });
    mocks.inviaEmail.mockResolvedValue({ inviata: false, motivo: "non_configurato" });

    const res = await route.POST(request(payloadValido));
    const data = await res.json();

    // Questo e' il cuore della regressione: prima l'esito reale del mailer
    // veniva ignorato e si mostrava sempre "Email Inviata". Ora un esito
    // negativo deve propagarsi come errore, non come successo.
    expect(res.status).toBe(502);
    expect(data.success).toBeUndefined();
    expect(data.error).toBeTruthy();
  });

  it("[TC-ADMEMAIL-006] se il provider fallisce l'invio riporta l'errore, non un falso successo", async () => {
    mocks.auth.mockResolvedValue({ user: bibliotecario });
    mocks.inviaEmail.mockResolvedValue({
      inviata: false,
      motivo: "errore_invio",
      dettaglio: "Resend HTTP 500",
    });

    const res = await route.POST(request(payloadValido));
    const data = await res.json();

    expect(res.status).toBe(502);
    expect(data.error).toBeTruthy();
  });
});
