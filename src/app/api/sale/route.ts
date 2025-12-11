import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/sale - Lista sale
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    
    // Parametri di filtro
    const piano = searchParams.get("piano");
    const isSilenziosa = searchParams.get("isSilenziosa");
    const isGruppi = searchParams.get("isGruppi");
    
    const where: Record<string, unknown> = {
      attiva: true,
    };
    
    if (piano) {
      where.piano = parseInt(piano);
    }
    
    if (isSilenziosa !== null) {
      where.isSilenziosa = isSilenziosa === "true";
    }
    
    if (isGruppi !== null) {
      where.isGruppi = isGruppi === "true";
    }
    
    const sale = await prisma.sala.findMany({
      where,
      include: {
        _count: {
          select: { posti: true },
        },
        posti: {
          where: { attivo: true },
          select: {
            stato: true,
          },
        },
      },
      orderBy: [
        { piano: "asc" },
        { nome: "asc" },
      ],
    });
    
    // Calcola statistiche disponibilità per ogni sala
    const saleConStats = sale.map((sala) => {
      const postiDisponibili = sala.posti.filter(p => p.stato === "DISPONIBILE").length;
      const postiOccupati = sala.posti.filter(p => p.stato === "OCCUPATO").length;
      const postiTotali = sala.posti.length;
      
      return {
        id: sala.id,
        nome: sala.nome,
        piano: sala.piano,
        descrizione: sala.descrizione,
        isSilenziosa: sala.isSilenziosa,
        isGruppi: sala.isGruppi,
        capienzaMax: sala.capienzaMax,
        orarioApertura: sala.orarioApertura,
        orarioChiusura: sala.orarioChiusura,
        stats: {
          postiTotali,
          postiDisponibili,
          postiOccupati,
          percentualeOccupazione: postiTotali > 0 
            ? Math.round((postiOccupati / postiTotali) * 100) 
            : 0,
        },
      };
    });
    
    return NextResponse.json({
      success: true,
      data: saleConStats,
      count: saleConStats.length,
    });
  } catch (error) {
    console.error("Errore GET /api/sale:", error);
    return NextResponse.json(
      { success: false, error: "Errore nel recupero delle sale" },
      { status: 500 }
    );
  }
}
