import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  auth: vi.fn(),
}));

vi.mock("next-auth", () => ({
  default: vi.fn(() => ({
    handlers: {},
    signIn: vi.fn(),
    signOut: vi.fn(),
    auth: authMocks.auth,
  })),
}));

vi.mock("next-auth/providers/credentials", () => ({
  default: vi.fn((options: object) => options),
}));

vi.mock("next-auth/providers/google", () => ({
  default: vi.fn((options: object) => options),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { user: {} },
}));

vi.mock("@/lib/env", () => ({
  env: {
    GOOGLE_CLIENT_ID: undefined,
    GOOGLE_CLIENT_SECRET: undefined,
  },
}));

import {
  assertOwnership,
  requireRole,
  requireUser,
  type AuthenticatedUser,
} from "@/lib/auth";

const student = {
  id: "usr-auth-001",
  email: "studente@biblioflow.test",
  nome: "Studente",
  cognome: "CA01",
  ruolo: "STUDENTE",
  matricola: "CA01001",
  isPendolare: false,
  necessitaAccessibilita: false,
} satisfies AuthenticatedUser;

const librarian = {
  ...student,
  id: "usr-auth-002",
  ruolo: "BIBLIOTECARIO",
} satisfies AuthenticatedUser;

beforeEach(() => {
  authMocks.auth.mockReset();
});

describe("helper identita' dalla sessione (CA-01)", () => {
  it("[TC-BIB26-001] requireUser restituisce l'utente autenticato", async () => {
    authMocks.auth.mockResolvedValue({ user: student });

    await expect(requireUser()).resolves.toEqual(student);
  });

  it("[TC-BIB26-002] requireUser rifiuta una sessione assente con 401", async () => {
    authMocks.auth.mockResolvedValue(null);

    await expect(requireUser()).rejects.toMatchObject({
      name: "AuthError",
      status: 401,
      code: "NON_AUTENTICATO",
    });
  });

  it("[TC-BIB26-003] requireRole restituisce l'utente con ruolo ammesso", async () => {
    authMocks.auth.mockResolvedValue({ user: librarian });

    await expect(requireRole(["BIBLIOTECARIO", "ADMIN"])).resolves.toEqual(
      librarian,
    );
  });

  it("[TC-BIB26-004] requireRole rifiuta un ruolo non ammesso con 403", async () => {
    authMocks.auth.mockResolvedValue({ user: student });

    await expect(requireRole(["ADMIN"])).rejects.toMatchObject({
      status: 403,
      code: "RUOLO_NON_AUTORIZZATO",
    });
  });

  it("[TC-BIB26-005] assertOwnership ammette il proprietario", () => {
    expect(() =>
      assertOwnership({ userId: student.id }, student),
    ).not.toThrow();
  });

  it("[TC-BIB26-006] assertOwnership nasconde allo studente la risorsa altrui", () => {
    expect(() =>
      assertOwnership({ userId: "usr-auth-other" }, student),
    ).toThrowError(
      expect.objectContaining({
        status: 404,
        code: "RISORSA_NON_TROVATA",
      }),
    );
  });

  it("[TC-BIB26-007] assertOwnership nega allo staff la risorsa altrui", () => {
    expect(() =>
      assertOwnership({ userId: "usr-auth-other" }, librarian),
    ).toThrowError(
      expect.objectContaining({
        status: 403,
        code: "RISORSA_NON_AUTORIZZATA",
      }),
    );
  });
});
