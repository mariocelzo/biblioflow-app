import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/prisma";

// PATCH - Cambia stato di un posto (manutenzione/disponibile)
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

    if (session.user.ruolo !== "BIBLIOTECARIO" && session.user.ruolo !== "ADMIN") {
      return NextResponse.json({ error: "Accesso negato" }, { status: 403 });
    }

    const body = await request.json();
    const { stato, motivo } = body;

    // Valida lo stato
    const statiValidi = ["DISPONIBILE", "MANUTENZIONE", "RISERVATO"];
    if (!statiValidi.includes(stato)) {
      return NextResponse.json(
        { error: "Stato non valido. Usa: DISPONIBILE, MANUTENZIONE, RISERVATO" },
        { status: 400 }
      );
    }

    // Verifica che il posto esista
    const posto = await db.posto.findUnique({
      where: { id },
      include: { sala: true },
    });

    if (!posto) {
      return NextResponse.json({ error: "Posto non trovato" }, { status: 404 });
    }

    // Se il posto è OCCUPATO, non permettere cambio stato
    if (posto.stato === "OCCUPATO" && stato !== "OCCUPATO") {
      return NextResponse.json(
        { error: "Impossibile modificare un posto occupato. Attendere il check-out." },
        { status: 400 }
      );
    }

    // Aggiorna lo stato del posto
    const postoAggiornato = await db.posto.update({
      where: { id },
      data: { stato },
      include: { sala: true },
    });

    // Log dell'evento
    await db.logEvento.create({
      data: {
        tipo: "OVERRIDE_BIBLIOTECARIO",
        userId: session.user.id,
        dettagli: {
          azione: "CAMBIO_STATO_POSTO",
          postoId: id,
          postoNumero: posto.numero,
          salaNome: posto.sala.nome,
          statoVecchio: posto.stato,
          statoNuovo: stato,
          motivo: motivo || "Non specificato",
        },
      },
    });

    return NextResponse.json({
      success: true,
      message: `Posto ${posto.numero} aggiornato a ${stato}`,
      posto: postoAggiornato,
    });
  } catch (error) {
    console.error("Errore aggiornamento posto:", error);
    return NextResponse.json(
      { error: "Errore durante l'aggiornamento del posto" },
      { status: 500 }
    );
  }
}

// GET - Dettagli posto con statistiche
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

    const posto = await db.posto.findUnique({
      where: { id },
      include: {
        sala: true,
        prenotazioni: {
          take: 10,
          orderBy: { data: "desc" },
          include: {
            user: {
              select: { nome: true, cognome: true, matricola: true },
            },
          },
        },
        _count: {
          select: { prenotazioni: true },
        },
      },
    });

    if (!posto) {
      return NextResponse.json({ error: "Posto non trovato" }, { status: 404 });
    }

    return NextResponse.json({ posto });
  } catch (error) {
    console.error("Errore recupero posto:", error);
    return NextResponse.json(
      { error: "Errore durante il recupero del posto" },
      { status: 500 }
    );
  }
}
