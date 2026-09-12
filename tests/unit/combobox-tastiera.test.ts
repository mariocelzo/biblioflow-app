// ============================================================================
// COMBOBOX: navigazione da tastiera
// ============================================================================
// PERCHE' ESISTE QUESTO TEST (difetto reale, osservato in produzione):
// nel combobox dei comuni (step 2 della registrazione) gli attributi ARIA
// c'erano tutti - `role="combobox"`, `aria-activedescendant`, `role="option"` -
// ma i tasti non facevano nulla: due frecce giu' lasciavano
// `aria-activedescendant` fermo sulla prima opzione, Invio non sceglieva, Esc
// non chiudeva. Funzionava solo il mouse.
//
// La causa era doppia:
//   1. il focus veniva spostato nel campo di ricerca dentro un
//      `requestAnimationFrame`, che puo' girare PRIMA che React abbia messo
//      l'input nel DOM: in quel caso `inputRef.current` e' null e il focus
//      resta sul pulsante;
//   2. il gestore dei tasti era agganciato SOLO all'input, quindi con il focus
//      sul pulsante non lo raggiungeva piu' nessun evento. In piu' ogni
//      ArrowDown sul pulsante richiamava `apri()`, che riazzerava l'indice: da
//      qui l'evidenziazione "incollata" alla prima voce.
//
// Il difetto non si vedeva provando con `dispatchEvent`: un evento sintetico
// arriva all'input anche quando il focus e' altrove. Serviva premere i tasti
// per davvero.
//
// COSA CONTROLLA QUESTO FILE: la parte verificabile senza browser, cioe' il
// calcolo dell'evidenziazione (`spostaIndice`) e gli invarianti strutturali del
// componente che, se qualcuno li rimuovesse, farebbero tornare il difetto.
// La prova sul campo (tasti veri su Chrome) resta nel resoconto della PR.

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { spostaIndice } from "@/components/ui/combobox";

const SORGENTE = readFileSync(
  path.resolve(__dirname, "../../src/components/ui/combobox.tsx"),
  "utf8",
);

describe("spostaIndice", () => {
  it("ArrowDown avanza di una posizione", () => {
    expect(spostaIndice("ArrowDown", 0, 16)).toBe(1);
    expect(spostaIndice("ArrowDown", 1, 16)).toBe(2);
  });

  it("due ArrowDown consecutive arrivano alla terza opzione", () => {
    // E' esattamente la sequenza fallita in produzione: restava a 0.
    const dopoPrima = spostaIndice("ArrowDown", 0, 16);
    const dopoSeconda = spostaIndice("ArrowDown", dopoPrima, 16);
    expect(dopoSeconda).toBe(2);
  });

  it("ArrowUp torna indietro e dalla prima voce passa all'ultima", () => {
    expect(spostaIndice("ArrowUp", 5, 16)).toBe(4);
    expect(spostaIndice("ArrowUp", 0, 16)).toBe(15);
  });

  it("ArrowDown sull'ultima voce ricomincia dalla prima", () => {
    expect(spostaIndice("ArrowDown", 15, 16)).toBe(0);
  });

  it("Home e Fine saltano al primo e all'ultimo risultato", () => {
    expect(spostaIndice("Home", 9, 16)).toBe(0);
    expect(spostaIndice("End", 0, 16)).toBe(15);
  });

  it("con la lista vuota resta su 0 e non produce indici impossibili", () => {
    for (const tasto of ["ArrowDown", "ArrowUp", "Home", "End"]) {
      expect(spostaIndice(tasto, 0, 0)).toBe(0);
    }
  });

  it("un indice fuori intervallo viene riportato dentro i limiti", () => {
    // Succede quando una battuta restringe la lista: l'indice precedente puo'
    // puntare oltre l'ultima voce rimasta.
    expect(spostaIndice("ArrowDown", 40, 13)).toBe(0);
    expect(spostaIndice("ArrowUp", -3, 13)).toBe(12);
    expect(spostaIndice("End", 99, 13)).toBe(12);
  });

  it("un tasto non gestito non sposta l'evidenziazione", () => {
    expect(spostaIndice("a", 4, 16)).toBe(4);
    expect(spostaIndice("Enter", 4, 16)).toBe(4);
  });
});

describe("invarianti del componente Combobox", () => {
  it("il gestore dei tasti e' sul contenitore, non solo sul campo di ricerca", () => {
    // Se tornasse solo sull'input, basterebbe di nuovo un focus fuori posto per
    // rendere il combobox inutilizzabile da tastiera.
    expect(SORGENTE).toMatch(/onKeyDown=\{tasti\}/);
    expect(SORGENTE).not.toMatch(/onKeyDown=\{tastiRicerca\}/);
    expect(SORGENTE).not.toMatch(/onKeyDown=\{tastiPulsante\}/);
  });

  it("il focus viene spostato in useLayoutEffect e non in requestAnimationFrame", () => {
    expect(SORGENTE).toMatch(/useLayoutEffect/);
    // Si cerca la CHIAMATA (con la parentesi): i commenti del file citano il
    // nome apposta, per spiegare perche' quella strada e' stata abbandonata.
    expect(SORGENTE).not.toMatch(/requestAnimationFrame\(/);
  });

  it("gestisce tutti i tasti previsti dal pattern ARIA del combobox", () => {
    for (const tasto of [
      "ArrowDown",
      "ArrowUp",
      "Home",
      "End",
      "Enter",
      "Escape",
      "Tab",
    ]) {
      expect(SORGENTE).toContain(`case "${tasto}"`);
    }
  });

  it("aria-selected segue l'opzione evidenziata, non quella gia' salvata", () => {
    // Con `aria-selected={scelta}` l'opzione puntata da `aria-activedescendant`
    // risultava `aria-selected="false"`: chi usa uno screen reader non aveva
    // alcun riscontro dello spostamento.
    expect(SORGENTE).toMatch(/aria-selected=\{attiva\}/);
    expect(SORGENTE).not.toMatch(/aria-selected=\{scelta\}/);
  });
});
