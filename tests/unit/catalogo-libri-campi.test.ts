import { describe, expect, it } from "vitest";
import { arricchisciLibro } from "@/lib/catalogo-libri";

const base = { anno: 2008, scaffale: "B3", piano: 2, copieDisponibili: 3 };

describe("arricchisciLibro", () => {
  it("con copie libere il libro e' disponibile", () => {
    expect(arricchisciLibro(base).disponibile).toBe(true);
  });

  it("senza copie libere non e' disponibile", () => {
    expect(arricchisciLibro({ ...base, copieDisponibili: 0 }).disponibile).toBe(false);
  });

  it("espone annoPubblicazione e posizione e conserva i campi originali", () => {
    const r = arricchisciLibro(base);
    expect(r.annoPubblicazione).toBe(2008);
    expect(r.posizione).toBe("Piano 2 - Scaffale B3");
    expect(r.anno).toBe(2008);
    expect(r.scaffale).toBe("B3");
  });

  it("posizione assente se mancano scaffale e piano", () => {
    expect(arricchisciLibro({ ...base, scaffale: null, piano: null }).posizione).toBeNull();
  });

  it("piano 0 e' un piano valido", () => {
    expect(arricchisciLibro({ ...base, scaffale: null, piano: 0 }).posizione).toBe("Piano 0");
  });
});
