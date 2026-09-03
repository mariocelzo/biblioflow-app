import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { config, middleware } from "@/middleware";

function request(pathname: string, cookie?: string) {
  return new NextRequest(`http://localhost${pathname}`, {
    method: "POST",
    headers: cookie ? { cookie } : undefined,
  });
}

describe("BIB-51 · protezione middleware lista d'attesa", () => {
  it("[TC-BIB51-001] dichiara esplicitamente la rotta coda nel matcher", () => {
    expect(config.matcher).toContain("/api/prenotazioni/coda/:path*");
  });

  it("[TC-BIB51-002] rifiuta la coda senza sessione con HTTP 401", async () => {
    const response = middleware(request("/api/prenotazioni/coda"));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: "Non autenticato",
    });
  });

  it("[TC-BIB51-003] accetta la coda quando il cookie di sessione è presente", () => {
    const response = middleware(
      request("/api/prenotazioni/coda", "authjs.session-token=test-session"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("[TC-BIB51-004] non indebolisce la protezione delle API admin", () => {
    expect(middleware(request("/api/admin/statistiche")).status).toBe(401);
  });
});
