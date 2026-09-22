// ============================================================================
// Formattazione condivisa dei campi "tempo" salvati da Prisma
// ============================================================================
// PERCHE' QUESTO FILE: le colonne Prisma `oraInizio`/`oraFine` (@db.Time) e
// `data` (@db.Date) sono salvate come istanti UTC ancorati a una data/ora
// fittizia (1970-01-01 per l'ora, mezzanotte per la data): sono valori "da
// parete" (wall-clock), non momenti reali. Formattarli con
// `toLocaleTimeString`/`toLocaleDateString` senza `timeZone: "UTC"` esplicito
// li fa passare per il fuso orario LOCALE di chi legge (browser o server):
//   - un orario "10:00" salvato diventa "11:00" a Roma in inverno (UTC+1) o
//     "12:00" in estate (UTC+2, ora legale): lo slittamento cambia con la
//     data, il che lo rende facile da non notare in un test manuale isolato;
//   - una data di mezzanotte UTC (es. "2026-09-23T00:00:00.000Z") scivola al
//     giorno PRIMA in qualunque fuso a ovest di Greenwich (es. New York,
//     UTC-4/-5): mezzanotte UTC e' ancora le 19-20 del giorno prima li'.
//
// Storia: il difetto e' stato scoperto e corretto per primo nell'area admin
// (`formattaOraDb`, PR #72). Questo modulo lo rende condiviso con il resto
// dell'app (pagina "Le Mie Prenotazioni", estensione prenotazione, messaggi
// di notifica generati lato server) invece di farlo reinventare altrove.
// `src/lib/admin-tempo.ts` riesporta `formattaOraDb` da qui, cosi' gli import
// gia' presenti nell'area admin restano validi senza modifiche.

/**
 * Formatta un orario "da parete" (`oraInizio`/`oraFine`, colonne `@db.Time`)
 * come "HH:MM", forzando il fuso UTC: il valore e' gia' l'orario giusto,
 * non serve (anzi, e' sbagliato) convertirlo nel fuso locale di chi legge.
 */
export function formattaOraDb(valore: Date | string | null | undefined): string {
  if (!valore) return "--:--";

  // Caso raro ma possibile (fallback difensivo usato in alcuni componenti
  // admin): una stringa gia' nel formato "HH:MM" o "HH:MM:SS", senza data ne'
  // fuso - non va fatta passare da `new Date(...)`, basta troncarla.
  if (typeof valore === "string" && /^\d{2}:\d{2}(:\d{2})?$/.test(valore)) {
    return valore.slice(0, 5);
  }

  const data = valore instanceof Date ? valore : new Date(valore);

  if (Number.isNaN(data.getTime())) return "--:--";

  return data.toLocaleTimeString("it-IT", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

/**
 * Formatta una data "da parete" (il campo `data`, colonna `@db.Date`,
 * salvata a mezzanotte UTC) forzando il fuso UTC: senza questo, in un fuso
 * negativo (es. America/New_York) la data mostrata scivola al giorno prima.
 *
 * `opzioni` permette di chiedere formati diversi (weekday breve/lungo, mese
 * breve/lungo, con o senza anno...) mantenendo comunque `timeZone: "UTC"":
 * chi chiama non puo' sovrascrivere il fuso passando `timeZone` in `opzioni`,
 * perche' viene applicato DOPO lo spread.
 */
export function formattaDataDb(
  valore: Date | string | null | undefined,
  opzioni: Intl.DateTimeFormatOptions = { day: "numeric", month: "numeric", year: "numeric" },
): string {
  if (!valore) return "--";

  const data = valore instanceof Date ? valore : new Date(valore);

  if (Number.isNaN(data.getTime())) return "--";

  return data.toLocaleDateString("it-IT", { ...opzioni, timeZone: "UTC" });
}
