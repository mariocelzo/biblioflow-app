// ============================================================================
// ESIGENZE DI ACCESSIBILITA' - opzioni guidate del wizard di registrazione
// ============================================================================
// COSA: le esigenze proposte allo step 3 della registrazione e le funzioni che
//       le trasformano nella stringa attesa dall'API (campo `tipoAccessibilita`).
//
// PERCHE': lo step 3 chiedeva "Tipo di esigenza" con un input vuoto e il
//       placeholder "Es. Mobilità ridotta, DSA...". Chiedere a una persona di
//       DESCRIVERE la propria disabilita' in un campo libero e' la scelta
//       peggiore possibile: e' faticoso, e' esposto (non si sa chi leggera' ne'
//       come sara' usato) e produce un dato che il sistema non sa interpretare
//       per suggerire davvero un posto adatto. Un elenco di caselle da spuntare
//       riduce lo sforzo a un clic, rende esplicito cosa il servizio e' in
//       grado di offrire e resta comunque estendibile col campo "Altro".
//
// VINCOLO: `tipoAccessibilita` deve continuare ad arrivare all'API come una
//       singola stringa. Le caselle vengono quindi unite in una frase; l'API
//       la concatena poi ad `altreNote` con " - " senza rileggerla, quindi il
//       formato interno resta una nostra scelta.

import type { LucideIcon } from "lucide-react";
import { Accessibility, Brain, Ear, Eye, Volume2 } from "lucide-react";

export interface EsigenzaAccessibilita {
  /** Testo che finisce nella stringa inviata all'API. */
  valore: string;
  /** Cosa il sistema fa concretamente con questa informazione. */
  descrizione: string;
  icona: LucideIcon;
}

/**
 * Le esigenze proposte.
 *
 * PERCHE' QUESTE CINQUE: coprono le categorie su cui BiblioFlow puo' agire
 * davvero (posti accessibili, vicinanza alle uscite, postazioni silenziose,
 * tempi di check-in piu' larghi). Non sono una classificazione clinica: ogni
 * voce e' scritta dal punto di vista del SERVIZIO, non della diagnosi, cosi'
 * chi compila sa che dichiarare qualcosa produce un beneficio concreto.
 *
 * Il campo resta facoltativo e chi non si riconosce in nessuna voce puo' usare
 * "Altro" oppure lasciare tutto vuoto.
 */
export const ESIGENZE_ACCESSIBILITA: readonly EsigenzaAccessibilita[] = [
  {
    valore: "Mobilità ridotta",
    descrizione: "Posti raggiungibili senza scale e con spazio di manovra",
    icona: Accessibility,
  },
  {
    valore: "Ipovisione o cecità",
    descrizione: "Postazioni ben illuminate e vicine ai percorsi tattili",
    icona: Eye,
  },
  {
    valore: "Sordità o ipoacusia",
    descrizione: "Avvisi visivi al posto di quelli sonori",
    icona: Ear,
  },
  {
    valore: "DSA o BES",
    descrizione: "Tempi più ampi e materiali in formato accessibile",
    icona: Brain,
  },
  {
    valore: "Sensibilità a rumore o luce",
    descrizione: "Posti in zone silenziose e lontane dai passaggi",
    icona: Volume2,
  },
];

/** Separatore interno alla stringa `tipoAccessibilita`. */
const SEPARATORE = ", ";

/**
 * Unisce le caselle spuntate (e l'eventuale testo libero) in un'unica stringa.
 *
 * L'ordine dell'output segue sempre quello di `ESIGENZE_ACCESSIBILITA`, non
 * quello in cui l'utente ha cliccato: PERCHE' due profili con le stesse
 * esigenze devono produrre la stessa stringa, altrimenti diventa impossibile
 * confrontarli o raggrupparli piu' avanti.
 *
 * Ritorna stringa vuota se non c'e' nulla da salvare, cosi' il chiamante puo'
 * passarla all'API senza controlli aggiuntivi (l'API ignora i valori vuoti).
 */
export function componiTipoAccessibilita(
  selezionate: readonly string[],
  altro = "",
): string {
  const parti = ESIGENZE_ACCESSIBILITA.filter((e) =>
    selezionate.includes(e.valore),
  ).map((e) => e.valore);

  const altroPulito = altro.trim();
  if (altroPulito) parti.push(altroPulito);

  return parti.join(SEPARATORE);
}

/**
 * Operazione inversa di `componiTipoAccessibilita`.
 *
 * PERCHE' SERVE: quando si ricarica il form (o lo si riaprira' dal profilo)
 * bisogna ri-spuntare le caselle giuste a partire dalla stringa salvata,
 * distinguendo le voci note dal testo libero finito in "Altro". Senza questa
 * funzione un utente che torna indietro nel wizard perderebbe le sue scelte.
 */
export function estraiEsigenze(valore: string): {
  selezionate: string[];
  altro: string;
} {
  const pezzi = valore
    .split(SEPARATORE)
    .map((p) => p.trim())
    .filter(Boolean);

  const noti = new Set(ESIGENZE_ACCESSIBILITA.map((e) => e.valore));

  return {
    // Si riordina secondo l'elenco canonico, come fa la funzione di composizione.
    selezionate: ESIGENZE_ACCESSIBILITA.filter((e) =>
      pezzi.includes(e.valore),
    ).map((e) => e.valore),
    altro: pezzi.filter((p) => !noti.has(p)).join(SEPARATORE),
  };
}
