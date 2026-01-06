import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/posti - Lista posti con filtri e disponibilità
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    
    // Parametri di filtro
    const salaId = searchParams.get("salaId");
    const stato = searchParams.get("stato");
    const haPresaElettrica = searchParams.get("haPresaElettrica");
    const haFinestra = searchParams.get("haFinestra");
    const isAccessibile = searchParams.get("isAccessibile");
    
    // Parametri per verifica disponibilità
    const data = searchParams.get("data");
    const oraInizio = searchParams.get("oraInizio");
    const oraFine = searchParams.get("oraFine");
    
    // Costruisci query con filtri
    const where: Record<string, unknown> = {
      attivo: true,
    };
    
    if (salaId) {
      where.salaId = salaId;
    }
    
    if (stato) {
      where.stato = stato;
    }
    
    if (haPresaElettrica !== null) {
      where.haPresaElettrica = haPresaElettrica === "true";
    }
    
    if (haFinestra !== null) {
      where.haFinestra = haFinestra === "true";
    }
    
    if (isAccessibile !== null) {
      where.isAccessibile = isAccessibile === "true";
    }
    
    const posti = await prisma.posto.findMany({
      where,
      include: {
        sala: {
          select: {
            id: true,
            nome: true,
            piano: true,
            isSilenziosa: true,
            isGruppi: true,
            orarioApertura: true,
            orarioChiusura: true,
          },
        },
      },
      orderBy: [
        { salaId: "asc" },
        { numero: "asc" },
      ],
    });
    
    // Se sono specificati data e orari, verifica la disponibilità per ogni posto
    if (data && oraInizio && oraFine) {
      const oraInizioMinuti = parseTimeToMinutes(oraInizio);
      const oraFineMinuti = parseTimeToMinutes(oraFine);
      
      const postiIds = posti.map((p: { id: string }) => p.id);
      
      console.log(`[API POSTI] Data input: ${data}`);
      console.log(`[API POSTI] Posti IDs: ${posti.slice(0, 3).map((p: { numero: string }) => p.numero).join(", ")}...`);
      
      // Usa raw query per evitare problemi di timezone con @db.Date
      const prenotazioniEsistenti = await prisma.$queryRaw<Array<{
        postoId: string;
        oraInizio: Date;
        oraFine: Date;
      }>>`
        SELECT "postoId", "oraInizio", "oraFine" 
        FROM "Prenotazione" 
        WHERE data = ${data}::date 
          AND stato IN ('CONFERMATA', 'CHECK_IN')
          AND "postoId" = ANY(${postiIds})
      `;
      
      console.log(`[API POSTI] Cercando prenotazioni per data ${data}, orario ${oraInizio}-${oraFine}`);
      console.log(`[API POSTI] Trovate ${prenotazioniEsistenti.length} prenotazioni esistenti`);
      prenotazioniEsistenti.forEach((p: { postoId: string; oraInizio: Date; oraFine: Date }) => {
        console.log(`[API POSTI] - Posto ${p.postoId}: ${p.oraInizio.toISOString()} - ${p.oraFine.toISOString()}`);
      });
      
      // Mappa delle prenotazioni per postoId
      const prenotazioniPerPosto = new Map<string, Array<{ oraInizio: Date; oraFine: Date }>>();
      for (const p of prenotazioniEsistenti) {
        if (!prenotazioniPerPosto.has(p.postoId)) {
          prenotazioniPerPosto.set(p.postoId, []);
        }
        prenotazioniPerPosto.get(p.postoId)!.push({
          oraInizio: p.oraInizio,
          oraFine: p.oraFine,
        });
      }
      
      // Aggiungi info disponibilità a ogni posto
      interface PostoData {
        id: string;
        numero: string;
        stato: string;
      }
      const postiConDisponibilita = posti.map((posto: PostoData) => {
        const prenotazioni = prenotazioniPerPosto.get(posto.id) || [];
        const isOccupato = prenotazioni.some(pren => {
          // Estrai ore e minuti dalla prenotazione
          // I campi TIME in PostgreSQL vengono restituiti come Date con data 1970-01-01
          const prenInizio = pren.oraInizio.getUTCHours() * 60 + pren.oraInizio.getUTCMinutes();
          const prenFine = pren.oraFine.getUTCHours() * 60 + pren.oraFine.getUTCMinutes();
          
          console.log(`[API POSTI] Posto ${posto.numero}: prenotazione ${prenInizio}-${prenFine} vs richiesta ${oraInizioMinuti}-${oraFineMinuti}`);
          
          // Verifica sovrapposizione: due intervalli si sovrappongono se non sono completamente separati
          const overlaps = !(oraFineMinuti <= prenInizio || oraInizioMinuti >= prenFine);
          console.log(`[API POSTI] Posto ${posto.numero}: overlaps=${overlaps}`);
          return overlaps;
        });
        
        return {
          ...posto,
          stato: isOccupato ? "OCCUPATO" : posto.stato,
          disponibile: !isOccupato && posto.stato === "DISPONIBILE",
        };
      });
      
      return NextResponse.json({
        success: true,
        data: postiConDisponibilita,
        count: postiConDisponibilita.length,
        filtri: { data, oraInizio, oraFine },
      });
    }
    
    return NextResponse.json({
      success: true,
      data: posti,
      count: posti.length,
    });
  } catch (error) {
    console.error("Errore GET /api/posti:", error);
    return NextResponse.json(
      { success: false, error: "Errore nel recupero dei posti" },
      { status: 500 }
    );
  }
}

// Helper per convertire "HH:MM" in minuti
function parseTimeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}
