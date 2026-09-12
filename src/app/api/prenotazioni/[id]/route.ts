import { NextRequest, NextResponse } from "next/server";

import {
  assertOwnership,
  AuthError,
  requireUser,
} from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { criticalApiRateLimiter } from "@/lib/rate-limit";

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

// Ricompone l'istante di inizio dello slot: `data` e' un @db.Date e `oraInizio`
// un @db.Time, quindi vanno fusi lavorando sui componenti UTC.
// NOTA: e' la stessa funzione di src/app/api/prenotazioni/[id]/check-in/route.ts.
// La duplicazione e' voluta per non introdurre un modulo condiviso in questa
// correzione mirata; le due implementazioni devono restare allineate.
function istanteInizio(data: Date, oraInizio: Date): Date {
  return new Date(
    Date.UTC(
      data.getUTCFullYear(),
      data.getUTCMonth(),
      data.getUTCDate(),
      oraInizio.getUTCHours(),
      oraInizio.getUTCMinutes(),
    ),
  );
}

// Finestra di check-in: apre 15 minuti prima dell'inizio dello slot e si chiude
// all'inizio. Identica a quella dell'endpoint dedicato.
const ANTICIPO_CHECK_IN_MS = 15 * 60 * 1000;

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

    // Rate limiting DOPO l'autenticazione: questa PATCH copre check-in,
    // check-out e cancellazione, tutte operazioni critiche su una risorsa
    // propria. Autorizzare prima evita che un anonimo consumi la quota di
    // qualcun altro (la chiave del limite è l'IP, non l'utente); il limite
    // stesso resta comunque a protezione dell'account autenticato da abusi
    // (es. uno script che tenta ripetutamente il check-in fuori orario).
    const rateLimitResult = await criticalApiRateLimiter(request);
    if (rateLimitResult) return rateLimitResult;

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
      case "check-in": {
        if (prenotazione.stato !== "CONFERMATA") {
          return NextResponse.json(
            { success: false, error: "Impossibile fare check-in: stato non valido" },
            { status: 400 },
          );
        }

        // INTEGRITA' DATI: prima qui mancava ogni vincolo temporale, mentre
        // l'endpoint dedicato POST /api/prenotazioni/[id]/check-in lo applicava.
        // Si poteva quindi prenotare per venerdi' e fare check-in il lunedi':
        // il posto passava a OCCUPATO con giorni di anticipo, usciva dal bacino
        // del rilascio automatico per no-show e restava bloccato per tutti gli
        // altri. La stessa operazione fisica non puo' avere due percorsi con
        // regole diverse, quindi la finestra viene applicata anche qui.
        // L'istante di riferimento e' SEMPRE l'orologio del server: un eventuale
        // `timestamp` nel body del client viene ignorato (hardening M-2).
        const adesso = new Date();
        const inizio = istanteInizio(prenotazione.data, prenotazione.oraInizio);
        const aperturaCheckIn = new Date(inizio.getTime() - ANTICIPO_CHECK_IN_MS);

        if (adesso > inizio) {
          return NextResponse.json(
            { success: false, error: "Il periodo di check-in e' scaduto" },
            { status: 400 },
          );
        }
        if (adesso < aperturaCheckIn) {
          return NextResponse.json(
            { success: false, error: "E' troppo presto per effettuare il check-in" },
            { status: 400 },
          );
        }

        updateData = { stato: "CHECK_IN", checkInAt: adesso };
        await prisma.posto.update({
          where: { id: prenotazione.postoId },
          data: { stato: "OCCUPATO" },
        });
        logTipo = "CHECK_IN";
        logDescrizione = `Check-in effettuato per posto ${prenotazione.posto.numero}`;
        break;
      }

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

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();

    // Rate limiting DOPO l'autenticazione: stesso criterio della PATCH qui
    // sopra (autorizzare prima di limitare, su un endpoint che agisce solo su
    // risorse dell'utente autenticato).
    const rateLimitResult = await criticalApiRateLimiter(request);
    if (rateLimitResult) return rateLimitResult;

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

    // INTEGRITA' DATI: la cancellazione e' un SOFT-delete.
    // Prima questo endpoint eseguiva `logEvento.deleteMany({ prenotazioneId })`
    // seguito da una hard-delete. Ma i LogEvento sono la base su cui l'area
    // amministrativa conta i NO_SHOW (src/app/api/admin/utenti/[id]/route.ts e
    // src/app/api/admin/anomalie/route.ts): uno studente che accumulava assenze
    // poteva cancellare le proprie prenotazioni e azzerare le prove a proprio
    // carico. La hard-delete rendeva inoltre impossibile ogni statistica
    // storica. Un endpoint utente non deve MAI toccare l'audit trail.
    //
    // Il soft-delete e' anche cio' che la UI gia' si aspettava: dopo una DELETE
    // riuscita src/app/prenotazioni/page.tsx marca la prenotazione come
    // CANCELLATA e la mostra nello storico invece di rimuoverla dalla lista.
    // Il vincolo anti-sovrapposizione e' filtrato su ('CONFERMATA','CHECK_IN'),
    // quindi una prenotazione CANCELLATA non blocca la riprenotazione dello slot.
    if (!["CONFERMATA", "CHECK_IN"].includes(prenotazione.stato)) {
      return NextResponse.json(
        { success: false, error: "Impossibile cancellare: prenotazione gia' conclusa" },
        { status: 400 },
      );
    }

    if (prenotazione.stato === "CHECK_IN") {
      await prisma.posto.update({
        where: { id: prenotazione.postoId },
        data: { stato: "DISPONIBILE" },
      });
    }

    await prisma.prenotazione.update({
      where: { id },
      data: { stato: "CANCELLATA" },
    });

    // La cancellazione viene tracciata come qualunque altra transizione di
    // stato, cosi' resta ricostruibile chi ha fatto cosa e quando.
    await prisma.logEvento.create({
      data: {
        tipo: "PRENOTAZIONE_CANCELLATA",
        userId: user.id,
        prenotazioneId: id,
        descrizione: `Prenotazione cancellata per posto ${prenotazione.posto.numero}`,
      },
    });

    return NextResponse.json({ success: true, message: "Prenotazione cancellata" });
  } catch (error) {
    return errorResponse(error, "Errore nell'eliminazione della prenotazione");
  }
}
