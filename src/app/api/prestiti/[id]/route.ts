import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/prestiti/[id] - Dettaglio prestito
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    
    const prestito = await prisma.prestito.findUnique({
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
        libro: true,
      },
    });
    
    if (!prestito) {
      return NextResponse.json(
        { success: false, error: "Prestito non trovato" },
        { status: 404 }
      );
    }
    
    // Calcola giorni rimanenti
    const oggi = new Date();
    const scadenza = new Date(prestito.dataScadenza);
    const diffTime = scadenza.getTime() - oggi.getTime();
    const giorniRimanenti = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    return NextResponse.json({
      success: true,
      data: {
        ...prestito,
        giorniRimanenti,
        isScaduto: giorniRimanenti < 0 && prestito.stato === "ATTIVO",
        inScadenza: giorniRimanenti >= 0 && giorniRimanenti <= 3 && prestito.stato === "ATTIVO",
      },
    });
  } catch (error) {
    console.error("Errore GET /api/prestiti/[id]:", error);
    return NextResponse.json(
      { success: false, error: "Errore nel recupero del prestito" },
      { status: 500 }
    );
  }
}

// PATCH /api/prestiti/[id] - Aggiorna prestito (restituzione, rinnovo)
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json();
    
    const { azione } = body;
    
    // Verifica che il prestito esista
    const prestito = await prisma.prestito.findUnique({
      where: { id },
      include: { libro: true },
    });
    
    if (!prestito) {
      return NextResponse.json(
        { success: false, error: "Prestito non trovato" },
        { status: 404 }
      );
    }
    
    let updateData: Record<string, unknown> = {};
    let logDescrizione: string;
    
    switch (azione) {
      case "restituisci":
        if (prestito.stato !== "ATTIVO") {
          return NextResponse.json(
            { success: false, error: "Questo prestito non è attivo" },
            { status: 400 }
          );
        }
        
        // Restituisci in transazione
        await prisma.$transaction(async (tx) => {
          // Aggiorna stato prestito
          await tx.prestito.update({
            where: { id },
            data: {
              stato: "RESTITUITO",
              dataRestituzione: new Date(),
            },
          });
          
          // Incrementa copie disponibili
          await tx.libro.update({
            where: { id: prestito.libroId },
            data: { copieDisponibili: { increment: 1 } },
          });
        });
        
        logDescrizione = `Libro "${prestito.libro.titolo}" restituito`;
        
        // Crea log evento
        await prisma.logEvento.create({
          data: {
            tipo: "PRESTITO_RESTITUITO",
            userId: prestito.userId,
            descrizione: logDescrizione,
          },
        });
        
        const prestitoRestituito = await prisma.prestito.findUnique({
          where: { id },
          include: {
            user: { select: { id: true, nome: true, cognome: true } },
            libro: { select: { id: true, titolo: true, autore: true } },
          },
        });
        
        return NextResponse.json({
          success: true,
          data: prestitoRestituito,
          message: logDescrizione,
        });
        
      case "rinnova":
        if (prestito.stato !== "ATTIVO") {
          return NextResponse.json(
            { success: false, error: "Questo prestito non è attivo" },
            { status: 400 }
          );
        }
        
        if (prestito.rinnovi >= prestito.maxRinnovi) {
          return NextResponse.json(
            { success: false, error: `Hai raggiunto il limite massimo di ${prestito.maxRinnovi} rinnovi` },
            { status: 400 }
          );
        }
        
        // Calcola nuova scadenza (30 giorni da oggi)
        const nuovaScadenza = new Date();
        nuovaScadenza.setDate(nuovaScadenza.getDate() + 30);
        
        updateData = {
          dataScadenza: nuovaScadenza,
          rinnovi: { increment: 1 },
          stato: "RINNOVATO",
        };
        
        logDescrizione = `Prestito rinnovato per "${prestito.libro.titolo}". Rinnovo ${prestito.rinnovi + 1}/${prestito.maxRinnovi}`;
        break;
        
      default:
        return NextResponse.json(
          { success: false, error: "Azione non valida. Usa: restituisci, rinnova" },
          { status: 400 }
        );
    }
    
    // Aggiorna prestito
    const prestitoAggiornato = await prisma.prestito.update({
      where: { id },
      data: updateData,
      include: {
        user: { select: { id: true, nome: true, cognome: true } },
        libro: { select: { id: true, titolo: true, autore: true } },
      },
    });
    
    // Crea notifica per rinnovo
    if (azione === "rinnova") {
      await prisma.notifica.create({
        data: {
          userId: prestito.userId,
          tipo: "SCADENZA_PRESTITO",
          titolo: "Prestito rinnovato",
          messaggio: `Il prestito di "${prestito.libro.titolo}" è stato rinnovato. Nuova scadenza: ${(updateData.dataScadenza as Date).toLocaleDateString("it-IT")}`,
          actionUrl: "/prestiti",
          actionLabel: "Vedi prestiti",
        },
      });
    }
    
    return NextResponse.json({
      success: true,
      data: prestitoAggiornato,
      message: logDescrizione,
    });
    
  } catch (error) {
    console.error("Errore PATCH /api/prestiti/[id]:", error);
    return NextResponse.json(
      { success: false, error: "Errore nell'aggiornamento del prestito" },
      { status: 500 }
    );
  }
}
