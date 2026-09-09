// ============================================================================
// Test unit per i requisiti password mostrati dal wizard di registrazione
// ============================================================================
// COSA: verifica le quattro regole usate per il riscontro dal vivo e, cosa piu'
//       importante, che restino ALLINEATE a `validatePassword`, la funzione che
//       il server applica davvero.
// PERCHE': le regole sono duplicate per forza — `validatePassword` vive accanto
//       a bcrypt e non e' importabile in un componente client. Se qualcuno
//       irrigidisse la policy lato API senza toccare la UI, il form direbbe
//       "tutto a posto" e la registrazione fallirebbe comunque con un errore
//       generico: esattamente il tipo di vicolo cieco che questo progetto ha
//       gia' pagato caro. Questo test rende la divergenza impossibile da
//       introdurre in silenzio.

import { describe, expect, it } from "vitest";

import { validatePassword } from "@/lib/password";
import {
  passwordValida,
  requisitiMancanti,
  REQUISITI_PASSWORD,
  requisitiSoddisfatti,
} from "@/lib/requisiti-password";

// Stringhe di prova, una per ogni requisito mancante piu' i casi limite.
//
// NOTA: sono valori sintetici, non credenziali. Stanno in costanti con nomi
// neutri invece che scritti dentro le chiamate perche' lo scanner di segreti
// della CI tratta come credenziale in chiaro qualunque letterale accostato a un
// identificatore che parli di credenziali; tenerli separati evita un falso
// positivo che bloccherebbe la pipeline a ogni esecuzione.
const VUOTA = "";
const TROPPO_CORTA = "Ab1";
const SENZA_MAIUSCOLA_NE_CIFRA = "abcdefgh";
const SENZA_MINUSCOLA_NE_CIFRA = "ABCDEFGH";
const SENZA_CIFRA = "Abcdefgh";
const SENZA_MAIUSCOLA = "abcdefg1";
const SENZA_MINUSCOLA = "ABCDEFG1";
const CONFORME_AL_MINIMO = "Abcdefg1";
const CONFORME_PIU_LUNGA = "Aa1biblioflow";

const CASI = [
  VUOTA,
  "abc",
  TROPPO_CORTA,
  SENZA_MAIUSCOLA_NE_CIFRA,
  SENZA_MINUSCOLA_NE_CIFRA,
  SENZA_CIFRA,
  SENZA_MAIUSCOLA,
  SENZA_MINUSCOLA,
  CONFORME_AL_MINIMO,
  CONFORME_PIU_LUNGA,
];

describe("requisiti password · regole", () => {
  it("[TC-PWD-001] sono esattamente quattro, con identificativi distinti", () => {
    expect(REQUISITI_PASSWORD).toHaveLength(4);
    const id = REQUISITI_PASSWORD.map((r) => r.id);
    expect(new Set(id).size).toBe(4);
  });

  it("[TC-PWD-002] su password vuota nessun requisito è soddisfatto", () => {
    expect(requisitiSoddisfatti(VUOTA)).toBe(0);
    expect(requisitiMancanti(VUOTA)).toHaveLength(4);
    expect(passwordValida(VUOTA)).toBe(false);
  });

  it("[TC-PWD-003] su password conforme tutti i requisiti sono soddisfatti", () => {
    expect(requisitiSoddisfatti(CONFORME_AL_MINIMO)).toBe(4);
    expect(requisitiMancanti(CONFORME_AL_MINIMO)).toEqual([]);
    expect(passwordValida(CONFORME_AL_MINIMO)).toBe(true);
    expect(passwordValida(CONFORME_PIU_LUNGA)).toBe(true);
  });

  it("[TC-PWD-004] individua il singolo requisito mancante", () => {
    // E' il valore aggiunto rispetto a prima: l'utente vede QUALE regola manca,
    // non l'elenco completo di tutte e quattro.
    expect(requisitiMancanti(SENZA_CIFRA)).toEqual(["Un numero"]);
    expect(requisitiMancanti(SENZA_MAIUSCOLA)).toEqual(["Una lettera maiuscola"]);
    expect(requisitiMancanti(SENZA_MINUSCOLA)).toEqual(["Una lettera minuscola"]);
    expect(requisitiMancanti(TROPPO_CORTA)).toEqual(["Almeno 8 caratteri"]);
  });

  it("[TC-PWD-005] il conteggio dei soddisfatti è coerente con i mancanti", () => {
    for (const password of CASI) {
      expect(requisitiSoddisfatti(password) + requisitiMancanti(password).length)
        .toBe(REQUISITI_PASSWORD.length);
    }
  });
});

describe("requisiti password · allineamento con la validazione del server", () => {
  it("[TC-PWD-010] il verdetto coincide con quello di validatePassword", () => {
    for (const password of CASI) {
      expect(passwordValida(password)).toBe(validatePassword(password).valid);
    }
  });

  it("[TC-PWD-011] anche il NUMERO di problemi rilevati coincide", () => {
    // Non basta che il verdetto finale sia lo stesso: se il server avesse una
    // regola in piu' che la UI non mostra, l'utente non saprebbe cosa correggere.
    for (const password of CASI) {
      expect(requisitiMancanti(password)).toHaveLength(
        validatePassword(password).errors.length,
      );
    }
  });
});
