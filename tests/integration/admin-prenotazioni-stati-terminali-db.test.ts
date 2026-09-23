/**
 * 🧪 TEST DI INTEGRAZIONE (DB) — POST /api/admin/prenotazioni: transizioni da
 * stati conclusi e liberazione del posto
 *
 * COSA VERIFICA:
 *  1. ANNULLA_SINGOLA/ANNULLA_MULTIPLE rifiutano (o saltano) una prenotazione
 *     già COMPLETATA/NO_SHOW/CANCELLATA invece di riscriverne lo stato;
 *  2. CHECK_IN_MANUALE rifiuta una prenotazione che non è CONFERMATA (prima
 *     ammetteva il check-in di una prenotazione CANCELLATA/NO_SHOW/SCADUTA);
 *  3. MODIFICA rifiuta una prenotazione già conclusa;
 *  4. cancellare una prenotazione NON deve liberare un Posto occupato da
 *     UN'ALTRA prenotazione (il difetto verificato: il codice originale
 *     guardava `posto.stato === "OCCUPATO"`, uno stato globale del posto, non
 *     "è questa prenotazione ad occuparlo").
 *
 * PERCHÉ INTEGRAZIONE (DB reale): il punto 4 è una relazione fra due righe
 * (Prenotazione + Posto) che un Prisma mockato non potrebbe verificare in
 * modo credibile — è esattamente il tipo di difetto (di relazione fra righe,
 * non di singola query) sfuggito nella PR #67 e che un test unitario con
 * mock non avrebbe intercettato.
 *
 * STRATEGIA: si mocka solo `@/lib/auth` (sessione staff finta) e
 * `@/lib/rate-limit`; `@/lib/prisma` è il client reale contro il database di
 * test. Righe create con id con prefisso dedicato e ripulite prima/dopo.
 */

import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn() }));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/rate-limit", () => ({
  staffCriticalApiRateLimiter: vi.fn(async () => null),
}));

const { prisma } = await import("@/lib/prisma");
const adminPrenotazioniRoute = await import("@/app/api/admin/prenotazioni/route");

const PREFISSO = "adminpren-term";
const SALA_ID = `${PREFISSO}-sala`;
const STUDENTE_ID = `${PREFISSO}-studente`;
const STAFF = {
  id: `${PREFISSO}-staff`,
  email: "staff-term@biblioflow.test",
  ruolo: "BIBLIOTECARIO",
};

function richiestaAdmin(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/admin/prenotazioni", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Crea un posto isolato per il singolo test (evita interferenze fra `it`). */
async function creaPosto(suffisso: string, stato: "DISPONIBILE" | "OCCUPATO" = "DISPONIBILE") {
  return prisma.posto.create({
    data: {
      id: `${PREFISSO}-posto-${suffisso}`,
      numero: `T-${suffisso}`,
      salaId: SALA_ID,
      coordinataX: 1,
      coordinataY: 1,
      stato,
    },
  });
}

/** Crea una prenotazione isolata; `data`/orario diversi per ogni test, per non farle sovrapporre. */
async function creaPrenotazione(opts: {
  id: string;
  postoId: string;
  stato: "CONFERMATA" | "CHECK_IN" | "COMPLETATA" | "CANCELLATA" | "NO_SHOW" | "SCADUTA";
  oraInizio: string;
  oraFine: string;
}) {
  return prisma.prenotazione.create({
    data: {
      id: opts.id,
      userId: STUDENTE_ID,
      postoId: opts.postoId,
      data: new Date("2030-03-01T00:00:00.000Z"),
      oraInizio: new Date(`1970-01-01T${opts.oraInizio}:00.000Z`),
      oraFine: new Date(`1970-01-01T${opts.oraFine}:00.000Z`),
      stato: opts.stato,
    },
  });
}

async function pulisci() {
  await prisma.logEvento.deleteMany({ where: { userId: STUDENTE_ID } });
  await prisma.notifica.deleteMany({ where: { userId: STUDENTE_ID } });
  await prisma.prenotazione.deleteMany({ where: { userId: STUDENTE_ID } });
  await prisma.posto.deleteMany({ where: { salaId: SALA_ID } });
  await prisma.sala.deleteMany({ where: { id: SALA_ID } });
  await prisma.user.deleteMany({ where: { id: STUDENTE_ID } });
}

beforeAll(async () => {
  await pulisci();
  await prisma.user.create({
    data: {
      id: STUDENTE_ID,
      email: `${STUDENTE_ID}@biblioflow.test`,
      nome: "Test",
      cognome: "Studente",
      ruolo: "STUDENTE",
      matricola: STUDENTE_ID,
      emailVerificata: true,
    },
  });
  await prisma.sala.create({
    data: { id: SALA_ID, nome: "Sala fixture terminali", piano: 1, capienzaMax: 10 },
  });
});

beforeEach(async () => {
  await prisma.logEvento.deleteMany({ where: { userId: STUDENTE_ID } });
  await prisma.notifica.deleteMany({ where: { userId: STUDENTE_ID } });
  await prisma.prenotazione.deleteMany({ where: { userId: STUDENTE_ID } });
  await prisma.posto.deleteMany({ where: { salaId: SALA_ID } });
  mocks.auth.mockReset();
  mocks.auth.mockResolvedValue({ user: STAFF });
});

afterAll(async () => {
  await pulisci();
  await prisma.$disconnect();
});

describe("POST /api/admin/prenotazioni · ANNULLA_SINGOLA su stati conclusi", () => {
  it("rifiuta con 400 l'annullamento di una prenotazione già COMPLETATA (non la riscrive)", async () => {
    const posto = await creaPosto("annulla-singola-completata");
    const pren = await creaPrenotazione({
      id: `${PREFISSO}-pren-completata`,
      postoId: posto.id,
      stato: "COMPLETATA",
      oraInizio: "09:00",
      oraFine: "10:00",
    });

    const risposta = await adminPrenotazioniRoute.POST(
      richiestaAdmin({ azione: "ANNULLA_SINGOLA", prenotazioneId: pren.id }),
    );

    expect(risposta.status).toBe(400);

    const invariata = await prisma.prenotazione.findUniqueOrThrow({ where: { id: pren.id } });
    expect(invariata.stato).toBe("COMPLETATA");
  });

  it("annulla regolarmente una prenotazione CONFERMATA", async () => {
    const posto = await creaPosto("annulla-singola-confermata");
    const pren = await creaPrenotazione({
      id: `${PREFISSO}-pren-confermata`,
      postoId: posto.id,
      stato: "CONFERMATA",
      oraInizio: "09:00",
      oraFine: "10:00",
    });

    const risposta = await adminPrenotazioniRoute.POST(
      richiestaAdmin({ azione: "ANNULLA_SINGOLA", prenotazioneId: pren.id }),
    );

    expect(risposta.status).toBe(200);

    const aggiornata = await prisma.prenotazione.findUniqueOrThrow({ where: { id: pren.id } });
    expect(aggiornata.stato).toBe("CANCELLATA");
  });

  it("annullando una prenotazione CONFERMATA non libera un posto occupato da UN'ALTRA prenotazione", async () => {
    // Stesso posto, due prenotazioni distinte in fasce orarie diverse: Y ha
    // fatto check-in (occupa DAVVERO il posto adesso), X è solo confermata
    // per un'altra fascia e viene annullata dallo staff.
    const posto = await creaPosto("condiviso", "OCCUPATO");
    const prenY = await creaPrenotazione({
      id: `${PREFISSO}-pren-y-checkin`,
      postoId: posto.id,
      stato: "CHECK_IN",
      oraInizio: "09:00",
      oraFine: "11:00",
    });
    const prenX = await creaPrenotazione({
      id: `${PREFISSO}-pren-x-confermata`,
      postoId: posto.id,
      stato: "CONFERMATA",
      oraInizio: "14:00",
      oraFine: "16:00",
    });

    const risposta = await adminPrenotazioniRoute.POST(
      richiestaAdmin({ azione: "ANNULLA_SINGOLA", prenotazioneId: prenX.id }),
    );

    expect(risposta.status).toBe(200);

    const xAggiornata = await prisma.prenotazione.findUniqueOrThrow({ where: { id: prenX.id } });
    expect(xAggiornata.stato).toBe("CANCELLATA");

    // Il difetto verificato: il posto NON deve tornare DISPONIBILE, perché è
    // ancora occupato fisicamente dalla prenotazione Y (CHECK_IN), non da X.
    const postoDopo = await prisma.posto.findUniqueOrThrow({ where: { id: posto.id } });
    expect(postoDopo.stato).toBe("OCCUPATO");

    // Y non deve essere stata toccata.
    const yInvariata = await prisma.prenotazione.findUniqueOrThrow({ where: { id: prenY.id } });
    expect(yInvariata.stato).toBe("CHECK_IN");
  });

  it("annullando la prenotazione che occupa DAVVERO il posto (CHECK_IN), il posto torna DISPONIBILE", async () => {
    const posto = await creaPosto("check-in-proprio", "OCCUPATO");
    const pren = await creaPrenotazione({
      id: `${PREFISSO}-pren-checkin-proprio`,
      postoId: posto.id,
      stato: "CHECK_IN",
      oraInizio: "09:00",
      oraFine: "10:00",
    });

    const risposta = await adminPrenotazioniRoute.POST(
      richiestaAdmin({ azione: "ANNULLA_SINGOLA", prenotazioneId: pren.id }),
    );

    expect(risposta.status).toBe(200);

    const postoDopo = await prisma.posto.findUniqueOrThrow({ where: { id: posto.id } });
    expect(postoDopo.stato).toBe("DISPONIBILE");
  });
});

describe("POST /api/admin/prenotazioni · ANNULLA_MULTIPLE salta le righe già concluse", () => {
  it("cancella solo le prenotazioni annullabili e riporta quante sono state saltate", async () => {
    const posto1 = await creaPosto("multi-1");
    const posto2 = await creaPosto("multi-2");
    const posto3 = await creaPosto("multi-3");

    const confermata = await creaPrenotazione({
      id: `${PREFISSO}-multi-confermata`,
      postoId: posto1.id,
      stato: "CONFERMATA",
      oraInizio: "09:00",
      oraFine: "10:00",
    });
    const completata = await creaPrenotazione({
      id: `${PREFISSO}-multi-completata`,
      postoId: posto2.id,
      stato: "COMPLETATA",
      oraInizio: "09:00",
      oraFine: "10:00",
    });
    const noShow = await creaPrenotazione({
      id: `${PREFISSO}-multi-noshow`,
      postoId: posto3.id,
      stato: "NO_SHOW",
      oraInizio: "09:00",
      oraFine: "10:00",
    });

    const risposta = await adminPrenotazioniRoute.POST(
      richiestaAdmin({
        azione: "ANNULLA_MULTIPLE",
        prenotazioneIds: [confermata.id, completata.id, noShow.id],
      }),
    );

    expect(risposta.status).toBe(200);
    const body = await risposta.json();
    expect(body.saltate).toBe(2);
    expect(String(body.message)).toContain("1");

    const confermataDopo = await prisma.prenotazione.findUniqueOrThrow({ where: { id: confermata.id } });
    expect(confermataDopo.stato).toBe("CANCELLATA");

    const completataDopo = await prisma.prenotazione.findUniqueOrThrow({ where: { id: completata.id } });
    expect(completataDopo.stato).toBe("COMPLETATA");

    const noShowDopo = await prisma.prenotazione.findUniqueOrThrow({ where: { id: noShow.id } });
    expect(noShowDopo.stato).toBe("NO_SHOW");
  });
});

describe("POST /api/admin/prenotazioni · CHECK_IN_MANUALE richiede CONFERMATA", () => {
  it("rifiuta il check-in manuale di una prenotazione CANCELLATA", async () => {
    const posto = await creaPosto("checkin-manuale-cancellata");
    const pren = await creaPrenotazione({
      id: `${PREFISSO}-checkin-manuale-cancellata`,
      postoId: posto.id,
      stato: "CANCELLATA",
      oraInizio: "09:00",
      oraFine: "10:00",
    });

    const risposta = await adminPrenotazioniRoute.POST(
      richiestaAdmin({ azione: "CHECK_IN_MANUALE", prenotazioneId: pren.id }),
    );

    expect(risposta.status).toBe(400);

    const invariata = await prisma.prenotazione.findUniqueOrThrow({ where: { id: pren.id } });
    expect(invariata.stato).toBe("CANCELLATA");

    const postoInvariato = await prisma.posto.findUniqueOrThrow({ where: { id: posto.id } });
    expect(postoInvariato.stato).toBe("DISPONIBILE");
  });

  it("accetta il check-in manuale di una prenotazione CONFERMATA", async () => {
    const posto = await creaPosto("checkin-manuale-confermata");
    const pren = await creaPrenotazione({
      id: `${PREFISSO}-checkin-manuale-confermata`,
      postoId: posto.id,
      stato: "CONFERMATA",
      oraInizio: "09:00",
      oraFine: "10:00",
    });

    const risposta = await adminPrenotazioniRoute.POST(
      richiestaAdmin({ azione: "CHECK_IN_MANUALE", prenotazioneId: pren.id }),
    );

    expect(risposta.status).toBe(200);

    const aggiornata = await prisma.prenotazione.findUniqueOrThrow({ where: { id: pren.id } });
    expect(aggiornata.stato).toBe("CHECK_IN");

    const postoDopo = await prisma.posto.findUniqueOrThrow({ where: { id: posto.id } });
    expect(postoDopo.stato).toBe("OCCUPATO");
  });
});

describe("POST /api/admin/prenotazioni · MODIFICA rifiuta una prenotazione conclusa", () => {
  it("rifiuta la modifica di data/ora su una prenotazione NO_SHOW", async () => {
    const posto = await creaPosto("modifica-noshow");
    const pren = await creaPrenotazione({
      id: `${PREFISSO}-modifica-noshow`,
      postoId: posto.id,
      stato: "NO_SHOW",
      oraInizio: "09:00",
      oraFine: "10:00",
    });

    const risposta = await adminPrenotazioniRoute.POST(
      richiestaAdmin({
        azione: "MODIFICA",
        prenotazioneId: pren.id,
        nuoviDati: { data: "2030-04-01" },
      }),
    );

    expect(risposta.status).toBe(400);

    const invariata = await prisma.prenotazione.findUniqueOrThrow({ where: { id: pren.id } });
    expect(invariata.data.toISOString().slice(0, 10)).toBe("2030-03-01");
    expect(invariata.stato).toBe("NO_SHOW");
  });
});
