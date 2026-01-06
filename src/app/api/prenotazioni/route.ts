import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readApiRateLimiter } from "@/lib/rate-limit";

// GET /api/prenotazioni - Lista prenotazioni
export async function GET(request: NextRequest) {
  try {
    // Rate limiting: 300 req/min per letture
    const rateLimitResult = await readApiRateLimiter(request);
    if (rateLimitResult) return rateLimitResult;
    
    const { searchParams } = new URL(request.url);
    
    // Parametri di filtro
    const userId = searchParams.get("userId");
    const postoId = searchParams.get("postoId");
    const stato = searchParams.get("stato");
    const data = searchParams.get("data"); // formato: YYYY-MM-DD
    const dataInizio = searchParams.get("dataInizio");
    const dataFine = searchParams.get("dataFine");
    
    const where: Record<string, unknown> = {};
    
    if (userId) {
      where.userId = userId;
    }
    
    if (postoId) {
      where.postoId = postoId;
    }
    
    if (stato) {
      where.stato = stato;
    }
    
    if (data) {
      const dataDate = new Date(data);
      dataDate.setHours(0, 0, 0, 0);
      const nextDay = new Date(dataDate);
      nextDay.setDate(nextDay.getDate() + 1);
      
      where.data = {
        gte: dataDate,
        lt: nextDay,
      };
    } else if (dataInizio || dataFine) {
      where.data = {};
      if (dataInizio) {
        (where.data as Record<string, Date>).gte = new Date(dataInizio);
      }
      if (dataFine) {
        (where.data as Record<string, Date>).lte = new Date(dataFine);
      }
    }
    
    const prenotazioni = await prisma.prenotazione.findMany({
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
        posto: {
          select: {
            id: true,
            numero: true,
            haPresaElettrica: true,
            haFinestra: true,
            isAccessibile: true,
            sala: {
              select: {
                id: true,
                nome: true,
                piano: true,
              },
            },
          },
        },
      },
      orderBy: [
        { data: "desc" },
        { oraInizio: "asc" },
      ],
    });
    
    return NextResponse.json({
      success: true,
      data: prenotazioni,
      count: prenotazioni.length,
    });
  } catch (error) {
    console.error("Errore GET /api/prenotazioni:", error);
    return NextResponse.json(
      { success: false, error: "Errore nel recupero delle prenotazioni" },
      { status: 500 }
    );
  }
}

// POST /api/prenotazioni - Crea nuova prenotazione
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    const { userId, postoId, data, oraInizio, oraFine, marginePendolare, minutiMarginePendolare, note } = body;
    
    // Validazione campi obbligatori
    if (!userId || !postoId || !data || !oraInizio || !oraFine) {
      return NextResponse.json(
        { success: false, error: "Campi obbligatori mancanti: userId, postoId, data, oraInizio, oraFine" },
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
    
    // Verifica che il posto esista e sia disponibile
    const posto = await prisma.posto.findUnique({ 
      where: { id: postoId },
      include: { sala: true },
    });
    if (!posto) {
      return NextResponse.json(
        { success: false, error: "Posto non trovato" },
        { status: 404 }
      );
    }
    
    // Converti le date - IMPORTANTE: usare UTC per evitare problemi di timezone
    // La stringa data è nel formato "2026-01-07", la convertiamo in UTC mezzanotte
    const [anno, mese, giorno] = data.split("-").map(Number);
    const dataPrenotazione = new Date(Date.UTC(anno, mese - 1, giorno, 0, 0, 0, 0));
    
    console.log(`[API PRENOTAZIONI] Data input: ${data}, Data salvata: ${dataPrenotazione.toISOString()}`);
    
    // Crea oggetti Date per gli orari (usando data fittizia 1970-01-01)
    const [oreInizio, minutiInizio] = oraInizio.split(":").map(Number);
    const [oreFine, minutiFine] = oraFine.split(":").map(Number);
    
    const oraInizioDate = new Date(1970, 0, 1, oreInizio, minutiInizio, 0, 0);
    const oraFineDate = new Date(1970, 0, 1, oreFine, minutiFine, 0, 0);
    
    // Verifica che non ci siano sovrapposizioni
    const prenotazioniEsistenti = await prisma.prenotazione.findMany({
      where: {
        postoId,
        data: dataPrenotazione,
        stato: {
          in: ["CONFERMATA", "CHECK_IN"],
        },
      },
    });
    
    // Controlla sovrapposizioni di orari
    for (const p of prenotazioniEsistenti) {
      const pInizio = p.oraInizio.getHours() * 60 + p.oraInizio.getMinutes();
      const pFine = p.oraFine.getHours() * 60 + p.oraFine.getMinutes();
      const nuovoInizio = oreInizio * 60 + minutiInizio;
      const nuovoFine = oreFine * 60 + minutiFine;
      
      if (nuovoInizio < pFine && nuovoFine > pInizio) {
        return NextResponse.json(
          { success: false, error: "Il posto è già prenotato per questo orario" },
          { status: 409 }
        );
      }
    }
    
    // Verifica orari apertura sala
    const [oreApertura, minutiApertura] = posto.sala.orarioApertura.split(":").map(Number);
    const [oreChiusura, minutiChiusura] = posto.sala.orarioChiusura.split(":").map(Number);
    
    const aperturaMinuti = oreApertura * 60 + minutiApertura;
    const chiusuraMinuti = oreChiusura * 60 + minutiChiusura;
    const inizioMinuti = oreInizio * 60 + minutiInizio;
    const fineMinuti = oreFine * 60 + minutiFine;
    
    if (inizioMinuti < aperturaMinuti || fineMinuti > chiusuraMinuti) {
      return NextResponse.json(
        { 
          success: false, 
          error: `La sala è aperta dalle ${posto.sala.orarioApertura} alle ${posto.sala.orarioChiusura}` 
        },
        { status: 400 }
      );
    }
    
    // Crea la prenotazione
    const prenotazione = await prisma.prenotazione.create({
      data: {
        userId,
        postoId,
        data: dataPrenotazione,
        oraInizio: oraInizioDate,
        oraFine: oraFineDate,
        stato: "CONFERMATA",
        marginePendolare: marginePendolare || false,
        minutiMarginePendolare: minutiMarginePendolare || 30,
        note,
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
        posto: {
          select: {
            id: true,
            numero: true,
            sala: {
              select: {
                id: true,
                nome: true,
                piano: true,
              },
            },
          },
        },
      },
    });
    
    // Crea log evento
    await prisma.logEvento.create({
      data: {
        tipo: "PRENOTAZIONE_CREATA",
        userId,
        prenotazioneId: prenotazione.id,
        descrizione: `Prenotazione creata per posto ${posto.numero}`,
      },
    });
    
    // Crea notifica
    await prisma.notifica.create({
      data: {
        userId,
        tipo: "PRENOTAZIONE",
        titolo: "Prenotazione confermata",
        messaggio: `La tua prenotazione per il posto ${posto.numero} è stata confermata per il ${dataPrenotazione.toLocaleDateString("it-IT")} dalle ${oraInizio} alle ${oraFine}.`,
        actionUrl: "/prenotazioni",
        actionLabel: "Vedi prenotazione",
      },
    });
    
    return NextResponse.json({
      success: true,
      data: prenotazione,
    }, { status: 201 });
    
  } catch (error) {
    console.error("Errore POST /api/prenotazioni:", error);
    return NextResponse.json(
      { success: false, error: "Errore nella creazione della prenotazione" },
      { status: 500 }
    );
  }
}
