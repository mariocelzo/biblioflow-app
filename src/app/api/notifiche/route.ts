import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/notifiche - Lista notifiche utente
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    
    const userId = searchParams.get("userId");
    const letta = searchParams.get("letta"); // "true" | "false" | null (tutte)
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");
    
    if (!userId) {
      return NextResponse.json(
        { success: false, error: "userId è obbligatorio" },
        { status: 400 }
      );
    }
    
    const where: Record<string, unknown> = { userId };
    
    if (letta !== null) {
      where.letta = letta === "true";
    }
    
    const [notifiche, totale, nonLette] = await Promise.all([
      prisma.notifica.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.notifica.count({ where: { userId } }),
      prisma.notifica.count({ where: { userId, letta: false } }),
    ]);
    
    return NextResponse.json({
      success: true,
      data: notifiche,
      count: notifiche.length,
      totale,
      nonLette,
    });
  } catch (error) {
    console.error("Errore GET /api/notifiche:", error);
    return NextResponse.json(
      { success: false, error: "Errore nel recupero delle notifiche" },
      { status: 500 }
    );
  }
}

// POST /api/notifiche - Crea nuova notifica (uso interno/admin)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, tipo, titolo, messaggio, actionUrl, actionLabel } = body;
    
    if (!userId || !tipo || !titolo || !messaggio) {
      return NextResponse.json(
        { success: false, error: "Campi obbligatori: userId, tipo, titolo, messaggio" },
        { status: 400 }
      );
    }
    
    // Verifica che l'utente esista
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return NextResponse.json(
        { success: false, error: "Utente non trovato" },
        { status: 404 }
      );
    }
    
    const notifica = await prisma.notifica.create({
      data: {
        userId,
        tipo,
        titolo,
        messaggio,
        actionUrl,
        actionLabel,
      },
    });
    
    return NextResponse.json({
      success: true,
      data: notifica,
    }, { status: 201 });
  } catch (error) {
    console.error("Errore POST /api/notifiche:", error);
    return NextResponse.json(
      { success: false, error: "Errore nella creazione della notifica" },
      { status: 500 }
    );
  }
}

// PATCH /api/notifiche - Aggiorna notifiche (segna come letta/e)
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { ids, userId, segnaLetta, segnaTutteLette } = body;
    
    // Segna tutte le notifiche di un utente come lette
    if (segnaTutteLette && userId) {
      const result = await prisma.notifica.updateMany({
        where: { userId, letta: false },
        data: { letta: true, lettaAt: new Date() },
      });
      
      return NextResponse.json({
        success: true,
        aggiornate: result.count,
        message: `${result.count} notifiche segnate come lette`,
      });
    }
    
    // Segna specifiche notifiche come lette/non lette
    if (ids && Array.isArray(ids) && ids.length > 0) {
      const result = await prisma.notifica.updateMany({
        where: { id: { in: ids } },
        data: { 
          letta: segnaLetta !== false, 
          lettaAt: segnaLetta !== false ? new Date() : null 
        },
      });
      
      return NextResponse.json({
        success: true,
        aggiornate: result.count,
      });
    }
    
    return NextResponse.json(
      { success: false, error: "Specificare ids o segnaTutteLette con userId" },
      { status: 400 }
    );
  } catch (error) {
    console.error("Errore PATCH /api/notifiche:", error);
    return NextResponse.json(
      { success: false, error: "Errore nell'aggiornamento delle notifiche" },
      { status: 500 }
    );
  }
}

// DELETE /api/notifiche - Elimina notifica
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    
    if (!id) {
      return NextResponse.json(
        { success: false, error: "id è obbligatorio" },
        { status: 400 }
      );
    }
    
    await prisma.notifica.delete({ where: { id } });
    
    return NextResponse.json({
      success: true,
      message: "Notifica eliminata",
    });
  } catch (error) {
    console.error("Errore DELETE /api/notifiche:", error);
    return NextResponse.json(
      { success: false, error: "Errore nell'eliminazione della notifica" },
      { status: 500 }
    );
  }
}
