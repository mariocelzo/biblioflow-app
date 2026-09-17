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
