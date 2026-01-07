import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET: Ottiene profilo utente corrente
export async function GET() {
  try {
    console.log("[API PROFILO GET] Richiesta ricevuta");
    
    const session = await auth();
    console.log("[API PROFILO GET] Session user ID:", session?.user?.id);
    
    if (!session?.user?.id) {
      console.error("[API PROFILO GET] Sessione non valida");
      return NextResponse.json(
        { error: "Non autenticato" },
        { status: 401 }
      );
    }

    console.log("[API PROFILO GET] Cerco utente:", session.user.id);
    
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        nome: true,
        cognome: true,
        email: true,
        matricola: true,
        ruolo: true,
        isPendolare: true,
        tragittoPendolare: true,
        necessitaAccessibilita: true,
        preferenzeAccessibilita: true,
        altoContrasto: true,
        riduzioneMovimento: true,
        darkMode: true,
        dimensioneTesto: true,
        notifichePush: true,
        notificheEmail: true,
        createdAt: true,
      },
    });

    console.log("[API PROFILO GET] Utente trovato:", !!user);

    if (!user) {
      console.error("[API PROFILO GET] Utente non trovato nel DB");
      return NextResponse.json(
        { error: "Utente non trovato" },
        { status: 404 }
      );
    }

    console.log("[API PROFILO GET] Risposta OK");
    return NextResponse.json(user);
  } catch (error) {
    console.error("[API PROFILO GET] Errore completo:", error);
    console.error("[API PROFILO GET] Stack:", error instanceof Error ? error.stack : 'N/A');
    console.error("[API PROFILO GET] Message:", error instanceof Error ? error.message : String(error));
    return NextResponse.json(
      { 
        error: "Errore durante il recupero del profilo",
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}

// PATCH: Aggiorna profilo utente
export async function PATCH(request: NextRequest) {
  try {
    console.log("[API PROFILO PATCH] Richiesta ricevuta");
    
    const session = await auth();
    console.log("[API PROFILO PATCH] Session:", session?.user?.id);
    
    if (!session?.user?.id) {
      console.error("[API PROFILO PATCH] Utente non autenticato");
      return NextResponse.json(
        { error: "Non autenticato" },
        { status: 401 }
      );
    }

    const body = await request.json();
    console.log("[API PROFILO PATCH] Body ricevuto:", body);
    
    // Campi aggiornabili
    const allowedFields = {
      isPendolare: body.isPendolare,
      tragittoPendolare: body.tragittoPendolare,
      necessitaAccessibilita: body.necessitaAccessibilita,
      preferenzeAccessibilita: body.preferenzeAccessibilita,
      altoContrasto: body.altoContrasto,
      riduzioneMovimento: body.riduzioneMovimento,
      darkMode: body.darkMode,
      dimensioneTesto: body.dimensioneTesto,
      notifichePush: body.notifichePush,
      notificheEmail: body.notificheEmail,
    };

    // Rimuovi campi undefined
    const updateData = Object.fromEntries(
      Object.entries(allowedFields).filter(([, value]) => value !== undefined)
    );

    console.log("[API PROFILO PATCH] Aggiornamento profilo per:", session.user.id);
    console.log("[API PROFILO PATCH] Dati filtrati:", updateData);

    const updatedUser = await prisma.user.update({
      where: { id: session.user.id },
      data: updateData,
      select: {
        id: true,
        nome: true,
        cognome: true,
        email: true,
        matricola: true,
        ruolo: true,
        isPendolare: true,
        tragittoPendolare: true,
        necessitaAccessibilita: true,
        preferenzeAccessibilita: true,
        altoContrasto: true,
        riduzioneMovimento: true,
        darkMode: true,
        dimensioneTesto: true,
        notifichePush: true,
        notificheEmail: true,
      },
    });

    console.log("[API PROFILO PATCH] Profilo aggiornato con successo:", {
      userId: updatedUser.id,
      necessitaAccessibilita: updatedUser.necessitaAccessibilita,
      altoContrasto: updatedUser.altoContrasto,
      riduzioneMovimento: updatedUser.riduzioneMovimento,
    });

    return NextResponse.json(updatedUser);
  } catch (error) {
    console.error("[API PROFILO PATCH] Errore completo:", error);
    console.error("[API PROFILO PATCH] Stack trace:", error instanceof Error ? error.stack : 'N/A');
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Errore durante l'aggiornamento del profilo" },
      { status: 500 }
    );
  }
}
