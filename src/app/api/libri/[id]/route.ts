import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/libri/[id] - Dettaglio singolo libro
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const libro = await prisma.libro.findUnique({
      where: { id },
    });

    if (!libro) {
      return NextResponse.json(
        { success: false, error: "Libro non trovato" },
        { status: 404 }
      );
    }

    // Conta prestiti attivi per questo libro (statistiche)
    const prestitiAttivi = await prisma.prestito.count({
      where: { 
        libroId: id,
        stato: "ATTIVO"
      },
    });

    // Conta prestiti totali storici
    const prestitiTotali = await prisma.prestito.count({
      where: { libroId: id },
    });

    return NextResponse.json({
      success: true,
      data: {
        ...libro,
        prestitiAttivi,
        prestitiTotali,
      },
    });
  } catch (error) {
    console.error("Errore GET /api/libri/[id]:", error);
    return NextResponse.json(
      { success: false, error: "Errore nel recupero del libro" },
      { status: 500 }
    );
  }
}
