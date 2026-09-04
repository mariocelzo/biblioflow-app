import { NextRequest, NextResponse } from "next/server";

import { assertOwnership, AuthError, isStaff, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isSafeInternalPath } from "@/lib/safe-redirect";

// Mappa gli errori applicativi sullo status corretto (stessa logica di
// src/app/api/prenotazioni/[id]/route.ts). Un AuthError deve propagare il suo
// status 401/403/404 invece di finire in un generico 500.
function errorResponse(error: unknown, fallback: string) {
  if (error instanceof AuthError) {
    return NextResponse.json(
      { success: false, code: error.code, error: error.message },
      { status: error.status },
    );
  }

  console.error(fallback, error);
  return NextResponse.json(
    { success: false, error: fallback },
    { status: 500 },
  );
}

// GET /api/notifiche - Lista notifiche dell'utente autenticato
export async function GET(request: NextRequest) {
  try {
    // C-4: l'endpoint era pubblico e leggeva il destinatario da ?userId=
    // (IDOR: si potevano leggere le notifiche di chiunque). Ora il destinatario
    // e' SEMPRE l'utente di sessione e il parametro ?userId= viene ignorato.
    const user = await requireUser();

    const { searchParams } = new URL(request.url);

    const letta = searchParams.get("letta"); // "true" | "false" | null (tutte)
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");

    const where: Record<string, unknown> = { userId: user.id };

    if (letta !== null) {
      where.letta = letta === "true";
    }

    const [notifiche, totale, nonLette] = await Promise.all([
      prisma.notifica.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.notifica.count({ where: { userId: user.id } }),
      prisma.notifica.count({ where: { userId: user.id, letta: false } }),
    ]);

    return NextResponse.json({
      success: true,
      data: notifiche,
      count: notifiche.length,
      totale,
      nonLette,
    });
  } catch (error) {
    return errorResponse(error, "Errore nel recupero delle notifiche");
  }
}

// POST /api/notifiche - Crea nuova notifica (uso interno/staff)
export async function POST(request: NextRequest) {
  try {
    // C-4: la creazione di notifiche verso un utente arbitrario e' riservata
    // allo staff (BIBLIOTECARIO/ADMIN). Prima l'endpoint era completamente aperto.
    const user = await requireUser();
    if (!isStaff(user.ruolo)) {
      throw new AuthError(
        403,
        "RUOLO_NON_AUTORIZZATO",
        "Solo lo staff puo' creare notifiche",
      );
    }

    const body = await request.json();
    const { userId, tipo, titolo, messaggio, actionUrl, actionLabel } = body;

    if (!userId || !tipo || !titolo || !messaggio) {
      return NextResponse.json(
        { success: false, error: "Campi obbligatori: userId, tipo, titolo, messaggio" },
        { status: 400 }
      );
    }

    // B-8: actionUrl e' un link cliccabile mostrato nella UI notifiche. Se
    // fornito deve essere un percorso interno sicuro: un valore come
    // "https://phishing.example" o "javascript:..." e' un open-redirect / XSS.
    if (
      actionUrl !== undefined &&
      actionUrl !== null &&
      actionUrl !== "" &&
      !isSafeInternalPath(actionUrl)
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "actionUrl non valido: sono ammessi solo percorsi interni assoluti",
        },
        { status: 422 }
      );
    }

    // Verifica che l'utente destinatario esista
    const destinatario = await prisma.user.findUnique({ where: { id: userId } });
    if (!destinatario) {
      return NextResponse.json(
        { success: false, error: "Utente non trovato" },
        { status: 404 }
      );
    }

    const notifica = await prisma.notifica.create({
      data: {
        userId,
        tipo,
        titolo,
        messaggio,
        actionUrl,
        actionLabel,
      },
    });

    return NextResponse.json({
      success: true,
      data: notifica,
    }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "Errore nella creazione della notifica");
  }
}

// PATCH /api/notifiche - Aggiorna notifiche dell'utente (segna come letta/e)
export async function PATCH(request: NextRequest) {
  try {
    // C-4: l'endpoint accettava un `userId` dal body e poteva aggiornare
    // notifiche di altri utenti (IDOR). Ora si opera SEMPRE e solo sulle
    // notifiche possedute dall'utente di sessione.
    const user = await requireUser();

    const body = await request.json();
    const { ids, segnaLetta, segnaTutteLette } = body;

    // Segna tutte le PROPRIE notifiche come lette.
    if (segnaTutteLette) {
      const result = await prisma.notifica.updateMany({
        where: { userId: user.id, letta: false },
        data: { letta: true, lettaAt: new Date() },
      });

      return NextResponse.json({
        success: true,
        aggiornate: result.count,
        message: `${result.count} notifiche segnate come lette`,
      });
    }

    // Segna specifiche notifiche come lette/non lette.
    if (ids && Array.isArray(ids) && ids.length > 0) {
      const result = await prisma.notifica.updateMany({
        // `userId: user.id` nel where: si toccano solo le notifiche dell'utente,
        // gli id non posseduti vengono semplicemente ignorati.
        where: { id: { in: ids }, userId: user.id },
        data: {
          letta: segnaLetta !== false,
          lettaAt: segnaLetta !== false ? new Date() : null,
        },
      });

      return NextResponse.json({
        success: true,
        aggiornate: result.count,
      });
    }

    return NextResponse.json(
      { success: false, error: "Specificare ids oppure segnaTutteLette" },
      { status: 400 }
    );
  } catch (error) {
    return errorResponse(error, "Errore nell'aggiornamento delle notifiche");
  }
}

// DELETE /api/notifiche - Elimina una notifica dell'utente
export async function DELETE(request: NextRequest) {
  try {
    // C-4: l'endpoint eliminava per id senza verificare la proprieta' (IDOR).
    const user = await requireUser();

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { success: false, error: "id è obbligatorio" },
        { status: 400 }
      );
    }

    // Carica la notifica e verifica che appartenga all'utente: allo studente
    // non proprietario assertOwnership risponde 404 (risorsa "inesistente").
    const notifica = await prisma.notifica.findUnique({ where: { id } });
    if (!notifica) {
      return NextResponse.json(
        { success: false, error: "Notifica non trovata" },
        { status: 404 }
      );
    }

    assertOwnership(notifica, user);

    await prisma.notifica.delete({ where: { id } });

    return NextResponse.json({
      success: true,
      message: "Notifica eliminata",
    });
  } catch (error) {
    return errorResponse(error, "Errore nell'eliminazione della notifica");
  }
}
