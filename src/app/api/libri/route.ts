import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Traduce l'esito di `requireUser()` nella risposta HTTP corretta.
 *
 * Serve a entrambi gli handler di questo file (GET e OPTIONS) e tiene fuori
 * dal 500 generico cio' che e' un problema di identita' e non un guasto.
 */
function rispostaErroreAuth(error: unknown): NextResponse | null {
  if (error instanceof AuthError) {
    return NextResponse.json(
      { success: false, code: error.code, error: error.message },
      { status: error.status },
    );
  }
  return null;
}

// Hardening B-4 (audit sicurezza 2026-09-04):
// `page`/`limit` arrivavano da `parseInt` senza tetto né controllo di segno.
// Un `limit` enorme (o negativo) si traduce in `take`/`skip` abnormi verso il
// DB (query costose, potenziale DoS) e in risposte JSON gigantesche.
// Qui si applica un clamp esplicito: `limit` in 1..100, `page` >= 1. Valori non
// numerici ricadono sul default; valori fuori range vengono riportati nei
// limiti (nessun 500, comportamento prevedibile).
const LIMIT_DEFAULT = 20;
const LIMIT_MIN = 1;
const LIMIT_MAX = 100;
const PAGE_MIN = 1;

/**
 * Converte un parametro di query in intero applicando un default e un intervallo
 * ammesso. NaN / non finito → `fallback`; fuori range → estremo più vicino.
 */
function intNelRange(
  raw: string | null,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

// GET /api/libri - Ricerca catalogo libri
export async function GET(request: NextRequest) {
  try {
    // Autenticazione DENTRO la rotta (difesa in profondita'): prima non
    // c'era, e l'unica barriera era il controllo di sola presenza del cookie
    // fatto dal middleware — cioe' nessuna barriera. Vedi il commento esteso
    // in `src/app/api/sale/route.ts`.
    //
    // PERCHE' NON PUBBLICA (scelta consapevole): un catalogo di biblioteca
    // potrebbe legittimamente essere una vetrina aperta, ma in BiblioFlow non
    // lo e': gli unici chiamanti sono `/libri` e `/prestiti`, entrambe pagine
    // riservate, e nessuna pagina pubblica interroga questa API. Aprirla
    // adesso sarebbe un cambiamento di prodotto, non una correzione di
    // sicurezza; se un domani si volesse il catalogo pubblico, la strada e'
    // dichiararlo in `publicApiPrefixes` nel middleware e togliere queste
    // righe, in modo esplicito e discusso.
    await requireUser();

    const { searchParams } = new URL(request.url);

    // Parametri di ricerca e filtro
    const q = searchParams.get("q"); // ricerca testuale
    const categoria = searchParams.get("categoria");
    const disponibile = searchParams.get("disponibile");
    const piano = searchParams.get("piano");
    // `limit` limitato a 1..100, `page` almeno 1 (nessun `skip` negativo).
    const limit = intNelRange(
      searchParams.get("limit"),
      LIMIT_DEFAULT,
      LIMIT_MIN,
      LIMIT_MAX,
    );
    const page = intNelRange(
      searchParams.get("page"),
      PAGE_MIN,
      PAGE_MIN,
      Number.MAX_SAFE_INTEGER,
    );

    const where: Record<string, unknown> = {};
    
    // Ricerca testuale su titolo, autore, ISBN
    if (q) {
      where.OR = [
        { titolo: { contains: q, mode: "insensitive" } },
        { autore: { contains: q, mode: "insensitive" } },
        { isbn: { contains: q, mode: "insensitive" } },
      ];
    }
    
    if (categoria) {
      where.categoria = categoria;
    }
    
    if (disponibile === "true") {
      where.copieDisponibili = { gt: 0 };
    }
    
    if (piano) {
      // Guard anti-NaN: un `piano` non numerico non deve arrivare a Prisma
      // (genererebbe un 500). Se non e' un intero valido, il filtro si ignora.
      const pianoNum = Number.parseInt(piano, 10);
      if (Number.isFinite(pianoNum)) {
        where.piano = pianoNum;
      }
    }
    
    // Conta totale per paginazione
    const total = await prisma.libro.count({ where });
    
    // Recupera libri con paginazione
    const libri = await prisma.libro.findMany({
      where,
      orderBy: [
        { titolo: "asc" },
      ],
      skip: (page - 1) * limit,
      take: limit,
    });
    
    return NextResponse.json({
      success: true,
      data: libri,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    const errorAuth = rispostaErroreAuth(error);
    if (errorAuth) return errorAuth;

    console.error("Errore GET /api/libri:", error);
    return NextResponse.json(
      { success: false, error: "Errore nella ricerca dei libri" },
      { status: 500 }
    );
  }
}

// GET /api/libri/categorie - Lista categorie disponibili
export async function OPTIONS() {
  try {
    // Stesso trattamento della GET: e' lo stesso catalogo, visto per
    // categorie. Lasciarla scoperta vanificherebbe il controllo sulla GET.
    await requireUser();

    const categorie = await prisma.libro.findMany({
      select: { categoria: true },
      distinct: ["categoria"],
      where: { categoria: { not: null } },
    });
    
    return NextResponse.json({
      success: true,
      data: categorie.map(c => c.categoria).filter(Boolean),
    });
  } catch (error) {
    const errorAuth = rispostaErroreAuth(error);
    if (errorAuth) return errorAuth;

    console.error("Errore OPTIONS /api/libri:", error);
    return NextResponse.json(
      { success: false, error: "Errore nel recupero delle categorie" },
      { status: 500 }
    );
  }
}
