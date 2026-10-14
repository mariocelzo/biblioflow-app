// ============================================================================
// home-dati.ts - dati REALI per le sezioni "Potrebbe Interessarti" della home
// ============================================================================
// PERCHE': "Libri Consigliati" e "I Tuoi Posti Preferiti" erano array scritti
// a mano dentro home-client.tsx (Clean Code / Design Patterns / A12 / B05 /
// C18, con id '1', '2', '3' e disponibilita' decise a priori). Conseguenze
// verificate in produzione:
//   - cliccando un libro si apriva /libri/1, id che nel DB non esiste (gli id
//     sono cuid): "Libro non trovato";
//   - "Disponibile" / "In prestito" e "Libero" / "Occupato" non avevano alcun
//     legame con lo stato reale del catalogo e dei posti.
// Qui le stesse sezioni si alimentano dal DB, ad ogni richiesta.
//
// Le funzioni ricevono il client Prisma come parametro (default: quello
// condiviso) per poter essere testate senza database.
import { prisma as prismaCondiviso } from "@/lib/prisma";

type ClientPrisma = typeof prismaCondiviso;

export interface LibroConsigliato {
  id: string;
  titolo: string;
  autore: string;
  categoria: string | null;
  copieDisponibili: number;
  disponibile: boolean;
}

export interface PostoPreferito {
  id: string;
  numero: string;
  sala: string;
  piano: number;
  caratteristiche: string[];
  disponibile: boolean;
}

const NUMERO_CONSIGLIATI = 3;
const NUMERO_PREFERITI = 3;

/**
 * Libri piu' richiesti del catalogo (a parita' di prestiti, ordine alfabetico).
 * Ritorna solo libri che esistono davvero; la disponibilita' e' quella del DB.
 */
export async function caricaLibriConsigliati(
  db: ClientPrisma = prismaCondiviso,
): Promise<LibroConsigliato[]> {
  const libri = await db.libro.findMany({
    orderBy: [{ prestiti: { _count: "desc" } }, { titolo: "asc" }],
    take: NUMERO_CONSIGLIATI,
    select: {
      id: true,
      titolo: true,
      autore: true,
      categoria: true,
      copieDisponibili: true,
    },
  });

  return libri.map((libro) => ({
    ...libro,
    disponibile: libro.copieDisponibili > 0,
  }));
}

/** Etichette delle caratteristiche di un posto, solo quelle che ha davvero. */
export function caratteristichePosto(posto: {
  haPresaElettrica: boolean;
  haFinestra: boolean;
  isAccessibile: boolean;
  tavoloRegolabile: boolean;
}): string[] {
  const caratteristiche: string[] = [];
  if (posto.haPresaElettrica) caratteristiche.push("Presa elettrica");
  if (posto.haFinestra) caratteristiche.push("Vicino finestra");
  if (posto.isAccessibile) caratteristiche.push("Accessibile");
  if (posto.tavoloRegolabile) caratteristiche.push("Tavolo regolabile");
  return caratteristiche;
}

/**
 * Posti che l'utente ha prenotato piu' spesso (prenotazioni annullate, no-show
 * e scadute non contano: non sono posti che ha davvero usato), con lo stato
 * attuale del posto. Nessuna prenotazione -> lista vuota (la UI non inventa
 * posti).
 */
export async function caricaPostiPreferiti(
  userId: string,
  db: ClientPrisma = prismaCondiviso,
): Promise<PostoPreferito[]> {
  const piuUsati = await db.prenotazione.groupBy({
    by: ["postoId"],
    where: {
      userId,
      stato: { in: ["CONFERMATA", "CHECK_IN", "COMPLETATA"] },
      posto: { attivo: true },
    },
    _count: { postoId: true },
    orderBy: [{ _count: { postoId: "desc" } }, { postoId: "asc" }],
    take: NUMERO_PREFERITI,
  });

  if (piuUsati.length === 0) return [];

  const posti = await db.posto.findMany({
    where: { id: { in: piuUsati.map((riga) => riga.postoId) } },
    include: { sala: { select: { nome: true, piano: true } } },
  });
  const perId = new Map(posti.map((posto) => [posto.id, posto]));

  // Si rispetta l'ordine "piu' usato prima" calcolato dal groupBy.
  return piuUsati.flatMap((riga) => {
    const posto = perId.get(riga.postoId);
    if (!posto) return [];
    return [
      {
        id: posto.id,
        numero: posto.numero,
        sala: posto.sala.nome,
        piano: posto.sala.piano,
        caratteristiche: caratteristichePosto(posto),
        disponibile: posto.attivo && posto.stato === "DISPONIBILE",
      },
    ];
  });
}
