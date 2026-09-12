import { NextRequest, NextResponse } from "next/server";
import { Prisma, StatoRichiesta } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { staffCriticalApiRateLimiter } from "@/lib/rate-limit";

// Lunghezza massima applicativa per il campo libero `note` della richiesta.
// PERCHÉ: nello schema `note` è `String?` senza vincolo di lunghezza; senza un
// tetto lato applicazione un client potrebbe gonfiare la riga a piacere.
const LUNGHEZZA_MAX_NOTE = 500;

/**
 * Guardia di autorizzazione per l'area admin (fix(security) C-5).
 *
 * COSA: verifica che la richiesta porti una sessione valida e che il ruolo sia
 *   "staff" (ADMIN o BIBLIOTECARIO), replicando il pattern già usato dagli altri
 *   handler admin (`/api/admin/prenotazioni`, `/api/admin/statistiche`).
 *
 * PERCHÉ: questo file non importava nemmeno `auth()`. GET e PATCH erano quindi
 *   eseguibili da chiunque superasse il solo controllo del cookie fatto dal
 *   middleware (e, chiamando l'handler direttamente, anche senza alcuna
 *   sessione). Ora identità e autorizzazione derivano SOLO dalla sessione
 *   (criterio CA-01).
 *
 * @returns `null` se l'accesso è consentito; altrimenti la `NextResponse`
 *   (401 se manca la sessione, 403 se il ruolo non è staff) da restituire subito.
 */
async function verificaAccessoStaff(): Promise<NextResponse | null> {
    const session = await auth();

    if (!session?.user) {
        return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
    }

    if (session.user.ruolo !== "ADMIN" && session.user.ruolo !== "BIBLIOTECARIO") {
        return NextResponse.json({ error: "Accesso negato" }, { status: 403 });
    }

    return null;
}

// GET: Recupera tutte le richieste (filtrabili)
export async function GET(request: NextRequest) {
    try {
        // fix(security) C-5: nessun dato amministrativo senza sessione + ruolo staff.
        const accessoNegato = await verificaAccessoStaff();
        if (accessoNegato) return accessoNegato;

        const { searchParams } = new URL(request.url);
        const stato = searchParams.get("stato");

        // Il `as StatoRichiesta` qui sotto convince il compilatore, non il
        // database: a runtime restava una stringa qualsiasi che finiva nella
        // `where` su una colonna enum, facendo lanciare Prisma e degenerando
        // nel 500 generico del catch. La PATCH di questo stesso file valida
        // gia' l'enum (vedi piu' avanti): la GET no. Stesso controllo, stesso
        // 422, cosi' le due operazioni si comportano allo stesso modo.
        //
        // NOTA SULL'ORDINE: la validazione viene DOPO `verificaAccessoStaff()`.
        // Rispondere 422 prima di aver verificato il ruolo direbbe a un anonimo
        // che l'endpoint esiste e quali valori accetta (test TC-SEC-ENUM-007).
        if (stato && !Object.values(StatoRichiesta).includes(stato as StatoRichiesta)) {
            return NextResponse.json(
                {
                    error: `Stato non valido. Valori ammessi: ${Object.values(StatoRichiesta).join(", ")}`,
                },
                { status: 422 },
            );
        }

        // Filtro opzionale per stato: il valore arriva come stringa dalla query
        // string e va trattato come membro dell'enum StatoRichiesta di Prisma,
        // non come "any".
        const whereClause: Prisma.RichiestaPreparazioneWhereInput = stato
            ? { stato: stato as StatoRichiesta }
            : {};

        const richieste = await prisma.richiestaPreparazione.findMany({
            where: whereClause,
            include: {
                user: {
                    select: { nome: true, cognome: true, email: true, matricola: true }
                },
                libro: {
                    select: { titolo: true, autore: true, isbn: true, scaffale: true, piano: true, copertina: true }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        return NextResponse.json({ success: true, data: richieste });
    } catch (error) {
        console.error("Error fetching requests:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

// PATCH: Aggiorna stato richiesta
export async function PATCH(request: NextRequest) {
    try {
        // fix(security) C-5: la mutazione dello stato richiesta è riservata allo
        // staff. Il controllo avviene PRIMA di leggere il corpo, così una
        // richiesta non autorizzata non tocca né il parser né il database.
        const accessoNegato = await verificaAccessoStaff();
        if (accessoNegato) return accessoNegato;

        // Rate limiting DOPO l'autorizzazione, per lo stesso motivo del 422
        // qui sopra: un anonimo o uno studente vengono già fermati da
        // `verificaAccessoStaff()`, quindi non ha senso far loro consumare
        // quota. Il limite protegge l'evasione delle richieste da un abuso
        // dell'account staff, non da chi non può nemmeno arrivarci.
        const rateLimitResult = await staffCriticalApiRateLimiter(request);
        if (rateLimitResult) return rateLimitResult;

        const body = await request.json();
        const { id, stato, note } = body;

        if (!id || !stato) {
            return NextResponse.json({ error: "ID and Stato required" }, { status: 400 });
        }

        // fix(security) C-5: `stato` deve essere un membro dell'enum
        // `StatoRichiesta` di Prisma. Senza questo controllo un valore arbitrario
        // arrivava fino alla query `update` e provocava un errore Prisma tradotto
        // in un generico 500. 422 = payload sintatticamente valido ma con un
        // valore non ammesso.
        if (!Object.values(StatoRichiesta).includes(stato as StatoRichiesta)) {
            return NextResponse.json(
                {
                    error: `Stato non valido. Valori ammessi: ${Object.values(StatoRichiesta).join(", ")}`,
                },
                { status: 422 },
            );
        }

        // fix(security) C-5: `note` è opzionale ma, se presente, deve essere una
        // stringa entro `LUNGHEZZA_MAX_NOTE` caratteri (vedi costante in cima al
        // file). `undefined`/`null` restano ammessi: Prisma ignora `undefined` e
        // interpreta `null` come "azzera il campo".
        if (note !== undefined && note !== null) {
            if (typeof note !== "string" || note.length > LUNGHEZZA_MAX_NOTE) {
                return NextResponse.json(
                    {
                        error: `Il campo 'note' deve essere una stringa di al massimo ${LUNGHEZZA_MAX_NOTE} caratteri`,
                    },
                    { status: 422 },
                );
            }
        }

        // Se stiamo completando/evadendo, setta data
        const evasaAt = (stato === "PRONTA_RITIRO" || stato === "COMPLETATA") ? new Date() : undefined;

        const richiesta = await prisma.richiestaPreparazione.update({
            where: { id },
            data: {
                stato,
                note, // Opzionale: appendere note o sovrascrivere? Qui sovrascrivo o aggiorno se passato
                ...(evasaAt && { evasaAt })
            }
        });

        return NextResponse.json({ success: true, data: richiesta });
    } catch (error) {
        console.error("Error updating request:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
