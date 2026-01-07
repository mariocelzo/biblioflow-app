import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
    }

    if (session.user.ruolo !== "BIBLIOTECARIO" && session.user.ruolo !== "ADMIN") {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
    }

    const { id: postoId } = await params;

    // Ottieni posto con sala
    const posto = await db.posto.findUnique({
      where: { id: postoId },
      include: {
        sala: true,
      },
    });

    if (!posto) {
      return NextResponse.json({ error: "Posto non trovato" }, { status: 404 });
    }

    // Statistiche prenotazioni
    const prenotazioniTotali = await db.prenotazione.count({
      where: { postoId: postoId },
    });

    const prenotazioniCompletate = await db.prenotazione.count({
      where: {
        postoId: postoId,
        stato: "COMPLETATA",
      },
    });

    const noShowCount = await db.prenotazione.count({
      where: {
        postoId: postoId,
        stato: "NO_SHOW",
      },
    });

    // Prenotazioni recenti
    const prenotazioniRecenti = await db.prenotazione.findMany({
      where: { postoId: postoId },
      include: {
        user: {
          select: {
            nome: true,
            cognome: true,
            email: true,
          },
        },
      },
      orderBy: {
        data: "desc",
      },
      take: 10,
    });

    // Prenotazione attuale (se presente)
    const now = new Date();
    const oggi = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    const prenotazioneAttuale = await db.prenotazione.findFirst({
      where: {
        postoId: postoId,
        data: oggi,
        stato: {
          in: ["CHECK_IN", "CONFERMATA"],
        },
      },
      include: {
        user: {
          select: {
            nome: true,
            cognome: true,
            email: true,
          },
        },
      },
      orderBy: {
        oraInizio: "asc",
      },
    });

    // Log eventi relativi al posto
    const logEventi = await db.logEvento.findMany({
      where: {
        prenotazione: {
          postoId: postoId,
        },
      },
      include: {
        user: {
          select: {
            nome: true,
            cognome: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 20,
    });

    // Calcola tasso di utilizzo
    const tassoUtilizzo = prenotazioniTotali > 0 
      ? Math.round((prenotazioniCompletate / prenotazioniTotali) * 100) 
      : 0;

    const tassoNoShow = prenotazioniTotali > 0
      ? Math.round((noShowCount / prenotazioniTotali) * 100)
      : 0;

    return NextResponse.json({
      posto,
      statistiche: {
        prenotazioniTotali,
        prenotazioniCompletate,
        noShowCount,
        tassoUtilizzo,
        tassoNoShow,
      },
      prenotazioniRecenti,
      prenotazioneAttuale,
      logEventi,
    });
  } catch (error) {
    console.error("Errore durante il recupero dei dettagli del posto:", error);
    return NextResponse.json(
      { error: "Errore durante il recupero dei dettagli" },
      { status: 500 }
    );
  }
}
