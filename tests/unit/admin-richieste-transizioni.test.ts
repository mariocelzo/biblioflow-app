/**
 * Test per il difetto richieste-transizioni-non-validate.
 *
 * PRIMA: PATCH /api/admin/richieste accettava QUALUNQUE valore dell'enum
 * `StatoRichiesta` come nuovo stato, indipendentemente da quello attuale
 * della richiesta: una richiesta già RIFIUTATA poteva essere spostata a
 * PRONTA_RITIRO, generando una seconda notifica contraddittoria allo
 * studente per lo stesso libro. In più, tornando verso PENDENTE da
 * PRONTA_RITIRO/COMPLETATA, `evasaAt` restava congelato al valore della
 * transizione precedente (Prisma ignora un campo `undefined` nell'update).
 *
 * Questo file verifica:
 *  - le transizioni ammesse (PENDENTE→IN_LAVORAZIONE, IN_LAVORAZIONE→
 *    PRONTA_RITIRO, PRONTA_RITIRO→COMPLETATA, e verso RIFIUTATA/CANCELLATA
 *    dagli stati non terminali) restano permesse;
 *  - una transizione da uno stato TERMINALE (RIFIUTATA/CANCELLATA/
 *    COMPLETATA) o comunque non presente nella mappa risponde 409, senza
 *    scrivere nulla e senza inviare alcuna notifica;
 *  - `evasaAt` viene azzerato esplicitamente (`null`) quando la transizione
 *    ammessa porta FUORI da PRONTA_RITIRO/COMPLETATA.
 */
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
  id: "richiesta-transizioni-1",
  userId: "studente-1",
  libroId: "libro-1",
  libro: { titolo: "Fondazione" },
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
  mocks.prisma.richiestaPreparazione.update.mockResolvedValue({
    ...RICHIESTA_BASE,
    stato: "PENDENTE",
  });
});

describe("richieste-transizioni-non-validate · transizioni bloccate", () => {
  it("[TC-RICH-TRANS-001] RIFIUTATA (terminale) → PRONTA_RITIRO risponde 409 e non scrive nulla", async () => {
    mocks.prisma.richiestaPreparazione.findUnique.mockResolvedValue({
      stato: "RIFIUTATA",
    });

    const res = await route.PATCH(
      richiestaPatch({ id: RICHIESTA_BASE.id, stato: "PRONTA_RITIRO" }),
    );
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error).toBeTruthy();
    expect(mocks.prisma.richiestaPreparazione.update).not.toHaveBeenCalled();
    expect(mocks.prisma.notifica.create).not.toHaveBeenCalled();
  });

  it("[TC-RICH-TRANS-002] COMPLETATA (terminale) → PENDENTE risponde 409", async () => {
    mocks.prisma.richiestaPreparazione.findUnique.mockResolvedValue({
      stato: "COMPLETATA",
    });

    const res = await route.PATCH(
      richiestaPatch({ id: RICHIESTA_BASE.id, stato: "PENDENTE" }),
    );

    expect(res.status).toBe(409);
    expect(mocks.prisma.richiestaPreparazione.update).not.toHaveBeenCalled();
  });

  it("[TC-RICH-TRANS-003] PENDENTE → COMPLETATA (salta stati intermedi) risponde 409", async () => {
    mocks.prisma.richiestaPreparazione.findUnique.mockResolvedValue({
      stato: "PENDENTE",
    });

    const res = await route.PATCH(
      richiestaPatch({ id: RICHIESTA_BASE.id, stato: "COMPLETATA" }),
    );

    expect(res.status).toBe(409);
    expect(mocks.prisma.richiestaPreparazione.update).not.toHaveBeenCalled();
  });

  it("[TC-RICH-TRANS-004] richiesta inesistente → 404, nessuna scrittura", async () => {
    mocks.prisma.richiestaPreparazione.findUnique.mockResolvedValue(null);

    const res = await route.PATCH(
      richiestaPatch({ id: "non-esiste", stato: "IN_LAVORAZIONE" }),
    );

    expect(res.status).toBe(404);
    expect(mocks.prisma.richiestaPreparazione.update).not.toHaveBeenCalled();
  });
});

describe("richieste-transizioni-non-validate · transizioni ammesse restano permesse", () => {
  it("[TC-RICH-TRANS-005] PENDENTE → IN_LAVORAZIONE resta permessa (200)", async () => {
    mocks.prisma.richiestaPreparazione.findUnique.mockResolvedValue({
      stato: "PENDENTE",
    });

    const res = await route.PATCH(
      richiestaPatch({ id: RICHIESTA_BASE.id, stato: "IN_LAVORAZIONE" }),
    );

    expect(res.status).toBe(200);
    expect(mocks.prisma.richiestaPreparazione.update).toHaveBeenCalledTimes(1);
  });

  it("[TC-RICH-TRANS-006] IN_LAVORAZIONE → PRONTA_RITIRO resta permessa e valorizza evasaAt", async () => {
    mocks.prisma.richiestaPreparazione.findUnique.mockResolvedValue({
      stato: "IN_LAVORAZIONE",
    });

    const res = await route.PATCH(
      richiestaPatch({ id: RICHIESTA_BASE.id, stato: "PRONTA_RITIRO" }),
    );

    expect(res.status).toBe(200);
    const arg = mocks.prisma.richiestaPreparazione.update.mock.calls[0][0] as {
      data: { evasaAt: Date | null };
    };
    expect(arg.data.evasaAt).toBeInstanceOf(Date);
  });
});

describe("richieste-transizioni-non-validate · evasaAt azzerato esplicitamente in uscita", () => {
  it("[TC-RICH-TRANS-007] PRONTA_RITIRO → CANCELLATA azzera evasaAt con null esplicito (non undefined)", async () => {
    mocks.prisma.richiestaPreparazione.findUnique.mockResolvedValue({
      stato: "PRONTA_RITIRO",
    });

    const res = await route.PATCH(
      richiestaPatch({ id: RICHIESTA_BASE.id, stato: "CANCELLATA" }),
    );

    expect(res.status).toBe(200);
    const arg = mocks.prisma.richiestaPreparazione.update.mock.calls[0][0] as {
      data: { evasaAt: Date | null };
    };
    // `null` esplicito, non `undefined`: Prisma ignora `undefined` in
    // un update e avrebbe lasciato il vecchio timestamp intatto — esattamente
    // il difetto osservato (evasaAt "congelato" dopo essere usciti da
    // PRONTA_RITIRO).
    expect(arg.data.evasaAt).toBeNull();
    expect("evasaAt" in arg.data).toBe(true);
  });
});
