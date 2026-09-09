// ============================================================================
// Test unit per il modulo dei comuni della Campania
// ============================================================================
// COSA: verifica l'integrita' dell'elenco (nessun duplicato, ordinamento
//       alfabetico italiano, provincia di Salerno completa) e il comportamento
//       della ricerca con accenti, apostrofi e scritture "attaccate".
// PERCHE': l'elenco e' l'unica sorgente del menu a tendina del wizard di
//       registrazione. Un duplicato manderebbe in errore React (chiavi
//       ripetute nella listbox), un ordinamento sbagliato renderebbe la lista
//       incomprensibile e una ricerca che ignora gli accenti farebbe credere
//       all'utente che il suo comune non esista — proprio nei nomi piu' comuni
//       della zona ("Sant'Angelo", "Cava de' Tirreni", "Santa Maria la Carità").

import { describe, expect, it } from "vitest";

import {
  cercaComuni,
  COMUNI_CAMPANIA,
  etichettaComune,
  normalizzaPerRicerca,
  PROVINCE_CAMPANIA,
  trovaComune,
} from "@/lib/comuni-campania";

describe("comuni della Campania · integrità dell'elenco", () => {
  it("[TC-COMUNI-001] non contiene nomi duplicati", () => {
    // Un duplicato produrrebbe due <li> con la stessa `key` nella listbox.
    const nomi = COMUNI_CAMPANIA.map((c) => c.nome);
    const unici = new Set(nomi);
    expect(unici.size).toBe(nomi.length);
  });

  it("[TC-COMUNI-002] è ordinato alfabeticamente secondo le regole italiane", () => {
    const nomi = COMUNI_CAMPANIA.map((c) => c.nome);
    const attesi = [...nomi].sort((a, b) => a.localeCompare(b, "it"));
    expect(nomi).toEqual(attesi);
  });

  it("[TC-COMUNI-003] contiene tutti e 158 i comuni della provincia di Salerno", () => {
    // E' la provincia dell'ateneo: qui l'esaustivita' e' un requisito, non un
    // di piu'. Il numero e' quello ufficiale dopo la fusione di Capaccio
    // Paestum e la nascita di Bellizzi.
    const salernitani = COMUNI_CAMPANIA.filter(
      (c) => c.provincia === "Salerno",
    );
    expect(salernitani).toHaveLength(158);
  });

  it("[TC-COMUNI-004] copre tutte e cinque le province campane", () => {
    const province = new Set(COMUNI_CAMPANIA.map((c) => c.provincia));
    expect([...province].sort()).toEqual(
      Object.keys(PROVINCE_CAMPANIA).sort(),
    );
  });

  it("[TC-COMUNI-005] associa a ogni comune la sigla della sua provincia", () => {
    for (const comune of COMUNI_CAMPANIA) {
      expect(comune.sigla).toBe(PROVINCE_CAMPANIA[comune.provincia]);
    }
  });

  it("[TC-COMUNI-006] include i capoluoghi e i comuni sede dell'ateneo", () => {
    // Fisciano e Baronissi ospitano i campus: se mancassero, il campo sarebbe
    // inutilizzabile proprio per chi ne ha piu' bisogno.
    const nomi = COMUNI_CAMPANIA.map((c) => c.nome);
    for (const atteso of [
      "Salerno",
      "Napoli",
      "Avellino",
      "Benevento",
      "Caserta",
      "Fisciano",
      "Baronissi",
    ]) {
      expect(nomi).toContain(atteso);
    }
  });

  it("[TC-COMUNI-007] compone l'etichetta con la sigla della provincia", () => {
    // E' il valore che finisce in `tragittoPendolare`: "Da: Agropoli (SA)".
    const agropoli = COMUNI_CAMPANIA.find((c) => c.nome === "Agropoli");
    expect(agropoli && etichettaComune(agropoli)).toBe("Agropoli (SA)");
  });
});

describe("comuni della Campania · normalizzazione del testo", () => {
  it("[TC-COMUNI-010] rimuove gli accenti senza spezzare la parola", () => {
    // Se l'accento venisse tolto DOPO la sostituzione della punteggiatura,
    // "Carità" diventerebbe "carit a" e la ricerca per "carita" fallirebbe.
    expect(normalizzaPerRicerca("Santa Maria la Carità")).toBe(
      "santa maria la carita",
    );
  });

  it("[TC-COMUNI-011] trasforma l'apostrofo in uno spazio", () => {
    expect(normalizzaPerRicerca("Sant'Angelo a Fasanella")).toBe(
      "sant angelo a fasanella",
    );
    expect(normalizzaPerRicerca("Cava de' Tirreni")).toBe("cava de tirreni");
  });

  it("[TC-COMUNI-012] compatta gli spazi in eccesso e taglia i bordi", () => {
    expect(normalizzaPerRicerca("  Nocera   Inferiore  ")).toBe(
      "nocera inferiore",
    );
  });
});

describe("comuni della Campania · ricerca", () => {
  it("[TC-COMUNI-020] con query vuota restituisce l'inizio dell'elenco, non il vuoto", () => {
    // All'apertura del menu la lista non deve MAI essere vuota: un elenco vuoto
    // fa credere che il campo sia rotto.
    const risultati = cercaComuni("", { limite: 10 });
    expect(risultati).toHaveLength(10);
    expect(risultati[0]).toEqual(COMUNI_CAMPANIA[0]);
  });

  it("[TC-COMUNI-021] trova \"Sant'Angelo\" digitando \"sant\"", () => {
    // E' il caso citato nei requisiti: l'apostrofo non deve essere un ostacolo.
    const nomi = cercaComuni("sant").map((c) => c.nome);
    expect(nomi).toContain("Sant'Angelo a Fasanella");
  });

  it("[TC-COMUNI-022] trova i nomi con apostrofo anche scritti tutti attaccati", () => {
    const nomi = cercaComuni("santangelo").map((c) => c.nome);
    expect(nomi).toContain("Sant'Angelo a Fasanella");
    expect(nomi).toContain("Sant'Angelo dei Lombardi");
  });

  it("[TC-COMUNI-023] trova i nomi accentati digitandoli senza accento", () => {
    expect(cercaComuni("carita").map((c) => c.nome)).toEqual([
      "Santa Maria la Carità",
    ]);
  });

  it("[TC-COMUNI-024] ignora maiuscole e spazi ai bordi", () => {
    expect(cercaComuni("  AGROPOLI ").map((c) => c.nome)).toEqual(["Agropoli"]);
  });

  it("[TC-COMUNI-025] cerca anche a metà nome, non solo dall'inizio", () => {
    // "Vallo della Lucania" si cerca spesso partendo dalla seconda parola.
    expect(cercaComuni("lucania").map((c) => c.nome)).toEqual([
      "Vallo della Lucania",
    ]);
  });

  it("[TC-COMUNI-026] mette per primo chi inizia con il testo digitato", () => {
    // Senza il punteggio, "sala" restituirebbe prima un comune che contiene
    // "sala" a meta' nome, e l'utente dovrebbe scorrere per trovare l'ovvio.
    const nomi = cercaComuni("sala").map((c) => c.nome);
    expect(nomi[0]).toBe("Sala Consilina");
  });

  it("[TC-COMUNI-027] rispetta il limite di risultati richiesto", () => {
    // La listbox non deve ricevere centinaia di nodi: sarebbe lenta e
    // illeggibile. Il troncamento viene poi segnalato all'utente.
    expect(cercaComuni("s", { limite: 5 })).toHaveLength(5);
  });

  it("[TC-COMUNI-028] restituisce l'elenco vuoto se non c'è nessuna corrispondenza", () => {
    expect(cercaComuni("zzzznonesiste")).toEqual([]);
  });
});

describe("comuni della Campania · riconoscimento di un valore salvato", () => {
  it("[TC-COMUNI-030] riconosce l'etichetta completa con la sigla", () => {
    expect(trovaComune("Agropoli (SA)")?.nome).toBe("Agropoli");
  });

  it("[TC-COMUNI-031] riconosce anche il solo nome, comunque scritto", () => {
    // Serve per i profili compilati a mano PRIMA di questa modifica, quando il
    // campo era testo libero: non devono risultare irriconoscibili.
    expect(trovaComune("agropoli")?.nome).toBe("Agropoli");
    expect(trovaComune("SANT'ANGELO A FASANELLA")?.nome).toBe(
      "Sant'Angelo a Fasanella",
    );
  });

  it("[TC-COMUNI-032] restituisce undefined per un valore sconosciuto o vuoto", () => {
    expect(trovaComune("Milano")).toBeUndefined();
    expect(trovaComune("   ")).toBeUndefined();
  });
});
