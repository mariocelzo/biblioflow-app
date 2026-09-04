import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

// ============================================================================
// API DISPONIBILITA' PER RANGE DI GIORNI — BiblioFlow
// ============================================================================
// Hardening M-4 (audit sicurezza 2026-09-04):
// prima il range `startDate..endDate` non era validato: un intervallo enorme
// (es. anni) generava un `prisma.prenotazione.count` PER OGNI giorno dentro un
// `Promise.all` senza alcun tetto → centinaia/migliaia di query in parallelo
// (DoS applicativo + pressione sul pool di connessioni).
// Correzione:
//  1. `startDate`/`endDate` devono essere date valide e `start <= end` → 422;
//  2. il range e' limitato a MAX_GIORNI (90) → 422 se superato;
//  3. il fan-out per-giorno e' sostituito da UNA sola `groupBy` su `data`,
//     poi i conteggi vengono ridistribuiti sui giorni del range.
// ============================================================================

// Tetto massimo di giorni richiedibili in una singola chiamata.
const MAX_GIORNI = 90;

// Millisecondi in un giorno: usato per contare i giorni del range.
const MS_GIORNO = 24 * 60 * 60 * 1000;

/**
 * Interpreta una stringa `YYYY-MM-DD` (o ISO completa) come mezzanotte UTC.
 * Ritorna `null` se non e' una data valida.
 */
function parseGiornoUTC(value: string): Date | null {
  // Estrae la sola parte `YYYY-MM-DD` per ancorare sempre a mezzanotte UTC,
  // coerentemente con la colonna `Prenotazione.data` (`@db.Date`).
  const soloData = value.slice(0, 10);
  const parsed = new Date(`${soloData}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

// GET: Ottiene la disponibilità per un range di giorni
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const startDateRaw = searchParams.get("startDate");
    const endDateRaw = searchParams.get("endDate");

    if (!startDateRaw || !endDateRaw) {
      return NextResponse.json(
        { error: "Parametri startDate e endDate richiesti" },
        { status: 400 },
      );
    }

    // (1) Le date devono essere valide.
    const start = parseGiornoUTC(startDateRaw);
    const end = parseGiornoUTC(endDateRaw);
    if (!start || !end) {
      return NextResponse.json(
        { error: "startDate e endDate devono essere date valide (YYYY-MM-DD)" },
        { status: 422 },
      );
    }

    // (2) L'intervallo deve essere ordinato e non superare MAX_GIORNI.
    if (end.getTime() < start.getTime()) {
      return NextResponse.json(
        { error: "endDate non puo' precedere startDate" },
        { status: 422 },
      );
    }
    // +1 perche' il range e' inclusivo su entrambi gli estremi.
    const numGiorni = Math.floor((end.getTime() - start.getTime()) / MS_GIORNO) + 1;
    if (numGiorni > MAX_GIORNI) {
      return NextResponse.json(
        {
          error: `Il range richiesto (${numGiorni} giorni) supera il massimo di ${MAX_GIORNI} giorni`,
        },
        { status: 422 },
      );
    }

    // Totale dei posti attualmente disponibili (denominatore della stima).
    const postiTotali = await prisma.posto.count({
      where: { stato: "DISPONIBILE" },
    });

    // Elenco dei giorni del range in formato `YYYY-MM-DD`.
    const dates: string[] = [];
    for (let i = 0; i < numGiorni; i++) {
      dates.push(
        new Date(start.getTime() + i * MS_GIORNO).toISOString().split("T")[0],
      );
    }

    // (3) UNA sola query: conteggio delle prenotazioni attive raggruppato per
    // giorno, invece di un `count` per ciascun giorno in `Promise.all`.
    const conteggiPerGiorno = await prisma.prenotazione.groupBy({
      by: ["data"],
      where: {
        data: {
          gte: start,
          // Fine intervallo: mezzanotte UTC del giorno DOPO `end`, così `end`
          // stesso rientra (`lt` esclusivo).
          lt: new Date(end.getTime() + MS_GIORNO),
        },
        stato: { in: ["CONFERMATA", "CHECK_IN"] },
      },
      _count: { _all: true },
    });

    // Mappa `YYYY-MM-DD` -> numero di prenotazioni attive di quel giorno.
    const contatore = new Map<string, number>();
    for (const riga of conteggiPerGiorno) {
      const chiave = riga.data.toISOString().split("T")[0];
      contatore.set(chiave, riga._count._all);
    }

    // Ricompone la risposta giorno per giorno, con la stessa forma di prima.
    const disponibilita = dates.map((data) => {
      const prenotazioniGiorno = contatore.get(data) ?? 0;
      const postiOccupatiStimati = Math.min(prenotazioniGiorno, postiTotali);
      const postiDisponibili = Math.max(0, postiTotali - postiOccupatiStimati);
      return { data, postiDisponibili, postiTotali };
    });

    return NextResponse.json({ disponibilita });
  } catch (error) {
    // Dettaglio completo solo server-side; al client messaggio generico.
    console.error("Errore fetch disponibilità:", error);
    return NextResponse.json(
      { error: "Errore durante il recupero della disponibilità" },
      { status: 500 },
    );
  }
}
