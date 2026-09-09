// ============================================================================
// Test unit per le esigenze di accessibilità (step 3 della registrazione)
// ============================================================================
// COSA: verifica che le caselle spuntate diventino la singola stringa attesa
//       dall'API e che l'operazione inversa restituisca esattamente le stesse
//       scelte.
// PERCHE': `tipoAccessibilita` deve continuare ad arrivare all'API come una
//       stringa (vincolo: lo schema Zod non si tocca). Tutta la conversione
//       vive in questo modulo, quindi e' qui che una regressione ricadrebbe:
//       un ordine instabile renderebbe non confrontabili due profili identici,
//       e un round-trip imperfetto farebbe perdere le scelte a chi torna
//       indietro nel wizard.

import { describe, expect, it } from "vitest";

import {
  componiTipoAccessibilita,
  ESIGENZE_ACCESSIBILITA,
  estraiEsigenze,
} from "@/lib/esigenze-accessibilita";

describe("esigenze di accessibilità · elenco", () => {
  it("[TC-ACC-001] non ha valori duplicati", () => {
    const valori = ESIGENZE_ACCESSIBILITA.map((e) => e.valore);
    expect(new Set(valori).size).toBe(valori.length);
  });

  it("[TC-ACC-002] descrive per ogni voce cosa offre il servizio", () => {
    // Ogni casella deve dire cosa BiblioFlow fara' in concreto: e' la ragione
    // per cui ha senso dichiarare l'esigenza.
    for (const esigenza of ESIGENZE_ACCESSIBILITA) {
      expect(esigenza.descrizione.length).toBeGreaterThan(0);
      expect(esigenza.icona).toBeTypeOf("object");
    }
  });

  it("[TC-ACC-003] nessun valore contiene il separatore interno", () => {
    // Le voci vengono unite con ", ": un valore che lo contenesse verrebbe
    // spezzato in due dall'operazione inversa.
    for (const esigenza of ESIGENZE_ACCESSIBILITA) {
      expect(esigenza.valore).not.toContain(", ");
    }
  });
});

describe("esigenze di accessibilità · composizione della stringa", () => {
  it("[TC-ACC-010] unisce le voci spuntate in un'unica stringa", () => {
    expect(
      componiTipoAccessibilita(["Mobilità ridotta", "DSA o BES"]),
    ).toBe("Mobilità ridotta, DSA o BES");
  });

  it("[TC-ACC-011] usa sempre l'ordine canonico, non quello dei clic", () => {
    // Due profili con le stesse esigenze devono produrre la STESSA stringa,
    // altrimenti non sarebbero confrontabili ne' raggruppabili.
    const inUnOrdine = componiTipoAccessibilita(["DSA o BES", "Mobilità ridotta"]);
    const nellAltro = componiTipoAccessibilita(["Mobilità ridotta", "DSA o BES"]);
    expect(inUnOrdine).toBe(nellAltro);
  });

  it("[TC-ACC-012] accoda il testo libero dopo le voci note", () => {
    expect(
      componiTipoAccessibilita(["Mobilità ridotta"], "Uso un cane guida"),
    ).toBe("Mobilità ridotta, Uso un cane guida");
  });

  it("[TC-ACC-013] ignora le voci sconosciute e gli spazi inutili", () => {
    expect(componiTipoAccessibilita(["Inventata"], "   ")).toBe("");
  });

  it("[TC-ACC-014] restituisce stringa vuota se non c'è nulla da salvare", () => {
    // L'API scarta i valori vuoti: cosi' il chiamante puo' passarla sempre,
    // senza controlli aggiuntivi nel componente.
    expect(componiTipoAccessibilita([])).toBe("");
  });
});

describe("esigenze di accessibilità · lettura di un valore salvato", () => {
  it("[TC-ACC-020] separa le voci note dal testo libero", () => {
    expect(
      estraiEsigenze("Mobilità ridotta, DSA o BES, Uso un cane guida"),
    ).toEqual({
      selezionate: ["Mobilità ridotta", "DSA o BES"],
      altro: "Uso un cane guida",
    });
  });

  it("[TC-ACC-021] regge il giro completo comporre → estrarre", () => {
    // E' il caso reale: l'utente spunta, va avanti, torna indietro e deve
    // ritrovare le caselle esattamente come le aveva lasciate.
    const selezionate = ["Ipovisione o cecità", "Sensibilità a rumore o luce"];
    const altro = "Ho bisogno di una presa elettrica";
    const composto = componiTipoAccessibilita(selezionate, altro);
    expect(estraiEsigenze(composto)).toEqual({ selezionate, altro });
  });

  it("[TC-ACC-022] su stringa vuota non inventa nulla", () => {
    expect(estraiEsigenze("")).toEqual({ selezionate: [], altro: "" });
  });
});
