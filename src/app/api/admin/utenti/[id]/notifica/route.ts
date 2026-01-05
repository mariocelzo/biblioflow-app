import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/prisma";

// POST - Invia notifica/sollecito a utente
export async function POST(
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

    const body = await request.json();
    const { tipo, titolo, messaggio, actionUrl, actionLabel } = body;

    // Verifica che l'utente esista
    const utente = await db.user.findUnique({
      where: { id },
    });

    if (!utente) {
      return NextResponse.json({ error: "Utente non trovato" }, { status: 404 });
    }

    // Crea la notifica
    const notifica = await db.notifica.create({
      data: {
        userId: id,
        tipo: tipo || "SISTEMA",
        titolo,
        messaggio,
        actionUrl,
        actionLabel,
      },
    });

    // Log dell'evento
    await db.logEvento.create({
      data: {
        tipo: "OVERRIDE_BIBLIOTECARIO",
        userId: session.user.id,
        targetUserId: id,
        dettagli: {
          azione: "INVIO_NOTIFICA",
          tipoNotifica: tipo,
          titolo,
        },
      },
    });

    return NextResponse.json({
      success: true,
      message: `Notifica inviata a ${utente.nome} ${utente.cognome}`,
      notifica,
    });
  } catch (error) {
    console.error("Errore invio notifica:", error);
    return NextResponse.json(
      { error: "Errore durante l'invio della notifica" },
      { status: 500 }
    );
  }
}
