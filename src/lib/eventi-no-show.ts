import type { TipoEvento } from "@prisma/client";

/**
 * Tipi di `LogEvento` che registrano una mancata presentazione.
 *
 * Un no-show nasce da due percorsi diversi:
 *   - `NO_SHOW`      → rilevato dal personale (scanner QR, check-in scaduto);
 *   - `NO_SHOW_AUTO` → rilasciato dal cron (`releaseNoShowReservations`),
 *                      cioe' il caso di gran lunga piu' frequente.
 *
 * PERCHE' ESISTE: pagina Anomalie, dashboard admin, azioni di risoluzione e
 * contatori no-show dell'utente filtravano su `tipo: "NO_SHOW"` soltanto, per
 * cui i rilasci automatici non comparivano mai al personale. Ogni consumatore
 * che parla di "no-show" deve usare questa lista.
 */
export const TIPI_EVENTO_NO_SHOW = [
  "NO_SHOW",
  "NO_SHOW_AUTO",
] as const satisfies readonly TipoEvento[];

/** Filtro Prisma pronto all'uso: `where: { tipo: filtroTipoNoShow() }`. */
export function filtroTipoNoShow(): { in: TipoEvento[] } {
  return { in: [...TIPI_EVENTO_NO_SHOW] };
}

/** Vero se il tipo di evento rappresenta un no-show, manuale o automatico. */
export function isEventoNoShow(tipo: string): boolean {
  return (TIPI_EVENTO_NO_SHOW as readonly string[]).includes(tipo);
}
