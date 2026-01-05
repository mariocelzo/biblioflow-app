import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    
    if (!session?.user) {
      return NextResponse.json(
        { error: "Non autenticato" },
        { status: 401 }
      );
    }

    if (session.user.ruolo !== "ADMIN" && session.user.ruolo !== "BIBLIOTECARIO") {
      return NextResponse.json(
        { error: "Accesso negato" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { azione, prestitoIds, prestitoId } = body;

    switch (azione) {
      case "RESTITUISCI": {
        if (!prestitoId) {
          return NextResponse.json(
            { error: "ID prestito mancante" },
            { status: 400 }
          );
        }

        const prestito = await prisma.prestito.findUnique({
          where: { id: prestitoId },
          include: { user: true, libro: true }
        });

        if (!prestito) {
          return NextResponse.json(
            { error: "Prestito non trovato" },
            { status: 404 }
          );
        }

        if (prestito.stato === "RESTITUITO") {
          return NextResponse.json(
            { error: "Prestito già restituito" },
            { status: 400 }
          );
        }

        // Calcola giorni di ritardo
        const oggi = new Date();
        const scadenza = new Date(prestito.dataScadenza);
        const giorniRitardo = Math.max(0, Math.floor((oggi.getTime() - scadenza.getTime()) / (1000 * 60 * 60 * 24)));

        // Update prestito
        await prisma.prestito.update({
          where: { id: prestitoId },
          data: { 
            stato: "RESTITUITO",
            dataRestituzione: oggi,
            giorniRitardo: giorniRitardo > 0 ? giorniRitardo : undefined
          }
        });

        // Log evento
        await prisma.logEvento.create({
          data: {
            tipo: "PRESTITO_RESTITUITO",
            userId: prestito.user.id,
            dettagli: {
              prestitoId: prestito.id,
              libroId: prestito.libro.id,
              giorniRitardo,
              restituitoDa: session.user.email
            }
          }
        });

        // Notifica utente
        await prisma.notifica.create({
          data: {
            tipo: "SISTEMA",
            titolo: "Prestito restituito",
            messaggio: giorniRitardo > 0 
              ? `Prestito di "${prestito.libro.titolo}" restituito con ${giorniRitardo} giorni di ritardo.`
              : `Prestito di "${prestito.libro.titolo}" restituito correttamente.`,
            userId: prestito.user.id
          }
        });

        return NextResponse.json({
          success: true,
          message: "Prestito restituito",
          giorniRitardo
        });
      }

      case "RINNOVA": {
        if (!prestitoId) {
          return NextResponse.json(
            { error: "ID prestito mancante" },
            { status: 400 }
          );
        }

        const prestito = await prisma.prestito.findUnique({
          where: { id: prestitoId },
          include: { user: true, libro: true }
        });

        if (!prestito) {
          return NextResponse.json(
            { error: "Prestito non trovato" },
            { status: 404 }
          );
        }

        if (prestito.stato !== "ATTIVO" && prestito.stato !== "SCADUTO") {
          return NextResponse.json(
            { error: "Il prestito non può essere rinnovato" },
            { status: 400 }
          );
        }

        // Estendi di 14 giorni
        const nuovaScadenza = new Date();
        nuovaScadenza.setDate(nuovaScadenza.getDate() + 14);

        // Update prestito
        await prisma.prestito.update({
          where: { id: prestitoId },
          data: { 
            stato: "RINNOVATO",
            dataScadenza: nuovaScadenza
          }
        });

        // Log evento
        await prisma.logEvento.create({
          data: {
            tipo: "PRESTITO_CREATO",
            userId: prestito.user.id,
            dettagli: {
              prestitoId: prestito.id,
              libroId: prestito.libro.id,
              azione: "rinnovo",
              vecchiaScadenza: prestito.dataScadenza,
              nuovaScadenza,
              rinnovatoDa: session.user.email
            }
          }
        });

        // Notifica utente
        await prisma.notifica.create({
          data: {
            tipo: "SISTEMA",
            titolo: "Prestito rinnovato",
            messaggio: `Il prestito di "${prestito.libro.titolo}" è stato rinnovato. Nuova scadenza: ${nuovaScadenza.toLocaleDateString('it-IT')}.`,
            userId: prestito.user.id
          }
        });

        return NextResponse.json({
          success: true,
          message: "Prestito rinnovato",
          nuovaScadenza
        });
      }

      case "SOLLECITA_SINGOLO": {
        if (!prestitoId) {
          return NextResponse.json(
            { error: "ID prestito mancante" },
            { status: 400 }
          );
        }

        const prestito = await prisma.prestito.findUnique({
          where: { id: prestitoId },
          include: { user: true, libro: true }
        });

        if (!prestito) {
          return NextResponse.json(
            { error: "Prestito non trovato" },
            { status: 404 }
          );
        }

        const oggi = new Date();
        const scadenza = new Date(prestito.dataScadenza);
        const giorniRitardo = Math.floor((oggi.getTime() - scadenza.getTime()) / (1000 * 60 * 60 * 24));

        // Crea notifica di sollecito
        await prisma.notifica.create({
          data: {
            tipo: "SCADENZA_PRESTITO",
            titolo: "Sollecito restituzione libro",
            messaggio: `Il prestito di "${prestito.libro.titolo}" è scaduto ${giorniRitardo} giorni fa. Si prega di restituirlo al più presto per evitare sanzioni.`,
            userId: prestito.user.id
          }
        });

        // Log evento
        await prisma.logEvento.create({
          data: {
            tipo: "PRESTITO_RESTITUITO",
            userId: prestito.user.id,
            dettagli: {
              prestitoId: prestito.id,
              libroId: prestito.libro.id,
              azione: "sollecito",
              giorniRitardo,
              sollecitoDa: session.user.email
            }
          }
        });

        return NextResponse.json({
          success: true,
          message: "Sollecito inviato"
        });
      }

      case "SOLLECITA_MULTIPLI": {
        if (!prestitoIds || !Array.isArray(prestitoIds)) {
          return NextResponse.json(
            { error: "IDs prestiti mancanti" },
            { status: 400 }
          );
        }

        const prestiti = await prisma.prestito.findMany({
          where: { id: { in: prestitoIds } },
          include: { user: true, libro: true }
        });

        const oggi = new Date();
        let count = 0;

        for (const prestito of prestiti) {
          const scadenza = new Date(prestito.dataScadenza);
          const giorniRitardo = Math.floor((oggi.getTime() - scadenza.getTime()) / (1000 * 60 * 60 * 24));

          if (giorniRitardo > 0) {
            // Crea notifica di sollecito
            await prisma.notifica.create({
              data: {
                tipo: "SCADENZA_PRESTITO",
                titolo: "Sollecito restituzione libro",
                messaggio: `Il prestito di "${prestito.libro.titolo}" è scaduto ${giorniRitardo} giorni fa. Si prega di restituirlo al più presto per evitare sanzioni.`,
                userId: prestito.user.id
              }
            });

            // Log evento
            await prisma.logEvento.create({
              data: {
                tipo: "PRESTITO_RESTITUITO",
                userId: prestito.user.id,
                dettagli: {
                  prestitoId: prestito.id,
                  libroId: prestito.libro.id,
                  azione: "sollecito_batch",
                  giorniRitardo,
                  sollecitoDa: session.user.email
                }
              }
            });

            count++;
          }
        }

        return NextResponse.json({
          success: true,
          message: `${count} solleciti inviati`
        });
      }

      default:
        return NextResponse.json(
          { error: "Azione non valida" },
          { status: 400 }
        );
    }

  } catch (error) {
    console.error("Errore API prestiti admin:", error);
    return NextResponse.json(
      { error: "Errore interno del server" },
      { status: 500 }
    );
  }
}
