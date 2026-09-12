// ============================================================================
// prestiti-scaduti.ts - "scaduto"/"in corso" per un Prestito (area admin)
// ============================================================================
// COSA: helper puri condivisi da src/app/admin/prestiti/page.tsx e
//       src/components/admin/prestiti-actions.tsx per decidere quando un
//       prestito e' "in corso" (quindi puo' essere in ritardo) e quando va
//       incluso nel filtro "Scaduti" / nel sollecito.
//
// PERCHE': un prestito RINNOVATO e' ancora un prestito in corso, ESATTAMENTE
//       come un ATTIVO (le API di /api/prestiti gia' lo trattano cosi': vedi
//       STATI_PRESTITO_IN_CORSO in src/app/api/prestiti/route.ts). L'area
//       admin invece filtrava/calcolava "scaduto" e "da sollecitare"
//       guardando SOLO `stato === "ATTIVO"`: uno studente che rinnova e poi
//       non restituisce e' realmente in ritardo, ma diventava invisibile al
//       filtro `?scadenza=scaduti`, alla scheda statistica "Scaduti" e al
//       pulsante di sollecito (singolo e "Sollecita Tutti"). Centralizzare la
//       lista di stati qui evita che i due punti se ne dimentichino uno alla
//       volta, e permette di testare la logica senza montare un componente
//       React (questo repository esegue i test vitest in ambiente "node",
//       senza DOM/testing-library).
import type { StatoPrestito } from "@prisma/client";

/** Un prestito in questi stati e' "in corso": puo' essere in ritardo. */
export const STATI_PRESTITO_IN_CORSO: readonly StatoPrestito[] = ["ATTIVO", "RINNOVATO"];

/** `true` se lo stato indica un prestito ancora in corso (ATTIVO o RINNOVATO). */
export function prestitoInCorso(stato: StatoPrestito | string): boolean {
  return STATI_PRESTITO_IN_CORSO.includes(stato as StatoPrestito);
}

/** Filtro Prisma per `WHERE` di `?scadenza=scaduti`: scaduti E ancora in corso. */
export function filtroScadenzaScaduti(oggi: Date = new Date()): {
  dataScadenza: { lte: Date };
  stato: { in: StatoPrestito[] };
} {
  return {
    dataScadenza: { lte: oggi },
    // Prisma vuole un array mutabile per `{ in: [...] }`: si copia la
    // costante `readonly` invece di esportarla direttamente.
    stato: { in: [...STATI_PRESTITO_IN_CORSO] },
  };
}

/** Conta i prestiti scaduti E ancora in corso (scheda statistica "Scaduti"). */
export function contaScaduti<T extends { stato: StatoPrestito | string; dataScadenza: Date | string }>(
  prestiti: readonly T[],
  oggi: Date = new Date(),
): number {
  return prestiti.filter(
    (p) => prestitoInCorso(p.stato) && new Date(p.dataScadenza) < oggi,
  ).length;
}

/** Prestiti da sollecitare: in ritardo da più di `sogliaGiorni` E ancora in corso. */
export function filtraDaSollecitare<
  T extends { stato: StatoPrestito | string; giorniRitardo: number },
>(prestiti: readonly T[], sogliaGiorni: number = 3): T[] {
  return prestiti.filter((p) => p.giorniRitardo > sogliaGiorni && prestitoInCorso(p.stato));
}
