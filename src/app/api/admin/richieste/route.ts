import { NextRequest, NextResponse } from "next/server";
import { Prisma, StatoRichiesta } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// GET: Recupera tutte le richieste (filtrabili)
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const stato = searchParams.get("stato");

        // Filtro opzionale per stato: il valore arriva come stringa dalla query
        // string e va trattato come membro dell'enum StatoRichiesta di Prisma,
        // non come "any".
        const whereClause: Prisma.RichiestaPreparazioneWhereInput = stato
            ? { stato: stato as StatoRichiesta }
            : {};

        const richieste = await prisma.richiestaPreparazione.findMany({
            where: whereClause,
            include: {
                user: {
                    select: { nome: true, cognome: true, email: true, matricola: true }
                },
                libro: {
                    select: { titolo: true, autore: true, isbn: true, scaffale: true, piano: true, copertina: true }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        return NextResponse.json({ success: true, data: richieste });
    } catch (error) {
        console.error("Error fetching requests:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

// PATCH: Aggiorna stato richiesta
export async function PATCH(request: NextRequest) {
    try {
        const body = await request.json();
        const { id, stato, note } = body;

        if (!id || !stato) {
            return NextResponse.json({ error: "ID and Stato required" }, { status: 400 });
        }

        // Se stiamo completando/evadendo, setta data
        const evasaAt = (stato === "PRONTA_RITIRO" || stato === "COMPLETATA") ? new Date() : undefined;

        const richiesta = await prisma.richiestaPreparazione.update({
            where: { id },
            data: {
                stato,
                note, // Opzionale: appendere note o sovrascrivere? Qui sovrascrivo o aggiorno se passato
                ...(evasaAt && { evasaAt })
            }
        });

        return NextResponse.json({ success: true, data: richiesta });
    } catch (error) {
        console.error("Error updating request:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
