import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/prisma";

// PATCH - Attiva/Disattiva utente
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    const { id } = await params;

    if (!session?.user) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    if (session.user.ruolo !== "ADMIN") {
      return NextResponse.json(
        { error: "Solo gli amministratori possono modificare gli utenti" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { attivo } = body;

    // Verifica che l'utente esista
    const utente = await db.user.findUnique({
      where: { id },
    });

    if (!utente) {
      return NextResponse.json({ error: "Utente non trovato" }, { status: 404 });
    }

    // Non permettere di disattivare se stessi
    if (id === session.user.id) {
      return NextResponse.json(
        { error: "Non puoi disattivare il tuo account" },
        { status: 400 }
      );
    }

    // Aggiorna lo stato dell'utente
    const utenteAggiornato = await db.user.update({
      where: { id },
      data: { attivo },
    });

    // Log dell'evento
    await db.logEvento.create({
      data: {
        tipo: "OVERRIDE_BIBLIOTECARIO",
        userId: session.user.id,
        targetUserId: id,
        dettagli: {
          azione: attivo ? "ATTIVAZIONE_UTENTE" : "DISATTIVAZIONE_UTENTE",
          utenteEmail: utente.email,
          utenteNome: `${utente.nome} ${utente.cognome}`,
        },
      },
    });

    // Se disattivato, invia notifica
    if (!attivo) {
      await db.notifica.create({
        data: {
          userId: id,
          tipo: "SISTEMA",
          titolo: "Account disattivato",
          messaggio:
            "Il tuo account è stato temporaneamente disattivato. Contatta la biblioteca per maggiori informazioni.",
        },
      });
    }

    return NextResponse.json({
      success: true,
      message: attivo
        ? `Account di ${utente.nome} ${utente.cognome} attivato`
        : `Account di ${utente.nome} ${utente.cognome} disattivato`,
      utente: utenteAggiornato,
    });
  } catch (error) {
    console.error("Errore aggiornamento utente:", error);
    return NextResponse.json(
      { error: "Errore durante l'aggiornamento dell'utente" },
      { status: 500 }
    );
  }
}

// GET - Dettagli utente con storico
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    const { id } = await params;

    if (!session?.user) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    if (session.user.ruolo !== "BIBLIOTECARIO" && session.user.ruolo !== "ADMIN") {
      return NextResponse.json({ error: "Accesso negato" }, { status: 403 });
    }

    const utente = await db.user.findUnique({
      where: { id },
      include: {
        prenotazioni: {
          take: 20,
          orderBy: { createdAt: "desc" },
          include: {
            posto: {
              include: { sala: true },
            },
          },
        },
        prestiti: {
          take: 20,
          orderBy: { dataPrestito: "desc" },
          include: { libro: true },
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

    // Calcola statistiche
    const noShowCount = await db.logEvento.count({
      where: {
        userId: id,
        tipo: "NO_SHOW",
      },
    });

    return NextResponse.json({
      utente,
      statistiche: {
        totalePrenotazioni: utente._count.prenotazioni,
        totalePrestiti: utente._count.prestiti,
        noShow: noShowCount,
      },
    });
  } catch (error) {
    console.error("Errore recupero utente:", error);
    return NextResponse.json(
      { error: "Errore durante il recupero dell'utente" },
      { status: 500 }
    );
  }
}
