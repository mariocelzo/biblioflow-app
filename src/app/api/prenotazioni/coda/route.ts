import { NextRequest, NextResponse } from "next/server";

import { AuthError, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  annullaRichiestaCoda,
  entraInCoda,
  posizioneInCoda,
  PrenotazioneError,
  type CodaIntervalloInput,
  validaPostoPrenotabile,
} from "@/lib/prenotazioni-service";

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

  console.error(fallback, error);
  return NextResponse.json({ success: false, error: fallback }, { status: 500 });
}

function campiCoda(body: Record<string, unknown>) {
  return {
    postoId: body.postoId,
    data: body.data,
    oraInizio: body.oraInizio,
    oraFine: body.oraFine,
  };
}

export async function GET() {
  try {
    const user = await requireUser();
    const richieste = await prisma.listaAttesa.findMany({
      where: { userId: user.id, stato: "IN_ATTESA" },
      include: {
        posto: {
          select: {
            id: true,
            numero: true,
            sala: { select: { id: true, nome: true, piano: true } },
          },
        },
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });

    const conPosizione = await Promise.all(
      richieste.map(async (richiesta) => ({
        ...richiesta,
        posizione: await posizioneInCoda(
          {
            userId: user.id,
            postoId: richiesta.postoId,
            data: richiesta.data,
            oraInizio: richiesta.oraInizio,
            oraFine: richiesta.oraFine,
          },
          prisma,
        ),
      })),
    );

    return NextResponse.json({
      success: true,
      data: conPosizione,
      count: conPosizione.length,
    });
  } catch (error) {
    return errorResponse(error, "Errore nel recupero della lista d'attesa");
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const body = (await request.json()) as Record<string, unknown>;
    const input = campiCoda(body);
    if (
      typeof input.postoId !== "string" ||
      !(typeof input.data === "string" || input.data instanceof Date) ||
      !(typeof input.oraInizio === "string" || input.oraInizio instanceof Date) ||
      !(typeof input.oraFine === "string" || input.oraFine instanceof Date)
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Campi obbligatori mancanti: postoId, data, oraInizio, oraFine",
        },
        { status: 422 },
      );
    }

    const codaInput: CodaIntervalloInput = {
      userId: user.id,
      postoId: input.postoId,
      data: input.data,
      oraInizio: input.oraInizio,
      oraFine: input.oraFine,
    };

    const posto = await prisma.posto.findUnique({
      where: { id: codaInput.postoId },
      select: {
        id: true,
        attivo: true,
        stato: true,
        sala: {
          select: {
            attiva: true,
            orarioApertura: true,
            orarioChiusura: true,
          },
        },
      },
    });
    validaPostoPrenotabile(posto);

    const richiesta = await entraInCoda(codaInput, prisma);
    const posizione = await posizioneInCoda(
      {
        userId: user.id,
        postoId: richiesta.postoId,
        data: richiesta.data,
        oraInizio: richiesta.oraInizio,
        oraFine: richiesta.oraFine,
      },
      prisma,
    );

    return NextResponse.json(
      { success: true, data: { ...richiesta, posizione } },
      { status: 201 },
    );
  } catch (error) {
    return errorResponse(error, "Errore nell'ingresso in lista d'attesa");
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await requireUser();
    const queryId = new URL(request.url).searchParams.get("id");
    const body = queryId
      ? {}
      : ((await request.json().catch(() => ({}))) as Record<string, unknown>);
    const richiestaId = queryId ?? body.id;

    if (typeof richiestaId !== "string" || !richiestaId) {
      return NextResponse.json(
        { success: false, error: "Specificare l'id della richiesta" },
        { status: 422 },
      );
    }

    const annullata = await annullaRichiestaCoda(user.id, richiestaId, prisma);
    return NextResponse.json({
      success: true,
      data: annullata,
      message: "Richiesta in lista d'attesa annullata",
    });
  } catch (error) {
    return errorResponse(error, "Errore nell'annullamento dalla lista d'attesa");
  }
}
