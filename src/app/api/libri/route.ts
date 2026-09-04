import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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
    console.error("Errore OPTIONS /api/libri:", error);
    return NextResponse.json(
      { success: false, error: "Errore nel recupero delle categorie" },
      { status: 500 }
    );
  }
}
