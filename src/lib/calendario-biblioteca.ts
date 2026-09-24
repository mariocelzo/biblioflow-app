/**
 * Regole di CALENDARIO della biblioteca: domenica, festività nazionali
 * italiane e orizzonte massimo di 30 giorni per le nuove prenotazioni.
 *
 * DIFETTO VISTO IN COLLAUDO (no-limite-server-domenica-festivi-30gg): queste
 * tre regole esistevano SOLO nel wizard client (`src/app/prenota/page.tsx`:
 * `isGiornoChiuso`, `FESTIVITA_2026`, `getDataMassima`). Chiamando
 * `POST /api/prenotazioni` direttamente (bypassando il wizard, es. da uno
 * script o da un client diverso) si potevano creare prenotazioni di
 * domenica, nei giorni festivi o a mesi di distanza — verificato dal vivo:
 * 2026-09-27 (domenica), 2026-11-01 (Ognissanti) e 2026-11-15 (53 giorni da
 * oggi) sono state tutte accettate con 201 CONFERMATA.
 *
 * Questo modulo e' la fonte di verita' UNICA, usata sia dal server
 * (`validaIntervallo` in prenotazioni-service.ts) sia dal client (lo stesso
 * wizard) — cosi' le due regole non possono piu' divergere. Come
 * `prenotazioni-regole.ts` (di cui e' compagno), e' SENZA dipendenza da
 * Prisma cosi' da restare importabile da un componente "use client" senza
 * trascinarsi dietro @prisma/client nel bundle del browser.
 */

// Quanti giorni in anticipo (rispetto a "oggi" nel fuso della biblioteca, da
// dataCorrenteBiblioteca) si può prenotare. Il wizard lo chiamava semplicemente
// "30 giorni" (getDataMassima): la costante evita che i due lati possano
// divergere se il limite cambiasse in futuro.
export const ORIZZONTE_MASSIMO_GIORNI = 30;

type FestivitaFissa = {
  /** Mese 1-based (gennaio = 1), come si legge a mano su un calendario. */
  mese: number;
  giorno: number;
  nome: string;
};

/**
 * Festività nazionali italiane a data FISSA (stesso giorno/mese ogni anno).
 * Pasquetta (l'unica festività "mobile" osservata dalla biblioteca) è
 * calcolata a parte da `calcolaPasquetta`, non elencata qui.
 *
 * NOTA DI PERIMETRO (da confermare con la biblioteca, vedi report PR): non
 * includiamo la festa del patrono di Salerno (San Matteo, 21 settembre) né
 * un eventuale patrono di Fisciano. Sono chiusure locali/facoltative, non
 * un giorno festivo nazionale, e non esiste nello schema una tabella di
 * "chiusure straordinarie" configurabile dallo staff: hardcodarle qui
 * sarebbe una regola di dominio inventata, non verificata. Se la biblioteca
 * osserva davvero quella chiusura, va aggiunta esplicitamente (idealmente
 * come configurazione gestibile dallo staff, non come costante fissa).
 */
const FESTIVITA_FISSE: readonly FestivitaFissa[] = [
  { mese: 1, giorno: 1, nome: "Capodanno" },
  { mese: 1, giorno: 6, nome: "Epifania" },
  { mese: 4, giorno: 25, nome: "Anniversario della Liberazione" },
  { mese: 5, giorno: 1, nome: "Festa dei Lavoratori" },
  { mese: 6, giorno: 2, nome: "Festa della Repubblica" },
  { mese: 8, giorno: 15, nome: "Ferragosto" },
  { mese: 11, giorno: 1, nome: "Ognissanti" },
  { mese: 12, giorno: 8, nome: "Immacolata Concezione" },
  { mese: 12, giorno: 25, nome: "Natale" },
  { mese: 12, giorno: 26, nome: "Santo Stefano" },
];

/**
 * Domenica di Pasqua per l'anno dato (algoritmo di Gauss/Meeus, valido per
 * il calendario gregoriano — quindi per qualunque anno che l'app userà).
 * Calcolata invece di hardcodare una tabella di date: il vecchio
 * `FESTIVITA_2026` del wizard, essendo scritto a mano per un solo anno,
 * sarebbe silenziosamente scaduto (e sbagliato) dal 2027 in poi.
 */
function calcolaPasqua(anno: number): { mese: number; giorno: number } {
  const a = anno % 19;
  const b = Math.floor(anno / 100);
  const c = anno % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const bozza = h + l - 7 * m + 114;
  const mese = Math.floor(bozza / 31); // 3 = marzo, 4 = aprile
  const giorno = (bozza % 31) + 1;
  return { mese, giorno };
}

/** Pasquetta (lunedì dell'Angelo) = giorno successivo alla domenica di Pasqua. */
function calcolaPasquetta(anno: number): { mese: number; giorno: number } {
  const pasqua = calcolaPasqua(anno);
  // Costruita in UTC solo per sommare un giorno di calendario (gestisce da
  // sola il cambio di mese, es. Pasqua 31 marzo -> Pasquetta 1 aprile):
  // nessun legame con fusi orari o orari del giorno, qui contano solo
  // anno/mese/giorno.
  const pasquettaUtc = new Date(
    Date.UTC(anno, pasqua.mese - 1, pasqua.giorno + 1),
  );
  return {
    mese: pasquettaUtc.getUTCMonth() + 1,
    giorno: pasquettaUtc.getUTCDate(),
  };
}

export type GiornoChiuso = { chiuso: boolean; motivo: string };

/**
 * `data` è chiusa (domenica o festività) per la biblioteca?
 *
 * Riceve una data di CALENDARIO (mezzanotte UTC che rappresenta l'anno/mese/
 * giorno scelto — lo stesso formato restituito da `dataCalendario` in
 * prenotazioni-service.ts e da `dataCorrenteBiblioteca` in
 * prenotazioni-regole.ts), non un istante. La domenica/festività di una data
 * di calendario non dipende dal fuso orario di chi chiede — è lo stesso
 * giorno ovunque — quindi qui non serve alcuna conversione Europe/Rome:
 * quella serve solo per calcolare QUALE sia "oggi" a partire da un istante
 * (`dataCorrenteBiblioteca`), già fatta a monte in validaIntervallo.
 */
export function isGiornoChiusoBiblioteca(data: Date): GiornoChiuso {
  if (Number.isNaN(data.getTime())) {
    return { chiuso: false, motivo: "" };
  }

  if (data.getUTCDay() === 0) {
    return { chiuso: true, motivo: "La biblioteca è chiusa la domenica" };
  }

  const mese = data.getUTCMonth() + 1;
  const giorno = data.getUTCDate();
  const anno = data.getUTCFullYear();

  const festivitaFissa = FESTIVITA_FISSE.some(
    (f) => f.mese === mese && f.giorno === giorno,
  );
  if (festivitaFissa) {
    return { chiuso: true, motivo: "La biblioteca è chiusa per festività" };
  }

  const pasquetta = calcolaPasquetta(anno);
  if (pasquetta.mese === mese && pasquetta.giorno === giorno) {
    return { chiuso: true, motivo: "La biblioteca è chiusa per festività" };
  }

  return { chiuso: false, motivo: "" };
}

/**
 * `data` supera l'orizzonte massimo di prenotazione (30 giorni da `oggi`)?
 *
 * Entrambi gli argomenti sono date di CALENDARIO a mezzanotte UTC (vedi
 * commento sopra): `oggi` va calcolata dal chiamante con
 * `dataCorrenteBiblioteca(adesso)` (fuso Europe/Rome), MAI con `new Date()`
 * diretto — altrimenti il limite dei 30 giorni sbaglierebbe di un giorno
 * intorno alla mezzanotte quando l'ora UTC del server e l'ora di Roma
 * ricadono su due giorni di calendario diversi. Il confronto qui sotto è
 * puramente aritmetico sui millisecondi tra due mezzanotti UTC: non
 * attraversa mai un cambio di ora legale (quello riguarda solo l'ORARIO dei
 * singoli slot, non la differenza in giorni interi fra due date).
 */
export function superaOrizzonteMassimo(data: Date, oggi: Date): boolean {
  const massimoMs = oggi.getTime() + ORIZZONTE_MASSIMO_GIORNI * 24 * 60 * 60 * 1000;
  return data.getTime() > massimoMs;
}
