// ============================================================================
// Test unit per le opzioni del profilo pendolare
// ============================================================================
// COSA: verifica che i valori di "mezzo di trasporto" e "tempo di percorrenza"
//       siano unici e che compongano ancora una frase italiana corretta con il
//       template usato dall'API di registrazione.
// PERCHE': il wizard ha sostituito due campi di testo libero con due elenchi
//       chiusi, ma l'API e' rimasta invariata: continua a costruire
//       `tragittoPendolare` come `Da: … | Mezzo: … | Tempo: … min`. Se qualcuno
//       aggiungesse una fascia scritta male (per esempio "60+ minuti" oppure
//       "45 min") il profilo salverebbe frasi come "Tempo: 45 min min", e nessun
//       test lo intercetterebbe. Questi casi sono la rete di sicurezza del
//       vincolo "non toccare lo schema dell'API".

import { describe, expect, it } from "vitest";

import {
  anteprimaTragittoPendolare,
  FASCE_TEMPO_PERCORRENZA,
  MEZZI_TRASPORTO,
} from "@/lib/profilo-pendolare";

describe("profilo pendolare · mezzi di trasporto", () => {
  it("[TC-PEND-001] copre i mezzi richiesti dal contesto UNISA", () => {
    // "A piedi" serve a chi vive nel campus di Fisciano, "Treno e bus" al
    // tragitto intermodale tipico di chi arriva dalla costiera.
    const valori = MEZZI_TRASPORTO.map((m) => m.valore);
    expect(valori).toContain("A piedi");
    expect(valori).toContain("Bus");
    expect(valori).toContain("Auto");
    expect(valori).toContain("Treno");
    expect(valori).toContain("Bici o monopattino");
    expect(valori).toContain("Treno e bus");
  });

  it("[TC-PEND-002] non ha valori duplicati", () => {
    // I valori sono usati come `key` React e come `value` degli item Radix:
    // un duplicato romperebbe la selezione.
    const valori = MEZZI_TRASPORTO.map((m) => m.valore);
    expect(new Set(valori).size).toBe(valori.length);
  });

  it("[TC-PEND-003] associa a ogni mezzo un'icona e una descrizione", () => {
    for (const mezzo of MEZZI_TRASPORTO) {
      expect(mezzo.icona).toBeTypeOf("object");
      expect(mezzo.descrizione.length).toBeGreaterThan(0);
      // L'etichetta mostrata coincide col valore salvato: e' gia' leggibile,
      // quindi non serve una seconda stringa da tenere allineata.
      expect(mezzo.etichetta).toBe(mezzo.valore);
    }
  });

  it("[TC-PEND-004] nessun valore contiene il separatore usato dall'API", () => {
    // L'API unisce i pezzi con " | ": un valore che lo contenesse renderebbe
    // il campo `tragittoPendolare` ambiguo da rileggere.
    for (const mezzo of MEZZI_TRASPORTO) {
      expect(mezzo.valore).not.toContain("|");
    }
  });
});

describe("profilo pendolare · fasce di tempo", () => {
  it("[TC-PEND-010] propone quattro fasce, dalla più breve alla più lunga", () => {
    expect(FASCE_TEMPO_PERCORRENZA.map((f) => f.valore)).toEqual([
      "meno di 15",
      "15-30",
      "30-60",
      "oltre 60",
    ]);
  });

  it("[TC-PEND-011] non ha valori duplicati", () => {
    const valori = FASCE_TEMPO_PERCORRENZA.map((f) => f.valore);
    expect(new Set(valori).size).toBe(valori.length);
  });

  it("[TC-PEND-012] nessun valore ripete l'unità di misura", () => {
    // L'API aggiunge gia' " min" in coda. Una fascia scritta "45 min"
    // produrrebbe "Tempo: 45 min min".
    for (const fascia of FASCE_TEMPO_PERCORRENZA) {
      expect(fascia.valore).not.toMatch(/min/i);
      expect(fascia.valore).not.toContain("|");
    }
  });
});

describe("profilo pendolare · composizione del tragitto", () => {
  // Il template replicato qui e' quello di
  // src/app/api/auth/registrazione/route.ts, rimasto invariato.

  it("[TC-PEND-020] compone la frase completa nell'ordine atteso dall'API", () => {
    expect(
      anteprimaTragittoPendolare({
        cittaResidenza: "Agropoli (SA)",
        mezzoTrasporto: "Treno e bus",
        tempoPercorrenza: "30-60",
      }),
    ).toBe("Da: Agropoli (SA) | Mezzo: Treno e bus | Tempo: 30-60 min");
  });

  it("[TC-PEND-021] omette i campi non compilati, che restano facoltativi", () => {
    expect(
      anteprimaTragittoPendolare({ cittaResidenza: "Salerno (SA)" }),
    ).toBe("Da: Salerno (SA)");
    expect(
      anteprimaTragittoPendolare({ tempoPercorrenza: "meno di 15" }),
    ).toBe("Tempo: meno di 15 min");
  });

  it("[TC-PEND-022] restituisce null quando non c'è nulla da salvare", () => {
    // L'API salva `null` in questo caso: l'anteprima deve dire la stessa cosa,
    // altrimenti mostrerebbe una stringa vuota fuorviante.
    expect(anteprimaTragittoPendolare({})).toBeNull();
    expect(
      anteprimaTragittoPendolare({
        cittaResidenza: "",
        mezzoTrasporto: "",
        tempoPercorrenza: "",
      }),
    ).toBeNull();
  });

  it("[TC-PEND-023] ogni fascia produce una frase italiana leggibile", () => {
    // Il vero motivo per cui le fasce sono scritte cosi': devono suonare bene
    // una volta che l'API ci attacca " min" in fondo.
    const frasi = FASCE_TEMPO_PERCORRENZA.map((f) =>
      anteprimaTragittoPendolare({ tempoPercorrenza: f.valore }),
    );
    expect(frasi).toEqual([
      "Tempo: meno di 15 min",
      "Tempo: 15-30 min",
      "Tempo: 30-60 min",
      "Tempo: oltre 60 min",
    ]);
  });
});
