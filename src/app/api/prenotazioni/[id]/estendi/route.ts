import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/prenotazioni/[id]/estendi - Verifica disponibilità slot per estensione
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    
    // Trova la prenotazione corrente
    const prenotazione = await prisma.prenotazione.findUnique({
      where: { id },
      include: {
        posto: {
          include: {
            sala: true,
          },
        },
      },
    });
    
    if (!prenotazione) {
      return NextResponse.json(
        { success: false, error: "Prenotazione non trovata" },
        { status: 404 }
      );
    }
    
    // Solo prenotazioni attive possono essere estese
    if (!["CONFERMATA", "CHECK_IN"].includes(prenotazione.stato)) {
      return NextResponse.json(
        { success: false, error: "Solo prenotazioni attive possono essere estese" },
        { status: 400 }
      );
    }
    
    const oraFineCorrente = new Date(prenotazione.oraFine);
    const dataPrenotazione = new Date(prenotazione.data);
    
    // Genera slot disponibili per estensione (max 4 ore extra)
    const slotDisponibili: Array<{
      oraInizio: string;
      oraFine: string;
      disponibile: boolean;
      durataTotale: number; // ore totali inclusa estensione
    }> = [];
    
    // Orario chiusura biblioteca (18:00)
    const orarioChiusura = 18;
    
    // Calcola durata attuale in ore
    const oraInizioCorrente = new Date(prenotazione.oraInizio);
    const durataAttualeOre = (oraFineCorrente.getTime() - oraInizioCorrente.getTime()) / (1000 * 60 * 60);
    
    // Slot da 2 ore, partendo dall'ora di fine attuale
    let oraSlot = oraFineCorrente.getHours();
    let durataAccumulata = durataAttualeOre;
    
    while (oraSlot < orarioChiusura && durataAccumulata < 8) { // Max 8 ore totali
      const oraInizioSlot = oraSlot;
      const oraFineSlot = Math.min(oraSlot + 2, orarioChiusura);
      
      if (oraFineSlot <= oraSlot) break;
      
      // Verifica se lo slot è disponibile (nessun'altra prenotazione)
      const slotInizio = new Date(dataPrenotazione);
      slotInizio.setHours(oraInizioSlot, 0, 0, 0);
      
      const slotFine = new Date(dataPrenotazione);
      slotFine.setHours(oraFineSlot, 0, 0, 0);
      
      const prenotazioneEsistente = await prisma.prenotazione.findFirst({
        where: {
          postoId: prenotazione.postoId,
          id: { not: prenotazione.id },
          stato: { in: ["CONFERMATA", "CHECK_IN"] },
          data: dataPrenotazione,
          OR: [
            {
              AND: [
                { oraInizio: { lte: slotInizio } },
                { oraFine: { gt: slotInizio } },
              ],
            },
            {
              AND: [
                { oraInizio: { lt: slotFine } },
                { oraFine: { gte: slotFine } },
              ],
            },
            {
              AND: [
                { oraInizio: { gte: slotInizio } },
                { oraFine: { lte: slotFine } },
              ],
            },
          ],
        },
      });
      
      durataAccumulata += (oraFineSlot - oraInizioSlot);
      
      slotDisponibili.push({
        oraInizio: `${oraInizioSlot.toString().padStart(2, '0')}:00`,
        oraFine: `${oraFineSlot.toString().padStart(2, '0')}:00`,
        disponibile: !prenotazioneEsistente,
        durataTotale: durataAccumulata,
      });
      
      oraSlot = oraFineSlot;
    }
    
    return NextResponse.json({
      success: true,
      data: {
        prenotazione: {
          id: prenotazione.id,
          oraInizio: prenotazione.oraInizio,
          oraFine: prenotazione.oraFine,
          data: prenotazione.data,
          stato: prenotazione.stato,
          posto: {
            numero: prenotazione.posto.numero,
            sala: prenotazione.posto.sala.nome,
            piano: prenotazione.posto.sala.piano,
          },
        },
        slotDisponibili,
        durataAttuale: durataAttualeOre,
        maxDurataTotale: 8, // ore
      },
    });
  } catch (error) {
    console.error("Errore GET /api/prenotazioni/[id]/estendi:", error);
    return NextResponse.json(
      { success: false, error: "Errore nel recupero degli slot disponibili" },
      { status: 500 }
    );
  }
}

// POST /api/prenotazioni/[id]/estendi - Estendi la prenotazione
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { nuovaOraFine } = body;
    
    if (!nuovaOraFine) {
      return NextResponse.json(
        { success: false, error: "Specificare la nuova ora di fine" },
        { status: 400 }
      );
    }
    
    // Trova la prenotazione corrente
    const prenotazione = await prisma.prenotazione.findUnique({
      where: { id },
      include: {
        posto: {
          include: {
            sala: true,
          },
        },
        user: {
          select: {
            id: true,
            nome: true,
            cognome: true,
          },
        },
      },
    });
    
    if (!prenotazione) {
      return NextResponse.json(
        { success: false, error: "Prenotazione non trovata" },
        { status: 404 }
      );
    }
    
    // Solo prenotazioni attive possono essere estese
    if (!["CONFERMATA", "CHECK_IN"].includes(prenotazione.stato)) {
      return NextResponse.json(
        { success: false, error: "Solo prenotazioni attive possono essere estese" },
        { status: 400 }
      );
    }
    
    // Parse nuova ora fine
    const [ore, minuti] = nuovaOraFine.split(':').map(Number);
    const nuovaFine = new Date(prenotazione.data);
    nuovaFine.setHours(ore, minuti, 0, 0);
    
    const oraFineCorrente = new Date(prenotazione.oraFine);
    
    // Verifica che la nuova ora sia dopo quella attuale
    if (nuovaFine <= oraFineCorrente) {
      return NextResponse.json(
        { success: false, error: "La nuova ora di fine deve essere successiva a quella attuale" },
        { status: 400 }
      );
    }
    
    // Verifica che non superi l'orario di chiusura (18:00)
    if (ore > 18 || (ore === 18 && minuti > 0)) {
      return NextResponse.json(
        { success: false, error: "Non puoi estendere oltre l'orario di chiusura (18:00)" },
        { status: 400 }
      );
    }
    
    // Verifica disponibilità dello slot
    const prenotazioneConflitto = await prisma.prenotazione.findFirst({
      where: {
        postoId: prenotazione.postoId,
        id: { not: prenotazione.id },
        stato: { in: ["CONFERMATA", "CHECK_IN"] },
        data: prenotazione.data,
        oraInizio: { lt: nuovaFine },
        oraFine: { gt: oraFineCorrente },
      },
    });
    
    if (prenotazioneConflitto) {
      return NextResponse.json(
        { success: false, error: "Lo slot richiesto non è disponibile - c'è già un'altra prenotazione" },
        { status: 409 }
      );
    }
    
    // Calcola nuova durata
    const oraInizio = new Date(prenotazione.oraInizio);
    const nuovaDurataOre = (nuovaFine.getTime() - oraInizio.getTime()) / (1000 * 60 * 60);
    
    if (nuovaDurataOre > 8) {
      return NextResponse.json(
        { success: false, error: "La durata massima di una prenotazione è 8 ore" },
        { status: 400 }
      );
    }
    
    // Aggiorna la prenotazione
    const prenotazioneAggiornata = await prisma.prenotazione.update({
      where: { id },
      data: {
        oraFine: nuovaFine,
      },
      include: {
        posto: {
          include: {
            sala: true,
          },
        },
      },
    });
    
    // Crea log evento
    await prisma.logEvento.create({
      data: {
        tipo: "PRENOTAZIONE_CREATA", // Usiamo questo tipo per ora (potremmo aggiungere PRENOTAZIONE_ESTESA allo schema)
        descrizione: `Prenotazione estesa fino alle ${nuovaOraFine} per posto ${prenotazione.posto.numero}`,
        userId: prenotazione.userId,
        prenotazioneId: prenotazione.id,
      },
    });
    
    // Crea notifica
    await prisma.notifica.create({
      data: {
        userId: prenotazione.userId,
        tipo: "SISTEMA",
        titolo: "Prenotazione estesa",
        messaggio: `La tua prenotazione per il posto ${prenotazione.posto.numero} è stata estesa fino alle ${nuovaOraFine}.`,
        link: `/prenotazioni`,
      },
    });
    
    return NextResponse.json({
      success: true,
      message: `Prenotazione estesa fino alle ${nuovaOraFine}`,
      data: {
        id: prenotazioneAggiornata.id,
        oraInizio: prenotazioneAggiornata.oraInizio,
        oraFine: prenotazioneAggiornata.oraFine,
        nuovaDurataOre,
        posto: {
          numero: prenotazioneAggiornata.posto.numero,
          sala: prenotazioneAggiornata.posto.sala.nome,
        },
      },
    });
  } catch (error) {
    console.error("Errore POST /api/prenotazioni/[id]/estendi:", error);
    return NextResponse.json(
      { success: false, error: "Errore nell'estensione della prenotazione" },
      { status: 500 }
    );
  }
}
