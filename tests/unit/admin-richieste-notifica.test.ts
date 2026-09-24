// ============================================================================
// Test di PATCH /api/admin/richieste — notifica allo studente sull'esito
// ============================================================================
// COSA: la pagina del libro promette esplicitamente allo studente "Riceverai
// una notifica quando sarà pronto" (src/app/libri/[id]/page.tsx,
// handleRichiestaPreparazione). PATCH /api/admin/richieste cambiava però solo
// lo stato della RichiestaPreparazione, senza mai creare una `Notifica`: la
// promessa dell'interfaccia non era mantenuta per nessuno stato.
//
// Questo file verifica che la Notifica venga creata sui tre esiti che
// riguardano davvero lo studente (PRONTA_RITIRO, RIFIUTATA, CANCELLATA), con
// un `actionUrl` che punta a una pagina REALMENTE esistente
// (`/libri/[id]`) — a differenza di `/prenotazioni/coda`, un altro
// `actionUrl` del progetto che risultava rotto (vedi il fix in
// src/lib/automation-service.ts) — e che NON venga creata per una
// transizione puramente interna allo staff (IN_LAVORAZIONE).
//
// Mock-based (nessun DB): qui si verifica solo CHE la scrittura avvenga con i
// campi giusti, non la sua persistenza reale.

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  prisma: {
    richiestaPreparazione: { findUnique: vi.fn(), update: vi.fn() },
    notifica: { create: vi.fn() },
  },
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/rate-limit", () => ({
  staffCriticalApiRateLimiter: vi.fn(async () => null),
}));

type AdminRichiesteRoute = typeof import("@/app/api/admin/richieste/route");

let route: AdminRichiesteRoute;

const bibliotecario = {
  id: "bibliotecario-1",
  email: "bibliotecario@biblioflow.test",
  ruolo: "BIBLIOTECARIO",
};

const RICHIESTA_BASE = {
  id: "richiesta-1",
  userId: "studente-1",
  libroId: "libro-1",
  libro: { titolo: "Il nome della rosa" },
};

function richiestaPatch(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/admin/richieste", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(async () => {
  vi.resetAllMocks();
  route = await import("@/app/api/admin/richieste/route");
  mocks.auth.mockResolvedValue({ user: bibliotecario });
  // Stato di partenza di default: PENDENTE. La rotta ora legge lo stato
  // ATTUALE prima di scrivere (difetto richieste-transizioni-non-validate):
  // senza questo mock ogni test fallirebbe con 409 "transizione non
  // consentita". I singoli test che partono da uno stato diverso lo
  // sovrascrivono.
  mocks.prisma.richiestaPreparazione.findUnique.mockResolvedValue({
    stato: "PENDENTE",
  });
});

describe("PATCH /api/admin/richieste · notifica sugli esiti rilevanti per lo studente", () => {
  it("[TC-RICH-NOTIF-001] PRONTA_RITIRO crea una Notifica con actionUrl verso la pagina del libro", async () => {
    mocks.prisma.richiestaPreparazione.findUnique.mockResolvedValue({
      stato: "IN_LAVORAZIONE",
    });
    mocks.prisma.richiestaPreparazione.update.mockResolvedValue({
      ...RICHIESTA_BASE,
      stato: "PRONTA_RITIRO",
    });

    const res = await route.PATCH(
      richiestaPatch({ id: RICHIESTA_BASE.id, stato: "PRONTA_RITIRO" }),
    );

    expect(res.status).toBe(200);
    expect(mocks.prisma.notifica.create).toHaveBeenCalledTimes(1);
    const chiamata = mocks.prisma.notifica.create.mock.calls[0][0];
    expect(chiamata.data.userId).toBe(RICHIESTA_BASE.userId);
    expect(chiamata.data.messaggio).toContain("Il nome della rosa");
    // Rotta REALMENTE esistente (src/app/libri/[id]/page.tsx), non
    // `/prenotazioni/coda` come l'altro actionUrl rotto trovato nel progetto.
    expect(chiamata.data.actionUrl).toBe(`/libri/${RICHIESTA_BASE.libroId}`);
  });

  it("[TC-RICH-NOTIF-002] RIFIUTATA crea una Notifica", async () => {
    mocks.prisma.richiestaPreparazione.update.mockResolvedValue({
      ...RICHIESTA_BASE,
      stato: "RIFIUTATA",
    });

    await route.PATCH(richiestaPatch({ id: RICHIESTA_BASE.id, stato: "RIFIUTATA" }));

    expect(mocks.prisma.notifica.create).toHaveBeenCalledTimes(1);
    const chiamata = mocks.prisma.notifica.create.mock.calls[0][0];
    expect(chiamata.data.titolo.toLowerCase()).toContain("rifiutata");
  });

  it("[TC-RICH-NOTIF-003] CANCELLATA crea una Notifica", async () => {
    mocks.prisma.richiestaPreparazione.update.mockResolvedValue({
      ...RICHIESTA_BASE,
      stato: "CANCELLATA",
    });

    await route.PATCH(richiestaPatch({ id: RICHIESTA_BASE.id, stato: "CANCELLATA" }));

    expect(mocks.prisma.notifica.create).toHaveBeenCalledTimes(1);
    const chiamata = mocks.prisma.notifica.create.mock.calls[0][0];
    expect(chiamata.data.titolo).toContain("annullata");
  });

  it("[TC-RICH-NOTIF-004] IN_LAVORAZIONE (transizione interna allo staff) NON crea alcuna Notifica", async () => {
    mocks.prisma.richiestaPreparazione.update.mockResolvedValue({
      ...RICHIESTA_BASE,
      stato: "IN_LAVORAZIONE",
    });

    const res = await route.PATCH(
      richiestaPatch({ id: RICHIESTA_BASE.id, stato: "IN_LAVORAZIONE" }),
    );

    expect(res.status).toBe(200);
    expect(mocks.prisma.notifica.create).not.toHaveBeenCalled();
  });
});
