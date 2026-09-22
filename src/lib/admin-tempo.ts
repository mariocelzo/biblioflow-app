// Formattazione degli orari (oraInizio/oraFine) nelle pagine admin.
//
// PERCHE' QUESTO FILE: le colonne Prisma `oraInizio`/`oraFine` sono di tipo
// `@db.Time()` e vengono scritte con `oraPrisma()` (src/lib/prenotazioni-service.ts)
// come istante UTC sulla data fittizia 1970-01-01. A seconda di dove il dato
// arriva puo' presentarsi in due forme diverse:
//   - un vero oggetto Date, quando la pagina admin e' un Server Component
//     che legge da Prisma direttamente (es. src/app/admin/prenotazioni/page.tsx);
//   - una stringa ISO ("1970-01-01T14:00:00.000Z"), quando lo stesso dato
//     passa per una API route e viene serializzato in JSON (es. le fetch di
//     src/components/admin/posti-actions.tsx e utenti-actions.tsx).
//
// Il codice piu' vecchio faceva `new Date(`1970-01-01T${valore}`)`
// assumendo SEMPRE una stringa "HH:MM": con un oggetto Date il template
// letterale lo trasforma nel suo `toString()` (es. "Tue Jan 01 1970 14:00:00
// GMT+0100 ..."), con una stringa ISO duplica la data ("1970-01-01T1970-01-
// 01T14:00:00.000Z"). In entrambi i casi il risultato e' "Invalid Date",
// visibile a schermo nella tabella prenotazioni.
//
// La funzione che gestisce entrambe le forme e forza il fuso UTC vive ora in
// `src/lib/tempo-db.ts` (condivisa con la pagina "Le Mie Prenotazioni", con
// l'estensione prenotazione e con le notifiche generate lato server): qui
// viene solo riesportata, per non dover riscrivere gli import gia' presenti
// in tutta l'area admin.
export { formattaOraDb } from "./tempo-db";

// Formatta un istante come tempo relativo ("2 minuti fa", "3 ore fa", ...).
// Usato dalla card "Attivita' Recente" della dashboard admin: prima quella
// card mostrava 4 righe scritte a mano (Mario Rossi, Laura Bianchi, ...),
// identiche a ogni caricamento e scollegate dal database. Qui il tempo
// relativo si calcola sui veri LogEvento.
export function formattaTempoRelativo(data: Date): string {
  const diffMs = Date.now() - data.getTime();
  const diffMinuti = Math.floor(diffMs / 60000);

  if (diffMinuti < 1) return "adesso";
  if (diffMinuti < 60) return `${diffMinuti} minut${diffMinuti === 1 ? "o" : "i"} fa`;

  const diffOre = Math.floor(diffMinuti / 60);
  if (diffOre < 24) return `${diffOre} or${diffOre === 1 ? "a" : "e"} fa`;

  const diffGiorni = Math.floor(diffOre / 24);
  if (diffGiorni < 7) return `${diffGiorni} giorn${diffGiorni === 1 ? "o" : "i"} fa`;

  return data.toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" });
}
