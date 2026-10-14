// ============================================================================
// copie-libri.ts - coerenza di Libro.copieDisponibili con i prestiti reali
// ============================================================================
// PERCHE': `copieDisponibili` e' un contatore denormalizzato, mantenuto a mano
// da POST /api/prestiti (decremento) e dalle restituzioni (incremento). Se
// parte da un valore sbagliato (e' successo col seed: Clean Code 3/5 con un
// solo prestito attivo, Fluent Python 1/3 senza alcun prestito) resta
// sbagliato per sempre, e il catalogo mostra disponibilita' che non
// corrispondono ai prestiti. Il valore corretto e' sempre derivabile:
//   copieDisponibili = copieTotali - prestiti in corso (ATTIVO + RINNOVATO)
// Questo modulo calcola quel valore e lo applica; e' usato dal seed e da
// `scripts/riallinea-copie.ts` (per i database gia' popolati).
import type { StatoPrestito } from "@prisma/client";

/** Stati che occupano fisicamente una copia (stessa definizione di /api/prestiti). */
const STATI_CHE_OCCUPANO_COPIA: StatoPrestito[] = ["ATTIVO", "RINNOVATO"];

/** Copie libere = totali - in prestito, mai sotto 0. */
export function calcolaCopieDisponibili(copieTotali: number, prestitiInCorso: number): number {
  return Math.max(0, copieTotali - prestitiInCorso);
}

/** Sottoinsieme del client Prisma che serve qui (comodo da simulare nei test). */
export interface DbCopie {
  libro: {
    findMany(args: {
      select: { id: true; titolo: true; copieTotali: true; copieDisponibili: true };
    }): Promise<
      { id: string; titolo: string; copieTotali: number; copieDisponibili: number }[]
    >;
    update(args: {
      where: { id: string };
      data: { copieDisponibili: number };
    }): Promise<unknown>;
  };
  prestito: {
    groupBy(args: {
      by: ["libroId"];
      where: { stato: { in: StatoPrestito[] } };
      _count: { _all: true };
    }): Promise<{ libroId: string; _count: { _all: number } }[]>;
  };
}

export interface CorrezioneCopie {
  libroId: string;
  titolo: string;
  prima: number;
  dopo: number;
}

/**
 * Confronta ogni libro con i prestiti in corso e, se `applica` e' true, corregge
 * i contatori sbagliati. Ritorna l'elenco delle differenze trovate.
 */
export async function riallineaCopieDisponibili(
  db: DbCopie,
  { applica }: { applica: boolean },
): Promise<CorrezioneCopie[]> {
  const [libri, inCorso] = await Promise.all([
    db.libro.findMany({
      select: { id: true, titolo: true, copieTotali: true, copieDisponibili: true },
    }),
    db.prestito.groupBy({
      by: ["libroId"],
      where: { stato: { in: STATI_CHE_OCCUPANO_COPIA } },
      _count: { _all: true },
    }),
  ]);
  const prestitiPerLibro = new Map(inCorso.map((riga) => [riga.libroId, riga._count._all]));

  const correzioni: CorrezioneCopie[] = [];
  for (const libro of libri) {
    const dopo = calcolaCopieDisponibili(libro.copieTotali, prestitiPerLibro.get(libro.id) ?? 0);
    if (dopo === libro.copieDisponibili) continue;
    correzioni.push({
      libroId: libro.id,
      titolo: libro.titolo,
      prima: libro.copieDisponibili,
      dopo,
    });
    if (applica) {
      await db.libro.update({ where: { id: libro.id }, data: { copieDisponibili: dopo } });
    }
  }
  return correzioni;
}
