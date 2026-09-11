import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/prisma";
import { staffCriticalApiRateLimiter } from "@/lib/rate-limit";

/**
 * Colonne di `User` che queste route restituiscono al client.
 *
 * PERCHE' UN ELENCO ESPLICITO: prima si leggeva l'utente senza `select`, cioe'
 * "tutte le colonne". Il rischio non e' (piu') l'hash della password, escluso a
 * monte dall'`omit` globale in `src/lib/prisma.ts`; sono due cose diverse:
 *
 *  1. MINIMIZZAZIONE. Al personale di biblioteca finivano anche
 *     `necessitaAccessibilita`, `preferenzeAccessibilita` e
 *     `tragittoPendolare`: informazioni su disabilita' e spostamenti abituali
 *     della persona, che nessuna funzione dell'area admin usa o mostra.
 *  2. IL DIFETTO "A OROLOGERIA". Con `include` (o senza `select`) qualunque
 *     colonna aggiunta domani a `User` — un telefono, un documento, un token —
 *     comparirebbe in risposta da sola, senza che nessuno lo decida. Con
 *     l'elenco esplicito il default e' il silenzio: per esporre un campo nuovo
 *     bisogna scriverlo qui.
 *
 * Stesso criterio gia' adottato da `PROFILO_SELECT` in `/api/profilo`.
 * NOTA: la costante e' ripetuta anche in `[id]/profilo/route.ts`. La
 * duplicazione e' voluta — i file di rotta di Next.js non sono un buon posto da
 * cui esportare valori condivisi — ed e' tenuta allineata dai test
 * `TC-SEC-USR-0xx`, che confrontano le due risposte con lo stesso elenco.
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

// PATCH - Attiva/Disattiva utente
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    const { id } = await params;

    if (!session?.user) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    if (session.user.ruolo !== "ADMIN") {
      return NextResponse.json(
        { error: "Solo gli amministratori possono modificare gli utenti" },
        { status: 403 }
      );
    }

    // Rate limiting DOPO il controllo di ruolo: l'endpoint è già riservato
    // all'ADMIN, quindi il limite serve a contenere l'abuso di un account
    // amministrativo (legittimo o compromesso), non a limitare chi viene già
    // respinto da 401/403.
    const rateLimitResult = await staffCriticalApiRateLimiter(request);
    if (rateLimitResult) return rateLimitResult;

    const body = await request.json();
    const { attivo } = body;

    // fix(security) B-7: `attivo` deve essere un booleano esplicito.
    // PERCHÉ: senza validazione un valore mancante o di tipo errato (es. la
    // stringa "false", che in JS è truthy) veniva scritto tal quale sulla
    // colonna `attivo`, facendo divergere lo stato dell'account dall'intento
    // dell'operatore. 422 = payload sintatticamente valido ma semanticamente
    // non accettabile.
    if (typeof attivo !== "boolean") {
      return NextResponse.json(
        { error: "Il campo 'attivo' deve essere un valore booleano (true/false)" },
        { status: 422 }
      );
    }

    // Verifica che l'utente esista. Si leggono solo i campi effettivamente
    // usati piu' sotto (log dell'evento e messaggio di conferma): non serve
    // caricare in memoria l'intera riga per sapere se esiste.
    const utente = await db.user.findUnique({
      where: { id },
      select: { id: true, email: true, nome: true, cognome: true },
    });

    if (!utente) {
      return NextResponse.json({ error: "Utente non trovato" }, { status: 404 });
    }

    // Non permettere di disattivare se stessi
    if (id === session.user.id) {
      return NextResponse.json(
        { error: "Non puoi disattivare il tuo account" },
        { status: 400 }
      );
    }

    // Aggiorna lo stato dell'utente. L'oggetto aggiornato viene serializzato
    // nella risposta, quindi passa dallo stesso elenco esplicito delle GET.
    const utenteAggiornato = await db.user.update({
      where: { id },
      data: { attivo },
      select: UTENTE_ADMIN_SELECT,
    });

    // Log dell'evento
    await db.logEvento.create({
      data: {
        tipo: "OVERRIDE_BIBLIOTECARIO",
        userId: session.user.id,
        targetUserId: id,
        dettagli: {
          azione: attivo ? "ATTIVAZIONE_UTENTE" : "DISATTIVAZIONE_UTENTE",
          utenteEmail: utente.email,
          utenteNome: `${utente.nome} ${utente.cognome}`,
        },
      },
    });

    // Se disattivato, invia notifica
    if (!attivo) {
      await db.notifica.create({
        data: {
          userId: id,
          tipo: "SISTEMA",
          titolo: "Account disattivato",
          messaggio:
            "Il tuo account è stato temporaneamente disattivato. Contatta la biblioteca per maggiori informazioni.",
        },
      });
    }

    return NextResponse.json({
      success: true,
      message: attivo
        ? `Account di ${utente.nome} ${utente.cognome} attivato`
        : `Account di ${utente.nome} ${utente.cognome} disattivato`,
      utente: utenteAggiornato,
    });
  } catch (error) {
    console.error("Errore aggiornamento utente:", error);
    return NextResponse.json(
      { error: "Errore durante l'aggiornamento dell'utente" },
      { status: 500 }
    );
  }
}

// GET - Dettagli utente con storico
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    const { id } = await params;

    if (!session?.user) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    if (session.user.ruolo !== "BIBLIOTECARIO" && session.user.ruolo !== "ADMIN") {
      return NextResponse.json({ error: "Accesso negato" }, { status: 403 });
    }

    // `select` al posto di `include`: le relazioni annidate restano identiche
    // (stessa forma della risposta), ma delle colonne di `User` escono solo
    // quelle elencate in `UTENTE_ADMIN_SELECT`.
    const utente = await db.user.findUnique({
      where: { id },
      select: {
        ...UTENTE_ADMIN_SELECT,
        prenotazioni: {
          take: 20,
          orderBy: { createdAt: "desc" },
          include: {
            posto: {
              include: { sala: true },
            },
          },
        },
        prestiti: {
          take: 20,
          orderBy: { dataPrestito: "desc" },
          include: { libro: true },
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

    // Calcola statistiche
    const noShowCount = await db.logEvento.count({
      where: {
        userId: id,
        tipo: "NO_SHOW",
      },
    });

    return NextResponse.json({
      utente,
      statistiche: {
        totalePrenotazioni: utente._count.prenotazioni,
        totalePrestiti: utente._count.prestiti,
        noShow: noShowCount,
      },
    });
  } catch (error) {
    console.error("Errore recupero utente:", error);
    return NextResponse.json(
      { error: "Errore durante il recupero dell'utente" },
      { status: 500 }
    );
  }
}
