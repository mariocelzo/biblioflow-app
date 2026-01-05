import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/prisma";

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
        // Invia sollecito a tutti con prestiti scaduti
        const prestitiScaduti = await db.prestito.findMany({
          where: {
            stato: "SCADUTO",
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

      case "ANNULLA_PRENOTAZIONI_SENZA_CHECKIN": {
        // Annulla prenotazioni confermate di oggi senza check-in
        const oraCorrente = new Date();
        const prenotazioniDaAnnullare = await db.prenotazione.findMany({
          where: {
            stato: "CONFERMATA",
            data: oggi,
            oraInizio: {
              lt: new Date(oraCorrente.getTime() - 15 * 60 * 1000), // Oltre 15 min fa
            },
          },
          include: {
            user: true,
            posto: { include: { sala: true } },
          },
        });

        const aggiornate = [];
        for (const prenotazione of prenotazioniDaAnnullare) {
          await db.prenotazione.update({
            where: { id: prenotazione.id },
            data: { stato: "NO_SHOW" },
          });

          // Libera il posto
          await db.posto.update({
            where: { id: prenotazione.postoId },
            data: { stato: "DISPONIBILE" },
          });

          // Log no-show
          await db.logEvento.create({
            data: {
              tipo: "NO_SHOW",
              userId: prenotazione.userId,
              dettagli: {
                prenotazioneId: prenotazione.id,
                posto: `${prenotazione.posto.sala.nome} - ${prenotazione.posto.numero}`,
                automatico: true,
              },
            },
          });

          // Notifica utente
          await db.notifica.create({
            data: {
              userId: prenotazione.userId,
              tipo: "SISTEMA",
              titolo: "Prenotazione annullata",
              messaggio: `La tua prenotazione per il posto ${prenotazione.posto.numero} è stata annullata per mancato check-in.`,
            },
          });

          aggiornate.push(prenotazione);
        }

        risultato = {
          success: true,
          message: `Annullate ${aggiornate.length} prenotazioni senza check-in`,
          count: aggiornate.length,
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
