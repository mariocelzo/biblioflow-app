import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
    }

    if (session.user.ruolo !== "BIBLIOTECARIO" && session.user.ruolo !== "ADMIN") {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
    }

    const userId = params.id;

    // Ottieni dati completi utente
    const utente = await db.user.findUnique({
      where: { id: userId },
      include: {
        prenotazioni: {
          include: {
            posto: {
              include: {
                sala: true,
              },
            },
          },
          orderBy: {
            createdAt: "desc",
          },
          take: 10,
        },
        prestiti: {
          include: {
            libro: true,
          },
          orderBy: {
            createdAt: "desc",
          },
          take: 10,
        },
        notifiche: {
          orderBy: {
            createdAt: "desc",
          },
          take: 5,
        },
        _count: {
          select: {
            prenotazioni: true,
            prestiti: true,
            notifiche: true,
          },
        },
      },
    });

    if (!utente) {
      return NextResponse.json({ error: "Utente non trovato" }, { status: 404 });
    }

    // Statistiche aggiuntive
    const [prenotazioniCompletate, prestitiCompletati, noShowCount] = await Promise.all([
      db.prenotazione.count({
        where: {
          userId: userId,
          stato: "COMPLETATA",
        },
      }),
      db.prestito.count({
        where: {
          userId: userId,
          stato: "RESTITUITO",
        },
      }),
      db.logEvento.count({
        where: {
          userId: userId,
          tipo: "NO_SHOW",
        },
      }),
    ]);

    return NextResponse.json({
      utente,
      statistiche: {
        prenotazioniCompletate,
        prestitiCompletati,
        noShowCount,
      },
    });
  } catch (error) {
    console.error("Errore durante il recupero del profilo:", error);
    return NextResponse.json(
      { error: "Errore durante il recupero del profilo" },
      { status: 500 }
    );
  }
}
