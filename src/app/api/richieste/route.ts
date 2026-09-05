import { NextResponse, type NextRequest } from "next/server";

import { AuthError, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Lunghezza massima ammessa per la nota utente allegata alla richiesta.
// PERCHE': il campo e' testo libero proveniente dal client; senza un limite si
// potrebbe abusare della colonna (payload enormi) e degradare storage/UI.
const NOTE_MAX_LENGTH = 500;

// Mappa gli errori applicativi sullo status corretto (stessa logica delle altre
// route). Un AuthError deve propagare il suo status 401/403/404.
function errorResponse(error: unknown, fallback: string) {
  if (error instanceof AuthError) {
    return NextResponse.json(
      { success: false, code: error.code, error: error.message },
      { status: error.status },
    );
  }

  console.error(fallback, error);
  return NextResponse.json({ error: fallback }, { status: 500 });
}

// POST: Crea una nuova richiesta di preparazione
export async function POST(request: NextRequest) {
  try {
    // C-6: qui c'era un commento "Auth check rimosso ... prototipo" e lo userId
    // veniva preso dal body (chiunque poteva creare richieste per conto di
    // altri). Ora serve una sessione e l'intestatario e' SEMPRE user.id.
    const user = await requireUser();

    const body = await request.json();
    const { libroId, note } = body;

    if (!libroId) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Validazione della nota (campo testo libero, opzionale, max 500 caratteri).
    if (note !== undefined && note !== null) {
      if (typeof note !== "string" || note.length > NOTE_MAX_LENGTH) {
        return NextResponse.json(
          { error: `Campo note non valido (max ${NOTE_MAX_LENGTH} caratteri)` },
          { status: 422 },
        );
      }
    }

    // 2. Crea richiesta - lo userId deriva dalla sessione, mai dal body.
    const richiesta = await prisma.richiestaPreparazione.create({
      data: {
        userId: user.id,
        libroId,
        note,
        stato: "PENDENTE",
      },
    });

    return NextResponse.json({ success: true, data: richiesta }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "Internal Server Error");
  }
}

// GET: Recupera le richieste dell'utente autenticato
export async function GET() {
  try {
    // C-6: prima filtrava per ?userId= dalla query (IDOR: si leggevano le
    // richieste di chiunque). Ora si restituiscono SOLO quelle dell'utente
    // di sessione.
    const user = await requireUser();

    const richieste = await prisma.richiestaPreparazione.findMany({
      where: { userId: user.id },
      include: { libro: true },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ success: true, data: richieste });
  } catch (error) {
    return errorResponse(error, "Error fetching requests");
  }
}
