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
      const dataPrenotazione = new Date(data);
      const oraInizioMinuti = parseTimeToMinutes(oraInizio);
      const oraFineMinuti = parseTimeToMinutes(oraFine);
      
      // Recupera le prenotazioni esistenti per quella data
      const prenotazioniEsistenti = await prisma.prenotazione.findMany({
        where: {
          data: dataPrenotazione,
          stato: { in: ["CONFERMATA", "CHECK_IN"] },
          postoId: { in: posti.map(p => p.id) },
        },
        select: {
          postoId: true,
          oraInizio: true,
          oraFine: true,
        },
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
      const postiConDisponibilita = posti.map(posto => {
        const prenotazioni = prenotazioniPerPosto.get(posto.id) || [];
        const isOccupato = prenotazioni.some(pren => {
          const prenInizio = pren.oraInizio.getHours() * 60 + pren.oraInizio.getMinutes();
          const prenFine = pren.oraFine.getHours() * 60 + pren.oraFine.getMinutes();
          // Verifica sovrapposizione: due intervalli si sovrappongono se non sono completamente separati
          return !(oraFineMinuti <= prenInizio || oraInizioMinuti >= prenFine);
        });
        
        return {
          ...posto,
          stato: isOccupato ? "OCCUPATO" : posto.stato,
          disponibile: !isOccupato,
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
