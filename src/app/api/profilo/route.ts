import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// ============================================================================
// API PROFILO UTENTE — BiblioFlow
// ============================================================================
// Hardening B-1 / B-3 (audit sicurezza 2026-09-04):
//  - B-1: la risposta di errore 500 NON deve contenere `error.message` /
//         `error.stack` (dettagli interni: nomi di colonne, driver, path).
//         Al client va un messaggio generico; il dettaglio completo resta solo
//         nei log server-side (`console.error`).
//  - B-3: NON loggare il payload della PATCH né l'id utente in chiaro. Il body
//         contiene dati di accessibilità (categoria potenzialmente sensibile):
//         niente `console.log` di request/preferenze. Restano solo i
//         `console.error` sui percorsi di errore, senza dump del body.
// ============================================================================

// Campi del profilo restituiti al client: unico punto di verità, riusato da
// GET e PATCH per non divergere nel tempo.
const PROFILO_SELECT = {
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
} as const;

// GET: Ottiene il profilo dell'utente corrente
export async function GET() {
  try {
    const session = await auth();

    // Senza sessione valida non si espone alcun dato di profilo.
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: PROFILO_SELECT,
    });

    if (!user) {
      return NextResponse.json(
        { error: "Utente non trovato" },
        { status: 404 },
      );
    }

    return NextResponse.json(user);
  } catch (error) {
    // Log completo SOLO server-side (B-1): utile per il debug, invisibile al client.
    console.error("[API PROFILO GET] Errore:", error);
    return NextResponse.json(
      { error: "Errore durante il recupero del profilo" },
      { status: 500 },
    );
  }
}

// PATCH: Aggiorna il profilo dell'utente corrente
export async function PATCH(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
    }

    // Il body puo' contenere dati di accessibilita': lo si legge ma NON lo si
    // logga (B-3). Solo i campi in whitelist vengono considerati.
    const body = await request.json();

    // Campi aggiornabili dall'utente sul proprio profilo (whitelist esplicita:
    // impedisce di scrivere `ruolo`, `email`, ecc. tramite mass-assignment).
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

    // Rimuove i campi non presenti nel body (undefined) per non azzerarli.
    const updateData = Object.fromEntries(
      Object.entries(allowedFields).filter(([, value]) => value !== undefined),
    );

    const updatedUser = await prisma.user.update({
      where: { id: session.user.id },
      data: updateData,
      select: PROFILO_SELECT,
    });

    return NextResponse.json(updatedUser);
  } catch (error) {
    // Log completo SOLO server-side (B-1): al client nessun dettaglio interno.
    console.error("[API PROFILO PATCH] Errore:", error);
    return NextResponse.json(
      { error: "Errore durante l'aggiornamento del profilo" },
      { status: 500 },
    );
  }
}
