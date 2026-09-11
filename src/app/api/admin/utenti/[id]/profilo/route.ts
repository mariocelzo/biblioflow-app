import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/prisma";

/**
 * Colonne di `User` esposte da questa rotta.
 *
 * PERCHE': l'handler leggeva l'utente senza `select`, quindi restituiva TUTTE
 * le colonne. Oltre all'eccesso di informazioni verso lo staff (i campi di
 * accessibilita' e il tragitto pendolare non sono usati da nessuna schermata
 * admin), il vero problema e' il comportamento predefinito: senza un elenco
 * esplicito, ogni colonna futura di `User` finisce in risposta senza che
 * nessuno lo abbia deciso.
 *
 * L'elenco e' deliberatamente identico a quello di `../route.ts`
 * (`UTENTE_ADMIN_SELECT`): le due rotte descrivono lo stesso utente allo stesso
 * pubblico e non devono divergere. I test `TC-SEC-USR-0xx` confrontano
 * entrambe le risposte con lo stesso insieme atteso, cosi' una modifica fatta
 * solo da una parte viene segnalata.
 */
const UTENTE_ADMIN_SELECT = {
  id: true,
  nome: true,
  cognome: true,
  email: true,
  matricola: true,
  ruolo: true,
  attivo: true,
  emailVerificata: true,
  isPendolare: true,
  ultimoAccesso: true,
  createdAt: true,
} as const;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
    }

    if (session.user.ruolo !== "BIBLIOTECARIO" && session.user.ruolo !== "ADMIN") {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
    }

    const { id: userId } = await params;

    // Dati dell'utente: colonne scalari da `UTENTE_ADMIN_SELECT`, relazioni
    // annidate invariate (la forma della risposta non cambia).
    const utente = await db.user.findUnique({
      where: { id: userId },
      select: {
        ...UTENTE_ADMIN_SELECT,
        prenotazioni: {
          include: {
            posto: {
              include: {
                sala: true,
              },
            },
          },
          orderBy: {
            createdAt: "desc",
          },
          take: 10,
        },
        prestiti: {
          include: {
            libro: true,
          },
          orderBy: {
            createdAt: "desc",
          },
          take: 10,
        },
        notifiche: {
          orderBy: {
            createdAt: "desc",
          },
          take: 5,
        },
        _count: {
          select: {
            prenotazioni: true,
            prestiti: true,
            notifiche: true,
          },
        },
      },
    });

    if (!utente) {
      return NextResponse.json({ error: "Utente non trovato" }, { status: 404 });
    }

    // Statistiche aggiuntive
    const [prenotazioniCompletate, prestitiCompletati, noShowCount] = await Promise.all([
      db.prenotazione.count({
        where: {
          userId: userId,
          stato: "COMPLETATA",
        },
      }),
      db.prestito.count({
        where: {
          userId: userId,
          stato: "RESTITUITO",
        },
      }),
      db.logEvento.count({
        where: {
          userId: userId,
          tipo: "NO_SHOW",
        },
      }),
    ]);

    return NextResponse.json({
      utente,
      statistiche: {
        prenotazioniCompletate,
        prestitiCompletati,
        noShowCount,
      },
    });
  } catch (error) {
    console.error("Errore durante il recupero del profilo:", error);
    return NextResponse.json(
      { error: "Errore durante il recupero del profilo" },
      { status: 500 }
    );
  }
}
