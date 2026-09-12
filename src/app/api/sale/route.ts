import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/sale - Lista sale
export async function GET(request: NextRequest) {
  try {
    // Autenticazione DENTRO la rotta (difesa in profondita').
    //
    // PERCHE' E' STATA AGGIUNTA: questa rotta non si autenticava affatto. Il
    // suo unico filtro era il middleware, che pero' si limitava a verificare
    // che ESISTESSE un cookie di sessione: `curl -H 'Cookie:
    // authjs.session-token=x' /api/sale` rispondeva 200 con i dati veri. Ora
    // il middleware verifica il token sul serio, ma non deve restare l'unica
    // barriera: il `matcher` e' una regex e una regex sbagliata ha gia'
    // aggirato il controllo una volta (finding M-5).
    //
    // PERCHE' NON PUBBLICA: le sale non sono un dato personale, ma il loro
    // unico chiamante e' `/prenota`, che e' una pagina riservata; nessuna
    // pagina pubblica (home, login, registrazione, verifica email, reset
    // password, accessibilita') chiama questa API. Renderla pubblica
    // significherebbe pubblicare la mappa e l'occupazione in tempo reale
    // della biblioteca a chiunque, senza che serva a nessuno.
    await requireUser();

    const { searchParams } = new URL(request.url);
    
    // Parametri di filtro
    const piano = searchParams.get("piano");
    const isSilenziosa = searchParams.get("isSilenziosa");
    const isGruppi = searchParams.get("isGruppi");
    
    const where: Record<string, unknown> = {
      attiva: true,
    };
    
    if (piano) {
      where.piano = parseInt(piano);
    }
    
    if (isSilenziosa !== null) {
      where.isSilenziosa = isSilenziosa === "true";
    }
    
    if (isGruppi !== null) {
      where.isGruppi = isGruppi === "true";
    }
    
    const sale = await prisma.sala.findMany({
      where,
      include: {
        _count: {
          select: { posti: true },
        },
        posti: {
          where: { attivo: true },
          select: {
            stato: true,
          },
        },
      },
      orderBy: [
        { piano: "asc" },
        { nome: "asc" },
      ],
    });
    
    // Calcola statistiche disponibilità per ogni sala
    const saleConStats = sale.map((sala) => {
      const postiDisponibili = sala.posti.filter(p => p.stato === "DISPONIBILE").length;
      const postiOccupati = sala.posti.filter(p => p.stato === "OCCUPATO").length;
      const postiTotali = sala.posti.length;
      
      return {
        id: sala.id,
        nome: sala.nome,
        piano: sala.piano,
        descrizione: sala.descrizione,
        isSilenziosa: sala.isSilenziosa,
        isGruppi: sala.isGruppi,
        capienzaMax: sala.capienzaMax,
        orarioApertura: sala.orarioApertura,
        orarioChiusura: sala.orarioChiusura,
        stats: {
          postiTotali,
          postiDisponibili,
          postiOccupati,
          percentualeOccupazione: postiTotali > 0 
            ? Math.round((postiOccupati / postiTotali) * 100) 
            : 0,
        },
      };
    });
    
    return NextResponse.json({
      success: true,
      data: saleConStats,
      count: saleConStats.length,
    });
  } catch (error) {
    // Una sessione mancante non e' un guasto del server: va tradotta nel suo
    // 401/403, altrimenti finirebbe nel 500 generico qui sotto (e in Sentry).
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, code: error.code, error: error.message },
        { status: error.status },
      );
    }

    console.error("Errore GET /api/sale:", error);
    return NextResponse.json(
      { success: false, error: "Errore nel recupero delle sale" },
      { status: 500 }
    );
  }
}
