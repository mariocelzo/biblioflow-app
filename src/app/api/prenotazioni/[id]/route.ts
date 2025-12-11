import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/prenotazioni/[id] - Dettaglio prenotazione
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    
    const prenotazione = await prisma.prenotazione.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            nome: true,
            cognome: true,
            email: true,
            matricola: true,
          },
        },
        posto: {
          select: {
            id: true,
            numero: true,
            haPresaElettrica: true,
            haFinestra: true,
            isAccessibile: true,
            coordinataX: true,
            coordinataY: true,
            sala: {
              select: {
                id: true,
                nome: true,
                piano: true,
                orarioApertura: true,
                orarioChiusura: true,
              },
            },
          },
        },
        eventi: {
          orderBy: { createdAt: "desc" },
          take: 10,
        },
      },
    });
    
    if (!prenotazione) {
      return NextResponse.json(
        { success: false, error: "Prenotazione non trovata" },
        { status: 404 }
      );
    }
    
    return NextResponse.json({
      success: true,
      data: prenotazione,
    });
  } catch (error) {
    console.error("Errore GET /api/prenotazioni/[id]:", error);
    return NextResponse.json(
      { success: false, error: "Errore nel recupero della prenotazione" },
      { status: 500 }
    );
  }
}

// PATCH /api/prenotazioni/[id] - Aggiorna prenotazione (check-in, check-out, cancellazione)
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json();
    
    const { azione, userId } = body;
    
    // Verifica che la prenotazione esista
    const prenotazione = await prisma.prenotazione.findUnique({
      where: { id },
      include: { posto: true },
    });
    
    if (!prenotazione) {
      return NextResponse.json(
        { success: false, error: "Prenotazione non trovata" },
        { status: 404 }
      );
    }
    
    let updateData: Record<string, unknown> = {};
    let logTipo: "CHECK_IN" | "CHECK_OUT" | "PRENOTAZIONE_CANCELLATA";
    let logDescrizione: string;
    
    switch (azione) {
      case "check-in":
        if (prenotazione.stato !== "CONFERMATA") {
          return NextResponse.json(
            { success: false, error: "Impossibile fare check-in: stato non valido" },
            { status: 400 }
          );
        }
        
        updateData = {
          stato: "CHECK_IN",
          checkInAt: new Date(),
        };
        
        // Aggiorna stato posto
        await prisma.posto.update({
          where: { id: prenotazione.postoId },
          data: { stato: "OCCUPATO" },
        });
        
        logTipo = "CHECK_IN";
        logDescrizione = `Check-in effettuato per posto ${prenotazione.posto.numero}`;
        break;
        
      case "check-out":
        if (prenotazione.stato !== "CHECK_IN") {
          return NextResponse.json(
            { success: false, error: "Impossibile fare check-out: non hai fatto check-in" },
            { status: 400 }
          );
        }
        
        updateData = {
          stato: "COMPLETATA",
          checkOutAt: new Date(),
        };
        
        // Libera il posto
        await prisma.posto.update({
          where: { id: prenotazione.postoId },
          data: { stato: "DISPONIBILE" },
        });
        
        logTipo = "CHECK_OUT";
        logDescrizione = `Check-out effettuato per posto ${prenotazione.posto.numero}`;
        break;
        
      case "cancella":
        if (!["CONFERMATA", "CHECK_IN"].includes(prenotazione.stato)) {
          return NextResponse.json(
            { success: false, error: "Impossibile cancellare: prenotazione già conclusa" },
            { status: 400 }
          );
        }
        
        updateData = {
          stato: "CANCELLATA",
        };
        
        // Se era in check-in, libera il posto
        if (prenotazione.stato === "CHECK_IN") {
          await prisma.posto.update({
            where: { id: prenotazione.postoId },
            data: { stato: "DISPONIBILE" },
          });
        }
        
        logTipo = "PRENOTAZIONE_CANCELLATA";
        logDescrizione = `Prenotazione cancellata per posto ${prenotazione.posto.numero}`;
        break;
        
      default:
        return NextResponse.json(
          { success: false, error: "Azione non valida. Usa: check-in, check-out, cancella" },
          { status: 400 }
        );
    }
    
    // Aggiorna prenotazione
    const prenotazioneAggiornata = await prisma.prenotazione.update({
      where: { id },
      data: updateData,
      include: {
        user: {
          select: {
            id: true,
            nome: true,
            cognome: true,
          },
        },
        posto: {
          select: {
            id: true,
            numero: true,
            sala: {
              select: {
                nome: true,
              },
            },
          },
        },
      },
    });
    
    // Crea log evento
    await prisma.logEvento.create({
      data: {
        tipo: logTipo,
        userId: userId || prenotazione.userId,
        prenotazioneId: id,
        descrizione: logDescrizione,
      },
    });
    
    return NextResponse.json({
      success: true,
      data: prenotazioneAggiornata,
      message: logDescrizione,
    });
    
  } catch (error) {
    console.error("Errore PATCH /api/prenotazioni/[id]:", error);
    return NextResponse.json(
      { success: false, error: "Errore nell'aggiornamento della prenotazione" },
      { status: 500 }
    );
  }
}

// DELETE /api/prenotazioni/[id] - Elimina prenotazione
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    
    const prenotazione = await prisma.prenotazione.findUnique({
      where: { id },
      include: { posto: true },
    });
    
    if (!prenotazione) {
      return NextResponse.json(
        { success: false, error: "Prenotazione non trovata" },
        { status: 404 }
      );
    }
    
    // Se era attiva, libera il posto
    if (prenotazione.stato === "CHECK_IN") {
      await prisma.posto.update({
        where: { id: prenotazione.postoId },
        data: { stato: "DISPONIBILE" },
      });
    }
    
    // Elimina log eventi collegati
    await prisma.logEvento.deleteMany({
      where: { prenotazioneId: id },
    });
    
    // Elimina prenotazione
    await prisma.prenotazione.delete({
      where: { id },
    });
    
    return NextResponse.json({
      success: true,
      message: "Prenotazione eliminata",
    });
    
  } catch (error) {
    console.error("Errore DELETE /api/prenotazioni/[id]:", error);
    return NextResponse.json(
      { success: false, error: "Errore nell'eliminazione della prenotazione" },
      { status: 500 }
    );
  }
}
