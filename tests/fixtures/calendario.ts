// ============================================================================
// Fixture di calendario per i test che creano prenotazioni "vere"
// ============================================================================
// PERCHE' ESISTE: da quando le regole di calendario valgono anche lato server
// (src/lib/calendario-biblioteca.ts: chiuso la domenica e nei festivi, non
// oltre 30 giorni da oggi), i test che sceglievano una data "a occhio" hanno
// iniziato a fallire senza che il codice sotto test fosse sbagliato:
//  - `oggi + 3 giorni` cade prima o poi di domenica (e' successo il
//    24/09/2026 -> 27/09/2026) e la prenotazione viene rifiutata;
//  - una data fissa lontana (es. "2031-03-10") supera sempre l'orizzonte.
// Il test diventava rosso a seconda del giorno in cui girava la CI: il peggior
// tipo di test, perche' insegna a ignorare il rosso.
//
// COSA FA: restituisce il primo giorno di APERTURA a partire da "oggi a Roma"
// + `giorniMinimi`, usando le STESSE funzioni del server. Cosi' la data scelta
// e' valida per costruzione, qualunque sia il giorno in cui girano i test.

import {
  isGiornoChiusoBiblioteca,
  superaOrizzonteMassimo,
} from "@/lib/calendario-biblioteca";
import { dataCorrenteBiblioteca } from "@/lib/prenotazioni-regole";

export interface GiornoApertura {
  /** Data in formato YYYY-MM-DD, come la invia il client all'API. */
  iso: string;
  /** Mezzanotte UTC della stessa data: la rappresentazione Prisma di `@db.Date`. */
  data: Date;
}

const UN_GIORNO_MS = 24 * 60 * 60 * 1000;

/**
 * Primo giorno in cui la biblioteca e' aperta, almeno `giorniMinimi` giorni
 * dopo oggi (calcolato nel fuso della biblioteca, non in quello del server).
 */
export function giornoApertura(giorniMinimi = 1, adesso: Date = new Date()): GiornoApertura {
  const oggi = dataCorrenteBiblioteca(adesso);
  let candidato = new Date(oggi.getTime() + giorniMinimi * UN_GIORNO_MS);

  // Al massimo una settimana di ricerca: fra domeniche e festivita' consecutive
  // (es. 25-26 dicembre + domenica) non si arriva mai oltre.
  for (let tentativi = 0; tentativi < 7 && isGiornoChiusoBiblioteca(candidato).chiuso; tentativi++) {
    candidato = new Date(candidato.getTime() + UN_GIORNO_MS);
  }

  if (isGiornoChiusoBiblioteca(candidato).chiuso || superaOrizzonteMassimo(candidato, oggi)) {
    // Non dovrebbe mai succedere con giorniMinimi piccoli: se succede, meglio
    // un errore esplicito che un test rosso per un motivo incomprensibile.
    throw new Error(
      `giornoApertura: nessun giorno valido trovato da oggi+${giorniMinimi} (ultimo candidato ${candidato.toISOString()})`,
    );
  }

  const iso = candidato.toISOString().slice(0, 10);
  return { iso, data: candidato };
}
