import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

// GET: Ottiene la disponibilità per un range di giorni
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: "Parametri startDate e endDate richiesti" },
        { status: 400 }
      );
    }

    // Ottieni il totale dei posti disponibili
    const postiTotali = await prisma.posto.count({
      where: { stato: "DISPONIBILE" }
    });

    // Genera lista di date nel range
    const start = new Date(startDate);
    const end = new Date(endDate);
    const dates: string[] = [];
    
    const current = new Date(start);
    while (current <= end) {
      dates.push(current.toISOString().split("T")[0]);
      current.setDate(current.getDate() + 1);
    }

    // Per ogni data, conta le prenotazioni
    const disponibilita = await Promise.all(
      dates.map(async (data) => {
        const dataInizio = new Date(`${data}T00:00:00Z`);
        const dataFine = new Date(`${data}T23:59:59Z`);

        // Conta prenotazioni attive per quella data
        // Una prenotazione "occupa" un posto se il suo orario si sovrappone
        const prenotazioniGiorno = await prisma.prenotazione.count({
          where: {
            data: {
              gte: dataInizio,
              lte: dataFine,
            },
            stato: {
              in: ["CONFERMATA", "CHECK_IN"],
            },
          },
        });

        // Calcola posti disponibili (approssimazione basata su slot orari)
        // In realtà dipende dagli slot, ma semplifichiamo
        const postiOccupatiStimati = Math.min(prenotazioniGiorno, postiTotali);
        const postiDisponibili = Math.max(0, postiTotali - postiOccupatiStimati);

        return {
          data,
          postiDisponibili,
          postiTotali,
        };
      })
    );

    return NextResponse.json({ disponibilita });
  } catch (error) {
    console.error("Errore fetch disponibilità:", error);
    return NextResponse.json(
      { error: "Errore durante il recupero della disponibilità" },
      { status: 500 }
    );
  }
}
