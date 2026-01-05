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

    // Ottieni storico eventi
    const eventi = await db.logEvento.findMany({
      where: {
        OR: [
          { userId: userId },
          { targetUserId: userId },
        ],
      },
      include: {
        user: {
          select: {
            nome: true,
            cognome: true,
            email: true,
          },
        },
        prenotazione: {
          include: {
            posto: {
              include: {
                sala: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 50,
    });

    return NextResponse.json({ eventi });
  } catch (error) {
    console.error("Errore durante il recupero dello storico:", error);
    return NextResponse.json(
      { error: "Errore durante il recupero dello storico" },
      { status: 500 }
    );
  }
}
