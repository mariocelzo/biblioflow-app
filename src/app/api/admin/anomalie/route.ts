import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/prisma";
import { releaseNoShowReservations } from "@/lib/automation-service";

// POST - Azioni batch sulle anomalie
export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    if (session.user.ruolo !== "BIBLIOTECARIO" && session.user.ruolo !== "ADMIN") {
      return NextResponse.json({ error: "Accesso negato" }, { status: 403 });
    }

    const body = await request.json();
    const { azione } = body;

    const oggi = new Date();
    oggi.setHours(0, 0, 0, 0);
    const setteGiorniFa = new Date(oggi);
    setteGiorniFa.setDate(setteGiorniFa.getDate() - 7);

    let risultato;

    switch (azione) {
      case "RISOLVI_TUTTE_NOSHOW": {
        // Trova eventi NO_SHOW recenti non ancora risolti
        const noShowEvents = await db.logEvento.findMany({
          where: {
            tipo: "NO_SHOW",
            createdAt: { gte: setteGiorniFa },
          },
          include: {
            user: true,
          },
          distinct: ["userId"],
        });

        // Filtra solo eventi non risolti
        const eventiNonRisolti = noShowEvents.filter((evento) => {
          const dettagli = evento.dettagli as { risolto?: boolean } | null;
          return !dettagli?.risolto;
        });

        const notificheCreate = [];
        const eventiAggiornati = [];
        
        for (const evento of eventiNonRisolti) {
          if (evento.userId) {
            // Crea notifica
            const notifica = await db.notifica.create({
              data: {
                userId: evento.userId,
                tipo: "SISTEMA",
                titolo: "Avviso No-Show",
                messaggio:
                  "Abbiamo registrato delle mancate presentazioni alle tue prenotazioni. Ti ricordiamo di cancellare le prenotazioni che non puoi rispettare per permettere ad altri studenti di usufruire dei posti.",
              },
            });
            notificheCreate.push(notifica);

            // Marca l'evento come risolto
            await db.logEvento.update({
              where: { id: evento.id },
              data: {
                dettagli: {
                  ...((evento.dettagli as Record<string, unknown>) || {}),
                  risolto: true,
                  risoltoAt: new Date().toISOString(),
                  risoltoDa: session.user.id,
                },
              },
            });
            eventiAggiornati.push(evento);
          }
        }

        risultato = {
          success: true,
          message: `Inviate ${notificheCreate.length} notifiche di avviso`,
          count: notificheCreate.length,
        };
        break;
      }

      case "AVVISA_SINGOLO_UTENTE": {
        const { userId } = body;

        if (!userId) {
          return NextResponse.json({ error: "userId mancante" }, { status: 400 });
        }

        const setteGiorniFa = new Date();
        setteGiorniFa.setDate(setteGiorniFa.getDate() - 7);

        // Trova tutti gli eventi NO_SHOW dell'utente non ancora risolti
        const eventiUtente = await db.logEvento.findMany({
          where: {
            tipo: "NO_SHOW",
            userId: userId,
            createdAt: { gte: setteGiorniFa },
          },
        });

        // Filtra solo non risolti
        const eventiNonRisolti = eventiUtente.filter((evento) => {
          const dettagli = evento.dettagli as { risolto?: boolean } | null;
          return !dettagli?.risolto;
        });

        if (eventiNonRisolti.length === 0) {
          return NextResponse.json(
            { message: "Nessun evento da risolvere per questo utente", count: 0 },
            { status: 200 }
          );
        }

        // Crea notifica
        await db.notifica.create({
          data: {
            userId: userId,
            tipo: "SISTEMA",
            titolo: "Avviso dalla Biblioteca",
            messaggio:
              "Ti ricordiamo di rispettare le prenotazioni effettuate. Ripetute assenze potrebbero comportare limitazioni al servizio.",
          },
        });

        // Marca tutti gli eventi dell'utente come risolti
        for (const evento of eventiNonRisolti) {
          await db.logEvento.update({
            where: { id: evento.id },
            data: {
              dettagli: {
                ...((evento.dettagli as Record<string, unknown>) || {}),
                risolto: true,
                risoltoAt: new Date().toISOString(),
                risoltoDa: session.user.id,
              },
            },
          });
        }

        risultato = {
          success: true,
          message: `Avviso inviato e ${eventiNonRisolti.length} evento/i risolto/i`,
          count: eventiNonRisolti.length,
        };
        break;
      }

      case "SOLLECITA_PRESTITI_SCADUTI": {
        // Invia sollecito a tutti con prestiti scaduti.
        //
        // PERCHE' `stato: { in: [...] }` e non `stato: "SCADUTO"`: SCADUTO e'
        // un valore dell'enum StatoPrestito che nessun punto del codice
        // scrive mai in una create/update (verificato con una ricerca su
        // tutto il repository). Il "prestito scaduto" e' sempre calcolato a
        // runtime confrontando `dataScadenza` con la data odierna, come fa
        // gia' src/app/admin/prestiti/page.tsx. Filtrare su quello stato
        // rendeva questa azione un no-op silenzioso: "Inviati 0 solleciti"
        // anche con decine di prestiti in ritardo a video.
        const prestitiScaduti = await db.prestito.findMany({
          where: {
            stato: { in: ["ATTIVO", "RINNOVATO"] },
            dataScadenza: { lt: new Date() },
          },
          include: {
            user: true,
            libro: true,
          },
        });

        const notificheCreate = [];
        for (const prestito of prestitiScaduti) {
          const notifica = await db.notifica.create({
            data: {
              userId: prestito.userId,
              tipo: "SCADENZA_PRESTITO",
              titolo: "Sollecito restituzione libro",
              messaggio: `Il libro "${prestito.libro.titolo}" risulta in ritardo. Ti preghiamo di restituirlo al più presto per evitare sanzioni.`,
              actionUrl: "/prestiti",
              actionLabel: "Vedi prestiti",
            },
          });
          notificheCreate.push(notifica);
        }

        risultato = {
          success: true,
          message: `Inviati ${notificheCreate.length} solleciti per prestiti scaduti`,
          count: notificheCreate.length,
        };
        break;
      }

      case "AVVISA_PRESTITI_IN_SCADENZA": {
        // Sostituisce il bottone "Alert" di DashboardAnomalieCard, che prima
        // mostrava "Alert inviati" dopo un semplice `setTimeout` senza
        // nessuna azione reale (rilievo #1 dell'audit). La definizione di
        // "in scadenza" e' la stessa usata da src/app/admin/page.tsx per
        // calcolare `prestitiInScadenza`: prestiti non ancora restituiti la
        // cui scadenza cade entro domani (compresi quelli gia' in ritardo).
        const oggiMezzanotte = new Date();
        oggiMezzanotte.setHours(0, 0, 0, 0);
        const domani = new Date(oggiMezzanotte);
        domani.setDate(domani.getDate() + 1);

        const prestitiInScadenza = await db.prestito.findMany({
          where: {
            dataRestituzione: null,
            dataScadenza: { lte: domani },
          },
          include: {
            libro: true,
          },
        });

        const notificheCreate = [];
        for (const prestito of prestitiInScadenza) {
          const notifica = await db.notifica.create({
            data: {
              userId: prestito.userId,
              tipo: "SCADENZA_PRESTITO",
              titolo: "Il tuo prestito sta per scadere",
              messaggio: `Il libro "${prestito.libro.titolo}" scade entro domani. Ricordati di restituirlo o rinnovarlo per evitare sanzioni.`,
              actionUrl: "/prestiti",
              actionLabel: "Vedi prestiti",
            },
          });
          notificheCreate.push(notifica);
        }

        risultato = {
          success: true,
          message: `Inviati ${notificheCreate.length} avvisi per prestiti in scadenza`,
          count: notificheCreate.length,
        };
        break;
      }

      case "ANNULLA_PRENOTAZIONI_SENZA_CHECKIN": {
        // BUG STORICO CORRETTO QUI (stesso difetto di fuso/tipo gia' risolto
        // in `releaseNoShowReservations`, verificato dal vivo): questa azione
        // ricalcolava per conto proprio la soglia "oltre 15 minuti fa" con
        // `oraInizio: { lt: new Date(oraCorrente.getTime() - 15*60*1000) }` —
        // un confronto fra una colonna `@db.Time` (solo orario, nessuna data)
        // e un `Date` ASSOLUTO: Postgres tronca il secondo operando alla sola
        // parte oraria, quindi a inizio giornata la soglia valeva "23:50" del
        // giorno precedente e la condizione risultava vera per quasi ogni
        // prenotazione. La `data: oggi` di contorno usava inoltre la
        // mezzanotte nel fuso del SERVER (UTC), non quello della biblioteca
        // (Europe/Rome) — stesso difetto corretto per lo scanner qui sopra in
        // `src/app/api/admin/scanner/validate/route.ts`.
        //
        // La correzione non riscrive la query: DELEGA alla STESSA funzione di
        // dominio gia' corretta e gia' testata che il cron invoca ogni 5
        // minuti (`releaseNoShowReservations`, src/lib/automation-service.ts)
        // — "idealmente la stessa funzione", non una sua copia. In piu' porta
        // gratis due cose che la vecchia query qui non faceva: rispetta la
        // finestra di conferma di una promozione in corso (non annulla per
        // errore chi e' appena stato promosso dalla lista d'attesa) e innesca
        // la promozione del primo in coda sul posto appena liberato.
        const esito = await releaseNoShowReservations();

        risultato = {
          success: true,
          message: `Annullate ${esito.released} prenotazioni senza check-in`,
          count: esito.released,
        };
        break;
      }

      case "INVIA_ALERT_BROADCAST": {
        const { titolo, messaggio } = body;

        // Invia a tutti gli utenti attivi
        const utentiAttivi = await db.user.findMany({
          where: { attivo: true },
          select: { id: true },
        });

        const notificheCreate = await Promise.all(
          utentiAttivi.map((u) =>
            db.notifica.create({
              data: {
                userId: u.id,
                tipo: "SISTEMA",
                titolo: titolo || "Avviso dalla Biblioteca",
                messaggio: messaggio || "Messaggio importante dalla biblioteca.",
              },
            })
          )
        );

        risultato = {
          success: true,
          message: `Alert inviato a ${notificheCreate.length} utenti`,
          count: notificheCreate.length,
        };
        break;
      }

      default:
        return NextResponse.json({ error: "Azione non valida" }, { status: 400 });
    }

    // Log dell'azione
    await db.logEvento.create({
      data: {
        tipo: "OVERRIDE_BIBLIOTECARIO",
        userId: session.user.id,
        dettagli: {
          azione: azione,
          risultato: risultato,
        },
      },
    });

    return NextResponse.json(risultato);
  } catch (error) {
    console.error("Errore azione anomalie:", error);
    return NextResponse.json(
      { error: "Errore durante l'esecuzione dell'azione" },
      { status: 500 }
    );
  }
}
