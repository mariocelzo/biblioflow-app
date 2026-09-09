// ============================================================================
// PROFILO PENDOLARE - opzioni guidate del wizard di registrazione
// ============================================================================
// COSA: le scelte fisse per "mezzo di trasporto" e "tempo di percorrenza".
//
// PERCHE': erano due campi di testo libero. Il risultato era un dato non
//       aggregabile ("treno", "Treno", "trenitalia", "treno+bus", "45", "45min",
//       "circa un'ora") che nessuna statistica sul pendolarismo puo' usare, e
//       una richiesta cognitiva inutile per chi compila (deve inventarsi il
//       formato). Con un elenco chiuso la scelta e' un riconoscimento invece
//       che un ricordo (HCI: "recognition rather than recall").
//
// VINCOLO DA RISPETTARE: l'API POST /api/auth/registrazione riceve questi campi
//       come STRINGHE e ne compone `tragittoPendolare` cosi':
//           `Da: {citta} | Mezzo: {mezzo} | Tempo: {tempo} min`
//       I valori qui sotto sono percio' scelti per comporre una frase italiana
//       corretta con quel template, senza toccare l'API ne' il suo schema Zod.

import type { LucideIcon } from "lucide-react";
import { Bike, Bus, Car, Footprints, Route, TrainFront } from "lucide-react";

export interface MezzoTrasporto {
  /** Stringa inviata all'API: finisce dentro `Mezzo: {valore}`. */
  valore: string;
  /** Testo mostrato nel menu (coincide col valore: e' gia' leggibile). */
  etichetta: string;
  /** Riga di aiuto sotto l'etichetta, per disambiguare le scelte simili. */
  descrizione: string;
  icona: LucideIcon;
}

/**
 * I mezzi disponibili, nell'ordine in cui compaiono nel menu.
 *
 * ORDINE SCELTO: dal piu' "vicino" al piu' "lontano" (a piedi → treno + bus).
 * Rispecchia la distanza percorsa e aiuta a trovare la propria voce a colpo
 * d'occhio invece di leggere tutta la lista.
 *
 * PERCHE' "A piedi" IN CIMA: l'ateneo ha alloggi nel campus di Fisciano e
 * molti studenti risiedono nei comuni confinanti; per loro "a piedi" e' la
 * risposta reale, che prima non era prevista da nessun esempio del placeholder.
 *
 * PERCHE' "Treno e bus": il collegamento tipico da Salerno e dalla costiera e'
 * proprio intermodale (treno fino a Salerno o Fisciano, poi navetta). Senza
 * questa voce chi lo usa sarebbe costretto a scegliere il mezzo sbagliato.
 */
export const MEZZI_TRASPORTO: readonly MezzoTrasporto[] = [
  {
    valore: "A piedi",
    etichetta: "A piedi",
    descrizione: "Abito nel campus o nei dintorni",
    icona: Footprints,
  },
  {
    valore: "Bici o monopattino",
    etichetta: "Bici o monopattino",
    descrizione: "Mobilità dolce, tragitti brevi",
    icona: Bike,
  },
  {
    valore: "Auto",
    etichetta: "Auto",
    descrizione: "Mezzo proprio o car pooling",
    icona: Car,
  },
  {
    valore: "Bus",
    etichetta: "Bus",
    descrizione: "Autobus urbano o extraurbano",
    icona: Bus,
  },
  {
    valore: "Treno",
    etichetta: "Treno",
    descrizione: "Regionale o metropolitana",
    icona: TrainFront,
  },
  {
    valore: "Treno e bus",
    etichetta: "Treno e bus",
    descrizione: "Tragitto misto con cambio",
    icona: Route,
  },
];

export interface FasciaTempoPercorrenza {
  /** Stringa inviata all'API: finisce dentro `Tempo: {valore} min`. */
  valore: string;
  /** Testo mostrato nel menu, in italiano esteso. */
  etichetta: string;
}

/**
 * Le fasce di tempo di percorrenza (sola andata).
 *
 * PERCHE' LE FASCE E NON UN NUMERO: il campo era un `<input type="number">`.
 * Un numero esatto e' una precisione FINTA — nessuno sa se il suo tragitto duri
 * 43 o 47 minuti, dipende dal traffico e dalle coincidenze — e costringeva a
 * fermarsi a pensare. Le fasce chiedono una stima, che e' esattamente il grado
 * di certezza che l'utente possiede; per l'uso che il sistema ne fa (capire se
 * concedere il check-in esteso a chi arriva da lontano) la fascia e' del tutto
 * sufficiente. In piu' l'input numerico accettava valori assurdi (-5, 9999)
 * senza alcun controllo.
 *
 * PERCHE' QUESTI VALORI: sono formulati per comporre una frase corretta con il
 * template dell'API, che aggiunge " min" in coda:
 *   "Tempo: meno di 15 min", "Tempo: 15-30 min", "Tempo: oltre 60 min".
 * Cosi' non serve modificare la route di registrazione (vincolo del task) e i
 * profili gia' salvati con un numero secco restano leggibili come prima.
 */
export const FASCE_TEMPO_PERCORRENZA: readonly FasciaTempoPercorrenza[] = [
  { valore: "meno di 15", etichetta: "Meno di 15 minuti" },
  { valore: "15-30", etichetta: "Da 15 a 30 minuti" },
  { valore: "30-60", etichetta: "Da 30 a 60 minuti" },
  { valore: "oltre 60", etichetta: "Più di un'ora" },
];

/**
 * Ricostruisce la frase che l'API salvera' in `tragittoPendolare`.
 *
 * PERCHE' ESISTE: e' una copia FEDELE del template usato in
 * `src/app/api/auth/registrazione/route.ts`. Serve a due cose:
 *  1. mostrare in anteprima all'utente cosa stiamo per salvare sul suo profilo
 *     (trasparenza: e' un requisito HCI del progetto);
 *  2. permettere ai test di verificare che i valori delle costanti qui sopra
 *     compongano ancora una frase sensata, cosi' se qualcuno aggiunge una voce
 *     mal formulata ("60+ minuti") il test lo intercetta prima del rilascio.
 *
 * NON viene chiamata dall'API: la route resta invariata, come da vincolo.
 */
export function anteprimaTragittoPendolare(dati: {
  cittaResidenza?: string;
  mezzoTrasporto?: string;
  tempoPercorrenza?: string;
}): string | null {
  const parti: string[] = [];
  if (dati.cittaResidenza) parti.push(`Da: ${dati.cittaResidenza}`);
  if (dati.mezzoTrasporto) parti.push(`Mezzo: ${dati.mezzoTrasporto}`);
  if (dati.tempoPercorrenza) parti.push(`Tempo: ${dati.tempoPercorrenza} min`);
  return parti.length > 0 ? parti.join(" | ") : null;
}
