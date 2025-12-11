import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/libri - Ricerca catalogo libri
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    
    // Parametri di ricerca e filtro
    const q = searchParams.get("q"); // ricerca testuale
    const categoria = searchParams.get("categoria");
    const disponibile = searchParams.get("disponibile");
    const piano = searchParams.get("piano");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    
    const where: Record<string, unknown> = {};
    
    // Ricerca testuale su titolo, autore, ISBN
    if (q) {
      where.OR = [
        { titolo: { contains: q, mode: "insensitive" } },
        { autore: { contains: q, mode: "insensitive" } },
        { isbn: { contains: q, mode: "insensitive" } },
      ];
    }
    
    if (categoria) {
      where.categoria = categoria;
    }
    
    if (disponibile === "true") {
      where.copieDisponibili = { gt: 0 };
    }
    
    if (piano) {
      where.piano = parseInt(piano);
    }
    
    // Conta totale per paginazione
    const total = await prisma.libro.count({ where });
    
    // Recupera libri con paginazione
    const libri = await prisma.libro.findMany({
      where,
      orderBy: [
        { titolo: "asc" },
      ],
      skip: (page - 1) * limit,
      take: limit,
    });
    
    return NextResponse.json({
      success: true,
      data: libri,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Errore GET /api/libri:", error);
    return NextResponse.json(
      { success: false, error: "Errore nella ricerca dei libri" },
      { status: 500 }
    );
  }
}

// GET /api/libri/categorie - Lista categorie disponibili
export async function OPTIONS() {
  try {
    const categorie = await prisma.libro.findMany({
      select: { categoria: true },
      distinct: ["categoria"],
      where: { categoria: { not: null } },
    });
    
    return NextResponse.json({
      success: true,
      data: categorie.map(c => c.categoria).filter(Boolean),
    });
  } catch (error) {
    console.error("Errore OPTIONS /api/libri:", error);
    return NextResponse.json(
      { success: false, error: "Errore nel recupero delle categorie" },
      { status: 500 }
    );
  }
}
