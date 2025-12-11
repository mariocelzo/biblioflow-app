import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/prestiti - Lista prestiti
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    
    // Parametri di filtro
    const userId = searchParams.get("userId");
    const libroId = searchParams.get("libroId");
    const stato = searchParams.get("stato");
    const scaduti = searchParams.get("scaduti"); // true per mostrare solo scaduti
    
    const where: Record<string, unknown> = {};
    
    if (userId) {
      where.userId = userId;
    }
    
    if (libroId) {
      where.libroId = libroId;
    }
    
    if (stato) {
      where.stato = stato;
    }
    
    if (scaduti === "true") {
      where.dataScadenza = { lt: new Date() };
      where.stato = "ATTIVO";
    }
    
    const prestiti = await prisma.prestito.findMany({
      where,
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
        libro: {
          select: {
            id: true,
            isbn: true,
            titolo: true,
            autore: true,
            categoria: true,
            scaffale: true,
            piano: true,
          },
        },
      },
      orderBy: [
        { dataScadenza: "asc" },
        { dataPrestito: "desc" },
      ],
    });
    
    // Aggiungi informazioni sui giorni rimanenti
    const prestitiConInfo = prestiti.map((p) => {
      const oggi = new Date();
      const scadenza = new Date(p.dataScadenza);
      const diffTime = scadenza.getTime() - oggi.getTime();
      const giorniRimanenti = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      return {
        ...p,
        giorniRimanenti,
        isScaduto: giorniRimanenti < 0 && p.stato === "ATTIVO",
        inScadenza: giorniRimanenti >= 0 && giorniRimanenti <= 3 && p.stato === "ATTIVO",
      };
    });
    
    return NextResponse.json({
      success: true,
      data: prestitiConInfo,
      count: prestitiConInfo.length,
    });
  } catch (error) {
    console.error("Errore GET /api/prestiti:", error);
    return NextResponse.json(
      { success: false, error: "Errore nel recupero dei prestiti" },
      { status: 500 }
    );
  }
}

// POST /api/prestiti - Crea nuovo prestito
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    const { userId, libroId, durataDays = 30 } = body;
    
    // Validazione campi obbligatori
    if (!userId || !libroId) {
      return NextResponse.json(
        { success: false, error: "Campi obbligatori mancanti: userId, libroId" },
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
    
    // Verifica che il libro esista e sia disponibile
    const libro = await prisma.libro.findUnique({ where: { id: libroId } });
    if (!libro) {
      return NextResponse.json(
        { success: false, error: "Libro non trovato" },
        { status: 404 }
      );
    }
    
    if (libro.copieDisponibili <= 0) {
      return NextResponse.json(
        { success: false, error: "Nessuna copia disponibile per questo libro" },
        { status: 409 }
      );
    }
    
    // Verifica che l'utente non abbia già questo libro in prestito
    const prestitoEsistente = await prisma.prestito.findFirst({
      where: {
        userId,
        libroId,
        stato: "ATTIVO",
      },
    });
    
    if (prestitoEsistente) {
      return NextResponse.json(
        { success: false, error: "Hai già questo libro in prestito" },
        { status: 409 }
      );
    }
    
    // Verifica limite prestiti (max 5 contemporanei)
    const prestitiAttivi = await prisma.prestito.count({
      where: {
        userId,
        stato: "ATTIVO",
      },
    });
    
    if (prestitiAttivi >= 5) {
      return NextResponse.json(
        { success: false, error: "Hai raggiunto il limite massimo di 5 prestiti contemporanei" },
        { status: 409 }
      );
    }
    
    // Calcola data scadenza
    const dataScadenza = new Date();
    dataScadenza.setDate(dataScadenza.getDate() + durataDays);
    
    // Crea il prestito in una transazione
    const prestito = await prisma.$transaction(async (tx) => {
      // Decrementa copie disponibili
      await tx.libro.update({
        where: { id: libroId },
        data: { copieDisponibili: { decrement: 1 } },
      });
      
      // Crea prestito
      const newPrestito = await tx.prestito.create({
        data: {
          userId,
          libroId,
          dataScadenza,
          stato: "ATTIVO",
        },
        include: {
          user: {
            select: {
              id: true,
              nome: true,
              cognome: true,
              email: true,
            },
          },
          libro: {
            select: {
              id: true,
              titolo: true,
              autore: true,
            },
          },
        },
      });
      
      return newPrestito;
    });
    
    // Crea log evento
    await prisma.logEvento.create({
      data: {
        tipo: "PRESTITO_CREATO",
        userId,
        descrizione: `Prestito libro "${libro.titolo}"`,
      },
    });
    
    // Crea notifica
    await prisma.notifica.create({
      data: {
        userId,
        tipo: "SCADENZA_PRESTITO",
        titolo: "Nuovo prestito registrato",
        messaggio: `Hai preso in prestito "${libro.titolo}". Scadenza: ${dataScadenza.toLocaleDateString("it-IT")}`,
        actionUrl: "/prestiti",
        actionLabel: "Vedi prestiti",
      },
    });
    
    return NextResponse.json({
      success: true,
      data: prestito,
    }, { status: 201 });
    
  } catch (error) {
    console.error("Errore POST /api/prestiti:", error);
    return NextResponse.json(
      { success: false, error: "Errore nella creazione del prestito" },
      { status: 500 }
    );
  }
}
