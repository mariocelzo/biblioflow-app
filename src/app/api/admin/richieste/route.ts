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

        // INTEGRITA' DATI (difetto richieste-transizioni-non-validate): senza
        // una mappa esplicita delle transizioni ammesse, questa PATCH
        // accettava QUALUNQUE passaggio di stato, incluso da uno stato già
        // concluso verso uno incompatibile (es. RIFIUTATA -> PRONTA_RITIRO).
        // Ogni transizione genera una Notifica reale allo studente (vedi
        // CONTENUTO_NOTIFICA_RICHIESTA qui sotto): una richiesta rifiutata
        // che "torna" pronta per il ritiro pochi secondi dopo produce due
        // notifiche contraddittorie per lo stesso libro. RIFIUTATA,
        // CANCELLATA e COMPLETATA sono stati TERMINALI: da lì non si esce
        // più.
        const richiestaEsistente = await prisma.richiestaPreparazione.findUnique({
            where: { id },
            select: { stato: true },
        });

        if (!richiestaEsistente) {
            return NextResponse.json({ error: "Richiesta non trovata" }, { status: 404 });
        }

        const TRANSIZIONI_AMMESSE: Readonly<Record<StatoRichiesta, readonly StatoRichiesta[]>> = {
            PENDENTE: ["IN_LAVORAZIONE", "RIFIUTATA", "CANCELLATA"],
            IN_LAVORAZIONE: ["PRONTA_RITIRO", "RIFIUTATA", "CANCELLATA"],
            PRONTA_RITIRO: ["COMPLETATA", "CANCELLATA"],
            COMPLETATA: [],
            RIFIUTATA: [],
            CANCELLATA: [],
        };

        const statoAttuale = richiestaEsistente.stato;
        const nuovoStato = stato as StatoRichiesta;
        if (!TRANSIZIONI_AMMESSE[statoAttuale].includes(nuovoStato)) {
            return NextResponse.json(
                {
                    error: `Transizione non consentita: la richiesta è nello stato "${statoAttuale}" e non può passare a "${nuovoStato}"`,
                },
                { status: 409 },
            );
        }

        // Se si entra in PRONTA_RITIRO/COMPLETATA si registra il momento
        // dell'evasione; altrimenti va azzerato ESPLICITAMENTE con `null` (e
        // non lasciato `undefined`): Prisma ignora un campo `undefined`
        // nell'update, quindi `evasaAt` restava congelato al timestamp della
        // transizione precedente anche uscendo da PRONTA_RITIRO/COMPLETATA,
        // risultando incoerente con il nuovo stato.
        const evasaAt = (nuovoStato === "PRONTA_RITIRO" || nuovoStato === "COMPLETATA") ? new Date() : null;

        const richiesta = await prisma.richiestaPreparazione.update({
            where: { id },
            data: {
                stato,
                note, // Opzionale: appendere note o sovrascrivere? Qui sovrascrivo o aggiorno se passato
                evasaAt,
            },
            // Serve il titolo del libro per il testo della notifica qui sotto.
            include: { libro: { select: { titolo: true } } },
        });

        // INTEGRITA' DATI: la pagina che genera la richiesta promette
        // esplicitamente "Riceverai una notifica quando sarà pronto"
        // (src/app/libri/[id]/page.tsx, handleRichiestaPreparazione). Prima
        // questa PATCH cambiava solo `stato` senza mai scrivere una
        // `Notifica`: lo studente non veniva avvisato in nessun caso, la
        // promessa dell'interfaccia non era mantenuta. Si notifica sui tre
        // esiti che riguardano davvero lo studente (pronta per il ritiro,
        // rifiutata, annullata); IN_LAVORAZIONE e COMPLETATA restano
        // transizioni "interne" allo staff, la seconda avviene tipicamente
        // con lo studente fisicamente al banco.
        const CONTENUTO_NOTIFICA_RICHIESTA: Partial<
            Record<StatoRichiesta, { titolo: string; messaggio: (titoloLibro: string) => string }>
        > = {
            PRONTA_RITIRO: {
                titolo: "Richiesta pronta per il ritiro",
                messaggio: (titoloLibro) =>
                    `La tua richiesta per "${titoloLibro}" è pronta: il libro ti aspetta al banco prestiti.`,
            },
            RIFIUTATA: {
                titolo: "Richiesta rifiutata",
                messaggio: (titoloLibro) =>
                    `La tua richiesta per "${titoloLibro}" è stata rifiutata dalla biblioteca.`,
            },
            CANCELLATA: {
                titolo: "Richiesta annullata",
                messaggio: (titoloLibro) =>
                    `La tua richiesta per "${titoloLibro}" è stata annullata.`,
            },
        };

        const contenuto = CONTENUTO_NOTIFICA_RICHIESTA[stato as StatoRichiesta];
        if (contenuto) {
            await prisma.notifica.create({
                data: {
                    userId: richiesta.userId,
                    tipo: "SISTEMA",
                    titolo: contenuto.titolo,
                    messaggio: contenuto.messaggio(richiesta.libro.titolo),
                    // Rotta REALE (pagina del libro): in passato un'altra notifica di
                    // questo progetto puntava a `/prenotazioni/coda`, rotta mai
                    // esistita lato pagine (vedi fix in automation-service.ts). Qui si
                    // rimanda alla scheda del libro, che esiste davvero.
                    actionUrl: `/libri/${richiesta.libroId}`,
                    actionLabel: "Vedi libro",
                },
            });
        }

        return NextResponse.json({ success: true, data: richiesta });
    } catch (error) {
        console.error("Error updating request:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
