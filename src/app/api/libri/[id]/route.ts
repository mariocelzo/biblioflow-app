import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/libri/[id] - Dettaglio singolo libro
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Autenticazione DENTRO la rotta (difesa in profondita'): vedi il
    // commento esteso in `src/app/api/libri/route.ts`. Qui il controllo e'
    // anche piu' necessario, perche' oltre al libro si restituiscono le
    // statistiche di prestito (attivi e storici), che sono dati gestionali
    // della biblioteca e non un'informazione di catalogo.
    //
    // L'unico chiamante e' la pagina `/libri/[id]`, riservata.
    await requireUser();

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
    // Sessione assente/insufficiente: 401 o 403, non il 500 generico.
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, code: error.code, error: error.message },
        { status: error.status },
      );
    }

    console.error("Errore GET /api/libri/[id]:", error);
    return NextResponse.json(
      { success: false, error: "Errore nel recupero del libro" },
      { status: 500 }
    );
  }
}
