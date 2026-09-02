import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

import {
  assertOwnership,
  AuthError,
  requireUser,
} from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  isConflittoConcorrenza,
  PrenotazioneError,
  validaPrenotazione,
} from "@/lib/prenotazioni-service";

interface RouteParams {
  params: Promise<{ id: string }>;
}

function minuti(value: Date): number {
  return value.getUTCHours() * 60 + value.getUTCMinutes();
}

function orario(value: number): string {
  const ore = Math.floor(value / 60).toString().padStart(2, "0");
  const minutiValue = (value % 60).toString().padStart(2, "0");
  return `${ore}:${minutiValue}`;
}

function errorResponse(error: unknown, fallback: string) {
  if (error instanceof AuthError) {
    return NextResponse.json(
      { success: false, code: error.code, error: error.message },
      { status: error.status },
    );
  }

  if (error instanceof PrenotazioneError) {
    return NextResponse.json(
      { success: false, ...error.toResponseBody() },
      { status: error.status },
    );
  }

  if (isConflittoConcorrenza(error)) {
    return NextResponse.json(
      {
        success: false,
        code: "POSTO_GIA_PRENOTATO",
        error: "Lo slot richiesto non e' piu' disponibile",
        suggerisciCoda: true,
      },
      { status: 409 },
    );
  }

  console.error(fallback, error);
  return NextResponse.json({ success: false, error: fallback }, { status: 500 });
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const prenotazione = await prisma.prenotazione.findUnique({
      where: { id },
      include: { posto: { include: { sala: true } } },
    });

    if (!prenotazione) {
      return NextResponse.json(
        { success: false, error: "Prenotazione non trovata" },
        { status: 404 },
      );
    }

    assertOwnership(prenotazione, user);
    if (!["CONFERMATA", "CHECK_IN"].includes(prenotazione.stato)) {
      return NextResponse.json(
        { success: false, error: "Solo prenotazioni attive possono essere estese" },
        { status: 422 },
      );
    }

    const inizio = minuti(prenotazione.oraInizio);
    const fineCorrente = minuti(prenotazione.oraFine);
    const [oreChiusura, minutiChiusura] = prenotazione.posto.sala.orarioChiusura
      .split(":")
      .map(Number);
    const chiusura = oreChiusura * 60 + minutiChiusura;
    const prenotazioniEsistenti = await prisma.prenotazione.findMany({
      where: {
        data: prenotazione.data,
        stato: { in: ["CONFERMATA", "CHECK_IN"] },
        oraInizio: { lt: new Date(Date.UTC(1970, 0, 1, 23, 59)) },
        oraFine: { gt: prenotazione.oraFine },
        OR: [{ postoId: prenotazione.postoId }, { userId: user.id }],
      },
    });

    const slotDisponibili = [];
    for (let fine = Math.min(fineCorrente + 120, chiusura); fine > fineCorrente && fine <= chiusura; fine = Math.min(fine + 120, chiusura)) {
      let disponibile = true;
      try {
        validaPrenotazione({
          userId: user.id,
          posto: prenotazione.posto,
          data: prenotazione.data,
          oraInizio: orario(inizio),
          oraFine: orario(fine),
          prenotazioniEsistenti,
          prenotazioneIdDaEscludere: prenotazione.id,
        });
      } catch (error) {
        if (error instanceof PrenotazioneError) disponibile = false;
        else throw error;
      }

      slotDisponibili.push({
        oraInizio: orario(fineCorrente),
        oraFine: orario(fine),
        disponibile,
        durataTotale: (fine - inizio) / 60,
      });

      if (fine === chiusura) break;
    }

    return NextResponse.json({
      success: true,
      data: {
        prenotazione: {
          id: prenotazione.id,
          oraInizio: prenotazione.oraInizio,
          oraFine: prenotazione.oraFine,
          data: prenotazione.data,
          stato: prenotazione.stato,
          posto: {
            numero: prenotazione.posto.numero,
            sala: prenotazione.posto.sala.nome,
            piano: prenotazione.posto.sala.piano,
          },
        },
        slotDisponibili,
        durataAttuale: (fineCorrente - inizio) / 60,
        maxDurataTotale: 8,
      },
    });
  } catch (error) {
    return errorResponse(error, "Errore nel recupero degli slot disponibili");
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const { nuovaOraFine } = await request.json();

    if (typeof nuovaOraFine !== "string") {
      return NextResponse.json(
        { success: false, error: "Specificare la nuova ora di fine" },
        { status: 422 },
      );
    }

    const risultato = await prisma.$transaction(
      async (tx) => {
        const prenotazione = await tx.prenotazione.findUnique({
          where: { id },
          include: { posto: { include: { sala: true } } },
        });

        if (!prenotazione) {
          return { response: "NOT_FOUND" as const };
        }

        assertOwnership(prenotazione, user);
        if (!["CONFERMATA", "CHECK_IN"].includes(prenotazione.stato)) {
          return { response: "INVALID_STATE" as const };
        }

        const prenotazioniEsistenti = await tx.prenotazione.findMany({
          where: {
            data: prenotazione.data,
            stato: { in: ["CONFERMATA", "CHECK_IN"] },
            OR: [{ postoId: prenotazione.postoId }, { userId: user.id }],
          },
        });

        const intervallo = validaPrenotazione({
          userId: user.id,
          posto: prenotazione.posto,
          data: prenotazione.data,
          oraInizio: prenotazione.oraInizio,
          oraFine: nuovaOraFine,
          prenotazioniEsistenti,
          prenotazioneIdDaEscludere: prenotazione.id,
        });
        const nuovaFine = new Date(
          Date.UTC(
            1970,
            0,
            1,
            Math.floor(intervallo.oraFineMinuti / 60),
            intervallo.oraFineMinuti % 60,
          ),
        );

        const aggiornata = await tx.prenotazione.update({
          where: { id },
          data: { oraFine: nuovaFine },
          include: { posto: { include: { sala: true } } },
        });

        await Promise.all([
          tx.logEvento.create({
            data: {
              tipo: "PRENOTAZIONE_CREATA",
              descrizione: `Prenotazione estesa fino alle ${nuovaOraFine} per posto ${prenotazione.posto.numero}`,
              userId: user.id,
              prenotazioneId: prenotazione.id,
            },
          }),
          tx.notifica.create({
            data: {
              userId: user.id,
              tipo: "SISTEMA",
              titolo: "Prenotazione estesa",
              messaggio: `La tua prenotazione per il posto ${prenotazione.posto.numero} e' stata estesa fino alle ${nuovaOraFine}.`,
              actionUrl: "/prenotazioni",
              actionLabel: "Vedi prenotazioni",
            },
          }),
        ]);

        return {
          response: "OK" as const,
          aggiornata,
          nuovaDurataOre: intervallo.durataMinuti / 60,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    if (risultato.response === "NOT_FOUND") {
      return NextResponse.json(
        { success: false, error: "Prenotazione non trovata" },
        { status: 404 },
      );
    }
    if (risultato.response === "INVALID_STATE") {
      return NextResponse.json(
        { success: false, error: "Solo prenotazioni attive possono essere estese" },
        { status: 422 },
      );
    }

    return NextResponse.json({
      success: true,
      message: `Prenotazione estesa fino alle ${nuovaOraFine}`,
      data: {
        id: risultato.aggiornata.id,
        oraInizio: risultato.aggiornata.oraInizio,
        oraFine: risultato.aggiornata.oraFine,
        nuovaDurataOre: risultato.nuovaDurataOre,
        posto: {
          numero: risultato.aggiornata.posto.numero,
          sala: risultato.aggiornata.posto.sala.nome,
        },
      },
    });
  } catch (error) {
    return errorResponse(error, "Errore nell'estensione della prenotazione");
  }
}
