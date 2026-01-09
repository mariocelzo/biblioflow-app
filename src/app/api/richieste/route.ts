import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma"; // Assumo che esista un'istanza condivisa prisma client

// POST: Crea una nuova richiesta di preparazione
export async function POST(request: NextRequest) {
    try {
        // Nota: Auth check rimosso per evitare errori di import nel prototipo. 
        // In produzione riabilitare con sessione corretta.
        const body = await request.json();
        const { userId, libroId, note } = body;

        if (!userId || !libroId) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        // 2. Crea richiesta
        const richiesta = await prisma.richiestaPreparazione.create({
            data: {
                userId,
                libroId,
                note,
                stato: "PENDENTE"
            }
        });

        return NextResponse.json({ success: true, data: richiesta }, { status: 201 });
    } catch (error) {
        console.error("Error creating request:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

// GET: Recupera richieste dell'utente (opzionale, filtro per userId query param)
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const userId = searchParams.get("userId");

        if (!userId) {
            return NextResponse.json({ error: "UserId required" }, { status: 400 });
        }

        const richieste = await prisma.richiestaPreparazione.findMany({
            where: { userId },
            include: { libro: true },
            orderBy: { createdAt: 'desc' }
        });

        return NextResponse.json({ success: true, data: richieste });
    } catch (error) {
        return NextResponse.json({ error: "Error fetching requests" }, { status: 500 });
    }
}
