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
 * Minuti che la finestra di check-in resta aperta PRIMA dell'orario di
 * inizio dichiarato. Costante unica condivisa dai tre percorsi che possono
 * eseguire un check-in (POST /api/prenotazioni/[id]/check-in, PATCH
 * /api/prenotazioni/[id] azione "check-in", e lo scanner bibliotecario in
 * /api/admin/scanner/validate): prima ciascuno ricalcolava la finestra per
 * conto proprio, con "15" scritto a mano in tre punti diversi e, in due casi
 * su tre, con un bug di fuso orario che la rendeva inapplicabile (vedi
 * `valutaFinestraCheckIn` piu' sotto).
 */
export const ANTICIPO_CHECK_IN_MINUTI = 15;

/**
 * Minuti di tolleranza DOPO l'inizio concessi dallo SCANNER del
 * bibliotecario prima di considerare il check-in "scaduto" e annullare la
 * prenotazione come NO_SHOW. Testo promesso in
 * src/app/admin/scanner/page.tsx: "Il check-in può essere effettuato da 15
 * min prima fino a 15 min dopo l'inizio". Il check-in AUTONOMO dello
 * studente (POST/PATCH) non concede questa tolleranza: si chiude esattamente
 * all'orario di inizio (tolleranza 0, il valore di default di
 * `valutaFinestraCheckIn`) — lo studente resta CONFERMATA fino al passaggio
 * del cron di rilascio no-show, che applica la propria soglia sul database
 * (vedi releaseNoShowReservations in src/lib/automation-service.ts).
 */
export const TOLLERANZA_CHECK_IN_SCANNER_MINUTI = 15;

/** Esito di `valutaFinestraCheckIn`. */
export type EsitoFinestraCheckIn =
  | { consentito: true }
  | { consentito: false; motivo: "troppo_presto"; minutiMancanti?: number }
  | { consentito: false; motivo: "scaduto"; minutiRitardo?: number };

/**
 * Stabilisce se il check-in e' consentito ORA per una prenotazione di un
 * certo giorno/ora, confrontando SEMPRE nel fuso della biblioteca
 * (Europe/Rome) — mai sui millisecondi assoluti.
 *
 * PERCHE' QUESTA FUNZIONE ESISTE (due difetti verificati dal vivo, sempre
 * sulla stessa idea sbagliata: trattare le cifre Roma di `oraInizio` come se
 * fossero gia' UTC):
 *  - ricostruire un istante assoluto con `Date.UTC(anno, mese, giorno,
 *    oraInizio.getUTCHours(), oraInizio.getUTCMinutes())` e confrontarlo con
 *    `new Date()` non applica MAI l'offset Europe/Rome (+1h/+2h secondo
 *    l'ora legale): la finestra risultava sempre "troppo presto" (check-in
 *    studente, mai apribile nel momento reale giusto);
 *  - ricostruirlo interpolando l'oggetto Date in una stringa
 *    (`` `1970-01-01T${oraInizio}` ``) e riparsandolo con `new Date(...)`
 *    produce Invalid Date (il template literal invoca `Date.prototype
 *    .toString()`, non serializza l'orario): NaN confrontato con qualunque
 *    soglia vale sempre `false`, quindi la finestra non veniva MAI applicata
 *    (scanner bibliotecario: check-in riuscito a qualunque ora).
 *
 * La correzione riusa `dataCorrenteBiblioteca`/`minutiCorrentiBiblioteca`
 * (gia' corretti e gia' usati da `validaIntervallo` per la creazione): si
 * confronta il GIORNO CIVILE di Roma di `dataPrenotazione` con quello di
 * "adesso" e - solo se coincidono - i MINUTI dalla mezzanotte di Roma. Mai
 * un istante assoluto ricostruito a mano: e' esattamente li' che si
 * nascondeva il bug.
 *
 * @param dataPrenotazione colonna `data` (@db.Date, mezzanotte UTC = giorno
 *        civile della biblioteca in cui e' la prenotazione).
 * @param oraInizio colonna `oraInizio` (@db.Time): le cifre UTC lette da
 *        Prisma SONO le cifre dell'orario di Roma (vedi src/lib/tempo-db.ts).
 * @param adesso istante reale corrente — SEMPRE l'orologio del server, mai
 *        un valore fornito dal client (hardening M-2, audit 2026-09-04).
 * @param tolleranzaDopoMinuti minuti di grazia DOPO l'inizio prima che la
 *        finestra sia "scaduta". Default 0 (check-in autonomo: chiude
 *        esattamente all'inizio). Lo scanner passa
 *        `TOLLERANZA_CHECK_IN_SCANNER_MINUTI`.
 */
export function valutaFinestraCheckIn(
  dataPrenotazione: Date,
  oraInizio: Date,
  adesso: Date,
  tolleranzaDopoMinuti = 0,
): EsitoFinestraCheckIn {
  const oggiBiblioteca = dataCorrenteBiblioteca(adesso);
  const minutiAttuali = minutiCorrentiBiblioteca(adesso);
  const oraInizioMinuti =
    oraInizio.getUTCHours() * 60 + oraInizio.getUTCMinutes();

  // Giorno diverso da oggi (fuso Roma): il verdetto e' deducibile dal solo
  // ordine dei giorni civili, senza bisogno di un conteggio esatto dei
  // minuti (che, a distanza di piu' giorni, non sarebbe comunque un dato
  // utile da mostrare all'utente).
  if (dataPrenotazione.getTime() > oggiBiblioteca.getTime()) {
    return { consentito: false, motivo: "troppo_presto" };
  }
  if (dataPrenotazione.getTime() < oggiBiblioteca.getTime()) {
    return { consentito: false, motivo: "scaduto" };
  }

  const aperturaMinuti = oraInizioMinuti - ANTICIPO_CHECK_IN_MINUTI;
  const chiusuraMinuti = oraInizioMinuti + tolleranzaDopoMinuti;

  if (minutiAttuali < aperturaMinuti) {
    return {
      consentito: false,
      motivo: "troppo_presto",
      minutiMancanti: aperturaMinuti - minutiAttuali,
    };
  }
  if (minutiAttuali > chiusuraMinuti) {
    return {
      consentito: false,
      motivo: "scaduto",
      minutiRitardo: minutiAttuali - oraInizioMinuti,
    };
  }
  return { consentito: true };
}

/**
 * Inverso "parziale" di `minutiCorrentiBiblioteca`: minuti dalla mezzanotte
 * -> Date sulla data fittizia 1970-01-01 UTC, lo stesso formato con cui
 * Prisma legge/scrive le colonne `@db.Time` (vedi src/lib/tempo-db.ts).
 * Normalizza modulo 1440 (un giorno) cosi' un valore fuori range (es.
 * "minuti correnti di Roma + 20" oltre mezzanotte) non genera un'ora > 23,
 * che romperebbe la colonna @db.Time. Serve a costruire soglie orarie (es.
 * "adesso + 15 minuti, in orario di Roma") da confrontare con
 * `oraInizio`/`oraFine` in una query Prisma.
 */
export function oraDbDaMinuti(minuti: number): Date {
  const minutiNormalizzati = ((minuti % 1440) + 1440) % 1440;
  return new Date(
    Date.UTC(1970, 0, 1, Math.floor(minutiNormalizzati / 60), minutiNormalizzati % 60),
  );
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
