import { ValidazioneError } from "@/lib/prenotazioni-errors";

/**
 * Regole di dominio "pure" sugli orari della biblioteca — SENZA alcuna
 * dipendenza da Prisma — cosi' da poter essere importate sia dal server
 * (src/lib/prenotazioni-service.ts) sia da componenti client (es.
 * src/app/prenota/page.tsx) senza trascinare @prisma/client nel bundle del
 * browser: prenotazioni-service.ts importa `Prisma` come VALORE (non solo
 * come tipo, es. `Prisma.TransactionIsolationLevel.Serializable`), quindi un
 * componente "use client" che lo importasse si porterebbe dietro anche
 * @prisma/client, pensato per girare solo lato server.
 *
 * Questo file e' anche l'unica fonte di verita' per la durata minima/massima
 * di una prenotazione e per il fuso orario della biblioteca: prima il testo
 * mostrato in `/prenota` ("minimo 2 ore") era scritto a mano e non
 * corrispondeva piu' alla regola reale del server (minimo 1 ora, cioe' 60
 * minuti) — leggendo la costante da qui invece di riscriverla, il testo non
 * puo' piu' tornare a divergere.
 */

export const DURATA_MINIMA_PRENOTAZIONE_MINUTI = 60;
export const DURATA_MASSIMA_PRENOTAZIONE_MINUTI = 8 * 60;
export const TIME_ZONE_BIBLIOTECA = "Europe/Rome";

/** Converte "HH:MM" in minuti dalla mezzanotte, validando il formato. */
export function orarioInMinuti(orario: string): number {
  const match = /^(\d{2}):(\d{2})$/.exec(orario);
  if (!match) {
    throw new ValidazioneError(
      "ORARIO_NON_VALIDO",
      "Inserisci un orario valido",
    );
  }

  const ore = Number(match[1]);
  const minuti = Number(match[2]);
  if (ore > 23 || minuti > 59) {
    throw new ValidazioneError(
      "ORARIO_NON_VALIDO",
      "Inserisci un orario valido",
    );
  }

  return ore * 60 + minuti;
}

/** Inverso di `orarioInMinuti`: minuti dalla mezzanotte -> "HH:MM". */
export function minutiInOrario(minuti: number): string {
  const ore = Math.floor(minuti / 60);
  const min = minuti % 60;
  return `${String(ore).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/** minuti -> "1 ora" / "2 ore" / "30 minuti", per messaggi leggibili. */
export function formatDurataMinuti(minuti: number): string {
  if (minuti % 60 === 0) {
    const ore = minuti / 60;
    return `${ore} ${ore === 1 ? "ora" : "ore"}`;
  }
  return `${minuti} minuti`;
}

/**
 * Data odierna (mezzanotte UTC) nel fuso della biblioteca, a partire da un
 * istante assoluto `adesso`. Riceve `adesso` come parametro (invece di
 * leggere `new Date()` al proprio interno) apposta per restare testabile
 * senza mock del clock globale.
 */
export function dataCorrenteBiblioteca(adesso: Date): Date {
  if (Number.isNaN(adesso.getTime())) {
    throw new ValidazioneError("DATA_NON_VALIDA", "Inserisci una data valida");
  }

  const parti = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE_BIBLIOTECA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(adesso);
  const valore = (tipo: Intl.DateTimeFormatPartTypes): number =>
    Number(parti.find((parte) => parte.type === tipo)?.value);

  return new Date(Date.UTC(valore("year"), valore("month") - 1, valore("day")));
}

/**
 * Come `dataCorrenteBiblioteca`, ma per l'orario del giorno (minuti dalla
 * mezzanotte) invece che per la data: serve a capire se una fascia oraria
 * "di oggi" e' gia' iniziata. Riusa `TIME_ZONE_BIBLIOTECA` invece di leggere
 * l'ora in UTC/fuso locale del chiamante (server o browser), perche' un
 * fuso diverso da Europe/Rome calcolerebbe l'ora sbagliata.
 */
export function minutiCorrentiBiblioteca(adesso: Date): number {
  if (Number.isNaN(adesso.getTime())) {
    throw new ValidazioneError("DATA_NON_VALIDA", "Inserisci una data valida");
  }

  const parti = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE_BIBLIOTECA,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(adesso);
  const valore = (tipo: Intl.DateTimeFormatPartTypes): number =>
    Number(parti.find((parte) => parte.type === tipo)?.value);

  return valore("hour") * 60 + valore("minute");
}

/**
 * Le 4 durate proponibili nel wizard di `/prenota` (step 2). Spostate qui da
 * `src/app/prenota/page.tsx` (BUG VISTO IN PRODUZIONE dopo la #73): quella
 * funzione generava opzioni sull'inviluppo apertura/chiusura di TUTTE le sale
 * (es. 08:00-22:00) SENZA mai controllare `DURATA_MASSIMA_PRENOTAZIONE_MINUTI`,
 * cosi' "Mezza giornata (pomeriggio)" (13:00-22:00 = 9h) e "Giornata intera"
 * (08:00-22:00 = 14h) risultavano selezionabili in UI ma venivano SEMPRE
 * rifiutate dal server con DURATA_TROPPO_LUNGA alla conferma finale. Estratta
 * qui (pura, senza dipendenze da React) cosi' e' testabile senza montare il
 * componente, e non puo' piu' divergere dal vero limite di dominio.
 */
export type TipoDurata = "2h" | "mezza_mattina" | "mezza_pomeriggio" | "giornata";

export interface OpzioneDurata {
  id: TipoDurata;
  label: string;
  descrizione: string;
  oraInizio: string;
  oraFine: string;
}

// Confine mattina/pomeriggio delle "mezze giornate": e' una convenzione
// istituzionale (la pausa pranzo), non l'orario di apertura/chiusura di una
// sala specifica, quindi resta fisso mentre apertura/chiusura seguono
// l'inviluppo delle sale (vedi `generaOpzioniDurata`).
const CONFINE_MEZZA_GIORNATA_MINUTI = orarioInMinuti("13:00");

/**
 * Se l'intervallo [inizioMinuti, fineMinuti] supera la durata massima di
 * dominio, lo accorcia spostando l'estremo NON indicato in `estremoFisso`.
 * Serve a garantire che nessuna opzione generata da `generaOpzioniDurata`
 * possa mai superare il limite che il server applica comunque in
 * `validaIntervallo` (src/lib/prenotazioni-service.ts) — invece di scoprire
 * il rifiuto solo alla conferma finale.
 */
function limitaADurataMassima(
  inizioMinuti: number,
  fineMinuti: number,
  estremoFisso: "inizio" | "fine",
): { inizioMinuti: number; fineMinuti: number } {
  const durata = fineMinuti - inizioMinuti;
  if (durata <= DURATA_MASSIMA_PRENOTAZIONE_MINUTI) {
    return { inizioMinuti, fineMinuti };
  }
  if (estremoFisso === "inizio") {
    return { inizioMinuti, fineMinuti: inizioMinuti + DURATA_MASSIMA_PRENOTAZIONE_MINUTI };
  }
  return { inizioMinuti: fineMinuti - DURATA_MASSIMA_PRENOTAZIONE_MINUTI, fineMinuti };
}

/**
 * Genera le 4 opzioni di durata sull'inviluppo `apertura`-`chiusura` di TUTTE
 * le sale, invece che su un orario fisso 09:00-18:00: il wizard chiede la
 * durata (step 2) PRIMA della sala (step 3), quindi qui non si sa ancora
 * quale sala scegliera' l'utente. Le sale incompatibili con l'intervallo
 * scelto vengono poi disabilitate allo step 3/4 (vedi `salaCoprente` in
 * `src/app/prenota/page.tsx`).
 *
 * Ognuna delle tre opzioni ad orario fisso (mattina/pomeriggio/giornata) e'
 * passata da `limitaADurataMassima` PRIMA di finire nel risultato, ancorata
 * all'estremo piu' "naturale" per quell'opzione:
 * - mattina: fissa l'APERTURA (si comincia quando apre la biblioteca) ed
 *   eventualmente accorcia il confine di mezzogiorno;
 * - pomeriggio: fissa la CHIUSURA (si arriva fino a quando chiude) ed
 *   eventualmente posticipa l'inizio;
 * - giornata intera: fissa l'APERTURA (stesso criterio della mattina) ed
 *   eventualmente anticipa la fine, dando le 8 ore piena consentite a partire
 *   dall'apertura invece di un intervallo di 14h sempre rifiutato dal server.
 * Con l'inviluppo attuale (08:00-22:00) questo produce: mattina 08:00-13:00
 * (invariata), pomeriggio 14:00-22:00 (accorciata da 9h a 8h), giornata
 * 08:00-16:00 (accorciata da 14h a 8h).
 */
export function generaOpzioniDurata(apertura: string, chiusura: string): OpzioneDurata[] {
  const aperturaMinuti = orarioInMinuti(apertura);
  const chiusuraMinuti = orarioInMinuti(chiusura);
  // Il confine resta dentro [apertura, chiusura]: cosi' le due mezze
  // giornate non si invertono anche se un giorno l'inviluppo delle sale non
  // dovesse piu' coprire le 13:00.
  const confineMinuti = Math.min(
    Math.max(CONFINE_MEZZA_GIORNATA_MINUTI, aperturaMinuti),
    chiusuraMinuti,
  );

  const mattina = limitaADurataMassima(aperturaMinuti, confineMinuti, "inizio");
  const pomeriggio = limitaADurataMassima(confineMinuti, chiusuraMinuti, "fine");
  const giornata = limitaADurataMassima(aperturaMinuti, chiusuraMinuti, "inizio");

  const mattinaInizio = minutiInOrario(mattina.inizioMinuti);
  const mattinaFine = minutiInOrario(mattina.fineMinuti);
  const pomeriggioInizio = minutiInOrario(pomeriggio.inizioMinuti);
  const pomeriggioFine = minutiInOrario(pomeriggio.fineMinuti);
  const giornataInizio = minutiInOrario(giornata.inizioMinuti);
  const giornataFine = minutiInOrario(giornata.fineMinuti);

  return [
    {
      id: "2h",
      label: "Fascia oraria",
      // Difetto verificato dal vivo in produzione: qui c'era scritto a mano
      // "Scegli uno slot di 2 ore", ma fra gli slot generati da
      // `generaSlotFissi` (in src/app/prenota/page.tsx) c'e' anche quello da
      // 1 ora (quando la chiusura dell'inviluppo non e' un multiplo di 2h
      // dall'apertura). Il testo ora deriva dalla vera durata minima di
      // dominio, non e' piu' scritto a mano: non puo' tornare a divergere.
      descrizione: `Scegli uno slot da ${formatDurataMinuti(DURATA_MINIMA_PRENOTAZIONE_MINUTI)} o 2 ore`,
      oraInizio: "",
      oraFine: "",
    },
    {
      id: "mezza_mattina",
      label: "Mezza giornata (mattina)",
      descrizione: `${mattinaInizio} - ${mattinaFine}`,
      oraInizio: mattinaInizio,
      oraFine: mattinaFine,
    },
    {
      id: "mezza_pomeriggio",
      label: "Mezza giornata (pomeriggio)",
      descrizione: `${pomeriggioInizio} - ${pomeriggioFine}`,
      oraInizio: pomeriggioInizio,
      oraFine: pomeriggioFine,
    },
    {
      id: "giornata",
      label: "Giornata intera",
      descrizione: `${giornataInizio} - ${giornataFine}`,
      oraInizio: giornataInizio,
      oraFine: giornataFine,
    },
  ];
}
