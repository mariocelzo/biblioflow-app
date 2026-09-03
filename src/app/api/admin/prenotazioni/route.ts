import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { promuoviPrimoInCoda } from "@/lib/prenotazioni-service";
import { emitCodaPromozione } from "@/lib/realtime-events";

type PrenotazioneCancellata = {
  id: string;
  postoId: string;
  data: Date;
  oraInizio: Date;
  oraFine: Date;
  posto: {
    numero: string;
  };
};

type AttorePersonale = {
  id: string;
  email?: string | null;
  ruolo?: string;
};

type EsitoPromozioneAdmin = {
  richiestaId: string;
  prenotazioneId: string;
  userId: string;
  postoId: string;
  // BIB-50 / CA-06: nome e cognome dell'utente promosso, così che il feedback
  // nell'interfaccia admin dica *chi* è stato promosso senza leggere i log.
  utente?: { nome: string; cognome: string };
};

function dataIso(data: Date): string {
  return data.toISOString().slice(0, 10);
}

function oraIso(ora: Date): string {
  return ora.toISOString().slice(11, 16);
}

async function promuoviDopoCancellazione(
  prenotazione: PrenotazioneCancellata,
  attore: AttorePersonale,
): Promise<EsitoPromozioneAdmin | null> {
  // La promozione è un effetto collaterale best-effort della cancellazione: se
  // per questo slot non è possibile (coda vuota, oppure lo slot è già nel
  // passato e il dominio rifiuta l'intervallo) la cancellazione resta valida e
  // si risponde semplicemente con `promozione: null`, senza propagare un 500.
  let promozione: Awaited<ReturnType<typeof promuoviPrimoInCoda>>;
  try {
    promozione = await promuoviPrimoInCoda(
      {
        postoId: prenotazione.postoId,
        data: prenotazione.data,
        oraInizio: prenotazione.oraInizio,
        oraFine: prenotazione.oraFine,
      },
      prisma,
    );
  } catch (errore) {
    console.warn(
      `Promozione da coda non eseguita per la prenotazione ${prenotazione.id}:`,
      errore,
    );
    return null;
  }

  if (!promozione) {
    return null;
  }

  const esito: EsitoPromozioneAdmin = {
    richiestaId: promozione.richiestaId,
    prenotazioneId: promozione.prenotazione.id,
    userId: promozione.prenotazione.userId,
    postoId: prenotazione.postoId,
  };

  // BIB-50 / CA-06: arricchisce l'esito con il nome dell'utente promosso, così
  // che il riepilogo mostrato al personale sia leggibile. Lookup mirato e non
  // bloccante: se fallisce, il feedback ripiega sull'id ma la promozione è già
  // stata registrata sopra.
  const utentePromosso = await prisma.user.findUnique({
    where: { id: esito.userId },
    select: { nome: true, cognome: true },
  });
  if (utentePromosso) {
    esito.utente = utentePromosso;
  }

  await prisma.notifica.create({
    data: {
      userId: esito.userId,
      tipo: "CODA_PROMOZIONE",
      titolo: "🎉 Posto assegnato dalla lista d'attesa",
      messaggio: `Buone notizie: il posto ${prenotazione.posto.numero} si è liberato e la prenotazione è ora tua. Ricordati di fare il check-in nei tempi previsti per non perderla.`,
      actionUrl: `/prenotazioni/${esito.prenotazioneId}`,
      actionLabel: "Vedi prenotazione",
    },
  });

  // Evento di innesco separato dal CODA_PROMOZIONE scritto dal dominio: rende
  // esplicito che la catena nasce da un'azione del personale e non dal cron.
  await prisma.logEvento.create({
    data: {
      tipo: "OVERRIDE_BIBLIOTECARIO",
      userId: attore.id,
      targetUserId: esito.userId,
      prenotazioneId: esito.prenotazioneId,
      descrizione: "Promozione da coda innescata da cancellazione del personale",
      dettagli: {
        azione: "CANCELLAZIONE_ADMIN",
        prenotazioneCancellataId: prenotazione.id,
        listaAttesaId: esito.richiestaId,
        postoId: prenotazione.postoId,
        attore: {
          tipo: "personale",
          userId: attore.id,
          email: attore.email ?? null,
          ruolo: attore.ruolo ?? null,
        },
      },
    },
  });

  emitCodaPromozione({
    userId: esito.userId,
    postoId: prenotazione.postoId,
    numero: prenotazione.posto.numero,
    prenotazioneId: esito.prenotazioneId,
    data: dataIso(prenotazione.data),
    oraInizio: oraIso(prenotazione.oraInizio),
    oraFine: oraIso(prenotazione.oraFine),
  });

  return esito;
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    
    if (!session?.user) {
      return NextResponse.json(
        { error: "Non autenticato" },
        { status: 401 }
      );
    }

    if (session.user.ruolo !== "ADMIN" && session.user.ruolo !== "BIBLIOTECARIO") {
      return NextResponse.json(
        { error: "Accesso negato" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { azione, prenotazioneIds, prenotazioneId, nuoviDati } = body;

    switch (azione) {
      case "ANNULLA_MULTIPLE": {
        if (!prenotazioneIds || !Array.isArray(prenotazioneIds)) {
          return NextResponse.json(
            { error: "IDs prenotazioni mancanti" },
            { status: 400 }
          );
        }

        // Annulla prenotazioni e libera posti
        const prenotazioni = await prisma.prenotazione.findMany({
          where: { id: { in: prenotazioneIds } },
          include: { posto: true, user: true }
        });

        const promozioni: EsitoPromozioneAdmin[] = [];

        for (const pren of prenotazioni) {
          // Update prenotazione
          await prisma.prenotazione.update({
            where: { id: pren.id },
            data: { stato: "CANCELLATA" }
          });

          // Libera posto se occupato
          if (pren.posto.stato === "OCCUPATO") {
            await prisma.posto.update({
              where: { id: pren.postoId },
              data: { stato: "DISPONIBILE" }
            });
          }

          // Log evento
          await prisma.logEvento.create({
            data: {
              tipo: "PRENOTAZIONE_CANCELLATA",
              userId: pren.user.id,
              dettagli: {
                prenotazioneId: pren.id,
                postoId: pren.postoId,
                motivazione: "Cancellazione admin multipla",
                cancellatoDa: session.user.email
              }
            }
          });

          // Notifica utente
          await prisma.notifica.create({
            data: {
              tipo: "SISTEMA",
              titolo: "Prenotazione cancellata",
              messaggio: `La tua prenotazione del ${pren.data.toLocaleDateString('it-IT')} è stata cancellata dall'amministrazione.`,
              userId: pren.user.id
            }
          });

          const promozione = await promuoviDopoCancellazione(
            pren,
            session.user,
          );
          if (promozione) {
            promozioni.push(promozione);
          }
        }

        return NextResponse.json({
          success: true,
          message: `${prenotazioni.length} prenotazioni cancellate`,
          promozioni,
        });
      }

      case "ANNULLA_SINGOLA": {
        if (!prenotazioneId) {
          return NextResponse.json(
            { error: "ID prenotazione mancante" },
            { status: 400 }
          );
        }

        const prenotazione = await prisma.prenotazione.findUnique({
          where: { id: prenotazioneId },
          include: { posto: true, user: true }
        });

        if (!prenotazione) {
          return NextResponse.json(
            { error: "Prenotazione non trovata" },
            { status: 404 }
          );
        }

        // Update prenotazione
        await prisma.prenotazione.update({
          where: { id: prenotazioneId },
          data: { stato: "CANCELLATA" }
        });

        // Libera posto se occupato
        if (prenotazione.posto.stato === "OCCUPATO") {
          await prisma.posto.update({
            where: { id: prenotazione.postoId },
            data: { stato: "DISPONIBILE" }
          });
        }

        // Log evento
        await prisma.logEvento.create({
          data: {
            tipo: "PRENOTAZIONE_CANCELLATA",
            userId: prenotazione.user.id,
            dettagli: {
              prenotazioneId: prenotazione.id,
              postoId: prenotazione.postoId,
              motivazione: "Cancellazione admin",
              cancellatoDa: session.user.email
            }
          }
        });

        // Notifica utente
        await prisma.notifica.create({
          data: {
            tipo: "SISTEMA",
            titolo: "Prenotazione cancellata",
            messaggio: `La tua prenotazione del ${prenotazione.data.toLocaleDateString('it-IT')} è stata cancellata dall'amministrazione.`,
            userId: prenotazione.user.id
          }
        });

        const promozione = await promuoviDopoCancellazione(
          prenotazione,
          session.user,
        );

        return NextResponse.json({
          success: true,
          message: "Prenotazione cancellata",
          promozione,
        });
      }

      case "CHECK_IN_MANUALE": {
        if (!prenotazioneId) {
          return NextResponse.json(
            { error: "ID prenotazione mancante" },
            { status: 400 }
          );
        }

        const prenotazione = await prisma.prenotazione.findUnique({
          where: { id: prenotazioneId },
          include: { posto: true, user: true }
        });

        if (!prenotazione) {
          return NextResponse.json(
            { error: "Prenotazione non trovata" },
            { status: 404 }
          );
        }

        if (prenotazione.stato === "CHECK_IN" || prenotazione.stato === "COMPLETATA") {
          return NextResponse.json(
            { error: "Check-in già effettuato" },
            { status: 400 }
          );
        }

        // Update prenotazione
        await prisma.prenotazione.update({
          where: { id: prenotazioneId },
          data: { 
            stato: "CHECK_IN",
            checkInAt: new Date()
          }
        });

        // Occupa posto
        await prisma.posto.update({
          where: { id: prenotazione.postoId },
          data: { stato: "OCCUPATO" }
        });

        // Log evento
        await prisma.logEvento.create({
          data: {
            tipo: "CHECK_IN",
            userId: prenotazione.user.id,
            dettagli: {
              prenotazioneId: prenotazione.id,
              postoId: prenotazione.postoId,
              metodo: "manuale_admin",
              effettuatoDa: session.user.email
            }
          }
        });

        // Notifica utente
        await prisma.notifica.create({
          data: {
            tipo: "PRENOTAZIONE",
            titolo: "Check-in effettuato",
            messaggio: `Check-in effettuato per la prenotazione del ${prenotazione.data.toLocaleDateString('it-IT')}.`,
            userId: prenotazione.user.id
          }
        });

        return NextResponse.json({
          success: true,
          message: "Check-in effettuato"
        });
      }

      case "MODIFICA": {
        if (!prenotazioneId || !nuoviDati) {
          return NextResponse.json(
            { error: "Dati mancanti" },
            { status: 400 }
          );
        }

        const prenotazione = await prisma.prenotazione.findUnique({
          where: { id: prenotazioneId },
          include: { user: true }
        });

        if (!prenotazione) {
          return NextResponse.json(
            { error: "Prenotazione non trovata" },
            { status: 404 }
          );
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const updateData: any = {};
        
        if (nuoviDati.data) {
          updateData.data = new Date(nuoviDati.data);
        }
        if (nuoviDati.oraInizio) {
          updateData.oraInizio = nuoviDati.oraInizio;
        }
        if (nuoviDati.oraFine) {
          updateData.oraFine = nuoviDati.oraFine;
        }
        if (nuoviDati.postoId) {
          // Verifica disponibilità nuovo posto
          const nuovoPosto = await prisma.posto.findUnique({
            where: { id: nuoviDati.postoId }
          });

          if (!nuovoPosto) {
            return NextResponse.json(
              { error: "Posto non trovato" },
              { status: 404 }
            );
          }

          if (nuovoPosto.stato !== "DISPONIBILE") {
            return NextResponse.json(
              { error: "Posto non disponibile" },
              { status: 400 }
            );
          }

          updateData.postoId = nuoviDati.postoId;
        }

        // Update prenotazione
        await prisma.prenotazione.update({
          where: { id: prenotazioneId },
          data: updateData
        });

        // Log evento
        await prisma.logEvento.create({
          data: {
            tipo: "PRENOTAZIONE_CANCELLATA",
            userId: prenotazione.user.id,
            dettagli: {
              prenotazioneId: prenotazione.id,
              cambiamenti: nuoviDati,
              modificatoDa: session.user.email
            }
          }
        });

        // Notifica utente
        await prisma.notifica.create({
          data: {
            tipo: "SISTEMA",
            titolo: "Prenotazione modificata",
            messaggio: "La tua prenotazione è stata modificata dall'amministrazione.",
            userId: prenotazione.user.id
          }
        });

        return NextResponse.json({
          success: true,
          message: "Prenotazione modificata"
        });
      }

      default:
        return NextResponse.json(
          { error: "Azione non valida" },
          { status: 400 }
        );
    }

  } catch (error) {
    console.error("Errore API prenotazioni admin:", error);
    return NextResponse.json(
      { error: "Errore interno del server" },
      { status: 500 }
    );
  }
}
