import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/posti - Lista posti con filtri
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    
    // Parametri di filtro
    const salaId = searchParams.get("salaId");
    const stato = searchParams.get("stato");
    const haPresaElettrica = searchParams.get("haPresaElettrica");
    const haFinestra = searchParams.get("haFinestra");
    const isAccessibile = searchParams.get("isAccessibile");
    
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
