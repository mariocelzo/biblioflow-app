import { NextRequest, NextResponse } from "next/server";

import {
  assertOwnership,
  AuthError,
  requireUser,
} from "@/lib/auth";
import { prisma } from "@/lib/prisma";

interface RouteParams {
  params: Promise<{ id: string }>;
}

function errorResponse(error: unknown, fallback: string) {
  if (error instanceof AuthError) {
    return NextResponse.json(
      { success: false, code: error.code, error: error.message },
      { status: error.status },
    );
  }

  console.error(fallback, error);
  return NextResponse.json(
    { success: false, error: fallback },
    { status: 500 },
  );
}

// Policy CA-01: agli studenti una risorsa altrui risulta inesistente (404).
export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const prenotazione = await prisma.prenotazione.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            nome: true,
            cognome: true,
            email: true,
            matricola: true,
          },
        },
        posto: {
          select: {
            id: true,
            numero: true,
            haPresaElettrica: true,
            haFinestra: true,
            isAccessibile: true,
            coordinataX: true,
            coordinataY: true,
            sala: {
              select: {
                id: true,
                nome: true,
                piano: true,
                orarioApertura: true,
                orarioChiusura: true,
              },
            },
          },
        },
        eventi: { orderBy: { createdAt: "desc" }, take: 10 },
      },
    });

    if (!prenotazione) {
      return NextResponse.json(
        { success: false, error: "Prenotazione non trovata" },
        { status: 404 },
      );
    }

    assertOwnership(prenotazione, user);
    return NextResponse.json({ success: true, data: prenotazione });
  } catch (error) {
    return errorResponse(error, "Errore nel recupero della prenotazione");
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const { azione } = await request.json();
    const prenotazione = await prisma.prenotazione.findUnique({
      where: { id },
      include: { posto: true },
    });

    if (!prenotazione) {
      return NextResponse.json(
        { success: false, error: "Prenotazione non trovata" },
        { status: 404 },
      );
    }

    assertOwnership(prenotazione, user);

    let updateData: Record<string, unknown>;
    let logTipo: "CHECK_IN" | "CHECK_OUT" | "PRENOTAZIONE_CANCELLATA";
    let logDescrizione: string;

    switch (azione) {
      case "check-in":
        if (prenotazione.stato !== "CONFERMATA") {
          return NextResponse.json(
            { success: false, error: "Impossibile fare check-in: stato non valido" },
            { status: 400 },
          );
        }
        updateData = { stato: "CHECK_IN", checkInAt: new Date() };
        await prisma.posto.update({
          where: { id: prenotazione.postoId },
          data: { stato: "OCCUPATO" },
        });
        logTipo = "CHECK_IN";
        logDescrizione = `Check-in effettuato per posto ${prenotazione.posto.numero}`;
        break;

      case "check-out":
        if (prenotazione.stato !== "CHECK_IN") {
          return NextResponse.json(
            { success: false, error: "Impossibile fare check-out: non hai fatto check-in" },
            { status: 400 },
          );
        }
        updateData = { stato: "COMPLETATA", checkOutAt: new Date() };
        await prisma.posto.update({
          where: { id: prenotazione.postoId },
          data: { stato: "DISPONIBILE" },
        });
        logTipo = "CHECK_OUT";
        logDescrizione = `Check-out effettuato per posto ${prenotazione.posto.numero}`;
        break;

      case "cancella":
        if (!["CONFERMATA", "CHECK_IN"].includes(prenotazione.stato)) {
          return NextResponse.json(
            { success: false, error: "Impossibile cancellare: prenotazione gia' conclusa" },
            { status: 400 },
          );
        }
        updateData = { stato: "CANCELLATA" };
        if (prenotazione.stato === "CHECK_IN") {
          await prisma.posto.update({
            where: { id: prenotazione.postoId },
            data: { stato: "DISPONIBILE" },
          });
        }
        logTipo = "PRENOTAZIONE_CANCELLATA";
        logDescrizione = `Prenotazione cancellata per posto ${prenotazione.posto.numero}`;
        break;

      default:
        return NextResponse.json(
          { success: false, error: "Azione non valida. Usa: check-in, check-out, cancella" },
          { status: 400 },
        );
    }

    const prenotazioneAggiornata = await prisma.prenotazione.update({
      where: { id },
      data: updateData,
      include: {
        user: { select: { id: true, nome: true, cognome: true } },
        posto: {
          select: {
            id: true,
            numero: true,
            sala: { select: { nome: true } },
          },
        },
      },
    });

    await prisma.logEvento.create({
      data: {
        tipo: logTipo,
        userId: user.id,
        prenotazioneId: id,
        descrizione: logDescrizione,
      },
    });

    return NextResponse.json({
      success: true,
      data: prenotazioneAggiornata,
      message: logDescrizione,
    });
  } catch (error) {
    return errorResponse(error, "Errore nell'aggiornamento della prenotazione");
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const prenotazione = await prisma.prenotazione.findUnique({
      where: { id },
      include: { posto: true },
    });

    if (!prenotazione) {
      return NextResponse.json(
        { success: false, error: "Prenotazione non trovata" },
        { status: 404 },
      );
    }

    assertOwnership(prenotazione, user);
    if (prenotazione.stato === "CHECK_IN") {
      await prisma.posto.update({
        where: { id: prenotazione.postoId },
        data: { stato: "DISPONIBILE" },
      });
    }

    await prisma.logEvento.deleteMany({ where: { prenotazioneId: id } });
    await prisma.prenotazione.delete({ where: { id } });

    return NextResponse.json({ success: true, message: "Prenotazione eliminata" });
  } catch (error) {
    return errorResponse(error, "Errore nell'eliminazione della prenotazione");
  }
}
