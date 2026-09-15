// ============================================================================
// Il blu di brand deve avere contrasto WCAG AA (>= 4.5:1) su testo normale
// ============================================================================
// PERCHE' ESISTE QUESTO TEST (difetto reale, misurato in produzione il
// 2026-09-15 con i colori RISOLTI dal browser):
//   - tema scuro:  --primary #0A84FF con testo oklch(0.985 0 0) -> 3.49:1
//   - tema chiaro: --primary #007AFF con testo bianco           -> 3.85:1
// Il minimo WCAG AA per testo normale e' 4.5:1: sotto quella soglia i
// pulsanti primari (Accedi, Registrati, Avanti, ...), l'avatar con le
// iniziali e i link colorati di blu (es. "Indietro") sono difficili da
// leggere per chi ha una vista ridotta. Il fix e' descritto nel grande
// commento in cima a src/app/globals.css, insieme alla tabella "prima/dopo".
//
// Questo test NON fissa i colori "a mano": legge i token da globals.css,
// li converte in sRGB e ricalcola i rapporti con la stessa formula WCAG
// usata per la misura originale — cosi', se qualcuno in futuro tocca un
// valore esadecimale senza rifare i conti, il test fallisce PRIMA che il
// difetto torni in produzione.
//
// Due coppie per tema, perche' il blu ha due usi opposti (vedi il commento
// in globals.css):
//   - --primary / --primary-hover: sfondo di bottoni/badge, il testo sopra
//     e' --primary-foreground (quasi bianco in entrambi i temi).
//   - --link / --link-hover: colore del TESTO di link come "Indietro", lo
//     sfondo sotto e' quello della pagina (--background), diverso per tema.

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const CSS_PATH = path.resolve(__dirname, "../../src/app/globals.css");

type RGB = [number, number, number];

/** Estrae il contenuto del blocco `selettore { ... }` piu' vicino all'inizio
 * del file. Nessuna regola qui dentro ha braces annidate (solo dichiarazioni
 * di custom property), quindi un match "non-greedy" fino alla prima `}` e'
 * sufficiente e non rischia di prendere `.high-contrast.dark { ... }` al
 * posto di `.dark { ... }` grazie all'ancoraggio a inizio riga.
 */
function blocco(css: string, selettore: string): string {
  const pattern = new RegExp(
    `(?:^|\\n)${selettore.replace(/[.[\]]/g, "\\$&")}\\s*\\{([^}]*)\\}`,
  );
  const match = css.match(pattern);
  if (!match) {
    throw new Error(`Blocco "${selettore}" non trovato in globals.css`);
  }
  return match[1];
}

/**
 * Legge `--nome: #rrggbb;` dentro un blocco. Segue anche un livello (o piu')
 * di indirezione `--nome: var(--altro-nome);` — e' il caso di `--link` in
 * tema chiaro, che rimanda deliberatamente a `--primary` invece di ripetere
 * lo stesso esadecimale (vedi il commento in globals.css sul perche').
 */
function esadecimale(blocco: string, nome: string, profondita = 0): RGB {
  if (profondita > 5) {
    throw new Error(`Troppi livelli di var(--...) per --${nome}: possibile ciclo`);
  }
  const match = blocco.match(new RegExp(`--${nome}:\\s*([^;]+);`));
  if (!match) {
    throw new Error(`Token --${nome} non trovato`);
  }
  const valore = match[1].trim();

  const riferimento = valore.match(/^var\(--([\w-]+)\)$/);
  if (riferimento) {
    return esadecimale(blocco, riferimento[1], profondita + 1);
  }

  const hexMatch = valore.match(/^#([0-9A-Fa-f]{6})$/);
  if (!hexMatch) {
    throw new Error(`--${nome} vale "${valore}": ne' esadecimale ne' var(--...)`);
  }
  const hex = hexMatch[1];
  return [
    parseInt(hex.slice(0, 2), 16),
    parseInt(hex.slice(2, 4), 16),
    parseInt(hex.slice(4, 6), 16),
  ];
}

/**
 * Legge `--nome: oklch(L C H);` e la converte in sRGB.
 *
 * Qui in globals.css l'unico uso di oklch() e' per grigi puri (chroma 0:
 * `--background`, `--primary-foreground`, ...). Per un colore acromatico la
 * conversione OKLab -> linear sRGB si riduce a r=g=b=L^3 (i tre canali
 * OKLab l_/m_/s_ coincidono quando a=b=0, e la somma dei coefficienti della
 * matrice OKLab->linearRGB per ciascun canale fa esattamente 1). Se in
 * futuro qualcuno scrive un oklch() con chroma diverso da 0 in uno dei token
 * che questo test legge, si vuole un errore esplicito piuttosto che un
 * numero silenziosamente sbagliato: da qui il controllo `chroma !== 0`.
 */
function oklchGrigioAsRgb(blocco: string, nome: string): RGB {
  const match = blocco.match(
    new RegExp(
      `--${nome}:\\s*oklch\\(\\s*([\\d.]+)\\s+([\\d.]+)\\s+([\\d.]+)\\s*\\)\\s*;`,
    ),
  );
  if (!match) {
    throw new Error(`Token --${nome} non trovato (o non oklch)`);
  }
  const L = parseFloat(match[1]);
  const chroma = parseFloat(match[2]);
  if (chroma !== 0) {
    throw new Error(
      `--${nome} ha chroma ${chroma} !== 0: la conversione grayscale di ` +
        `questo test non e' valida, va estesa per gestire oklch cromatici.`,
    );
  }
  const v = Math.pow(L, 3);
  const canale = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
  const c = Math.round(Math.min(1, Math.max(0, canale)) * 255);
  return [c, c, c];
}

function canaleLineare(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function luminanzaRelativa([r, g, b]: RGB): number {
  return 0.2126 * canaleLineare(r) + 0.7152 * canaleLineare(g) + 0.0722 * canaleLineare(b);
}

/** Rapporto di contrasto WCAG 2.x fra due colori sRGB (simmetrico: non
 * importa quale sia "sfondo" e quale "testo"). */
function contrasto(a: RGB, b: RGB): number {
  const l1 = luminanzaRelativa(a);
  const l2 = luminanzaRelativa(b);
  const [chiaro, scuro] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (chiaro + 0.05) / (scuro + 0.05);
}

const MINIMO_AA_TESTO_NORMALE = 4.5;

describe("contrasto WCAG del blu di brand (globals.css)", () => {
  const css = readFileSync(CSS_PATH, "utf8");
  const root = blocco(css, ":root");
  // Il selettore `.dark` compare anche come `.high-contrast.dark` piu' sotto
  // nel file: l'ancoraggio a inizio riga nella regex di `blocco()` evita di
  // prendere quel blocco per sbaglio.
  const dark = blocco(css, ".dark");

  const primaryForegroundChiaro = oklchGrigioAsRgb(root, "primary-foreground");
  const primaryForegroundScuro = oklchGrigioAsRgb(dark, "primary-foreground");
  const backgroundChiaro = oklchGrigioAsRgb(root, "background");
  const backgroundScuro = oklchGrigioAsRgb(dark, "background");

  it("il parsing legge davvero i blocchi giusti (altrimenti il test e' vacuo)", () => {
    // oklch(1 0 0) = bianco puro, oklch(0.145 0 0) = quasi nero: se il
    // parsing avesse preso il blocco sbagliato questi due sarebbero uguali.
    expect(backgroundChiaro).not.toEqual(backgroundScuro);
  });

  it.each([
    [
      "tema chiaro: --primary (sfondo bottone) vs --primary-foreground (testo sopra)",
      () => esadecimale(root, "primary"),
      primaryForegroundChiaro,
    ],
    [
      "tema scuro: --primary (sfondo bottone) vs --primary-foreground (testo sopra)",
      () => esadecimale(dark, "primary"),
      primaryForegroundScuro,
    ],
    [
      "tema chiaro: --primary-hover (sfondo bottone in hover) vs --primary-foreground",
      () => esadecimale(root, "primary-hover"),
      primaryForegroundChiaro,
    ],
    [
      "tema scuro: --primary-hover (sfondo bottone in hover) vs --primary-foreground",
      () => esadecimale(dark, "primary-hover"),
      primaryForegroundScuro,
    ],
    [
      "tema chiaro: --link (testo di 'Indietro', ecc.) vs --background della pagina",
      () => esadecimale(root, "link"),
      backgroundChiaro,
    ],
    [
      "tema scuro: --link (testo di 'Indietro', ecc.) vs --background della pagina",
      () => esadecimale(dark, "link"),
      backgroundScuro,
    ],
    [
      "tema chiaro: --link-hover vs --background della pagina",
      () => esadecimale(root, "link-hover"),
      backgroundChiaro,
    ],
    [
      "tema scuro: --link-hover vs --background della pagina",
      () => esadecimale(dark, "link-hover"),
      backgroundScuro,
    ],
  ] as const)("%s >= 4.5:1", (_descrizione, prendiColore, sfondoOTesto) => {
    const rapporto = contrasto(prendiColore(), sfondoOTesto);
    expect(rapporto).toBeGreaterThanOrEqual(MINIMO_AA_TESTO_NORMALE);
  });

  it("--primary-foreground e' effettivamente quasi bianco in entrambi i temi", () => {
    // Guardia di sanita': se qualcuno lo scurisse parecchio, i contrasti
    // sopra resterebbero "verdi" ma il design apparirebbe rotto (testo grigio
    // scuro su bottone blu). Non e' il difetto che questo file previene, ma
    // e' un'ipotesi su cui si basano tutti i calcoli sopra.
    expect(luminanzaRelativa(primaryForegroundChiaro)).toBeGreaterThan(0.85);
    expect(luminanzaRelativa(primaryForegroundScuro)).toBeGreaterThan(0.85);
  });
});
