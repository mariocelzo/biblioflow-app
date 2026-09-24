import { NextRequest, NextResponse } from "next/server";

import { assertOwnership, AuthError, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { criticalApiRateLimiter } from "@/lib/rate-limit";
import { generateSignedQR, QR_VALIDITA_MINUTI } from "@/lib/qr-signature";

interface RouteParams {
  params: Promise<{ id: string }>;
}

function errorResponse(error: unknown) {
  if (error instanceof AuthError) {
    return NextResponse.json(
      { success: false, code: error.code, error: error.message },
      { status: error.status },
    );
  }

  console.error("Errore nella generazione del QR di check-in:", error);
  return NextResponse.json(
    { success: false, error: "Errore interno del server" },
    { status: 500 },
  );
}

/**
 * GET /api/prenotazioni/[id]/qr
 *
 * PERCHÉ QUESTA ROTTA ESISTE (difetto qr-studente-formato-incompatibile):
 * il componente mostrato allo studente (src/components/qrcode-checkin.tsx)
 * generava il QR DIRETTAMENTE NEL BROWSER, come JSON non firmato
 * `{type, prenotazioneId, timestamp}`. Lo scanner del bibliotecario
 * (src/lib/qr-signature.ts, validateScannedQR) pretende invece un payload
 * firmato con HMAC (chiave QR_SECRET/NEXTAUTH_SECRET), quindi quel QR veniva
 * SEMPRE rifiutato: i due lati della feature non erano mai stati collegati.
 *
 * La firma non può essere calcolata nel browser (esporrebbe la chiave), va
 * quindi generata QUI, lato server, da una rotta autenticata che:
 *  1) verifica la sessione (requireUser: 401 se assente);
 *  2) verifica che la prenotazione richiesta appartenga DAVVERO all'utente
 *     che la chiede (assertOwnership) — senza questo controllo uno
 *     studente avrebbe potuto chiedere il QR (quindi il check-in) di una
 *     prenotazione altrui semplicemente cambiando l'id nell'URL (IDOR);
 *  3) restituisce il payload già firmato da `generateSignedQR`, che lega la
 *     firma a `prenotazioneId:userId:timestamp`: non è riusabile su
 *     un'altra prenotazione (la firma non validerebbe più) e scade da sola
 *     dopo `QR_VALIDITA_MINUTI` (vedi `isQRValid` in qr-signature.ts), quindi
 *     non resta valido per sempre.
 *
 * Il componente studente si limita a CHIAMARE questa rotta e mostrare il
 * risultato come QR code: non conosce né costruisce mai la struttura del
 * payload firmato.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();

    // Genera un token firmato: stesso limite critico già applicato alle
    // altre azioni sensibili dello studente sulla propria prenotazione
    // (check-in, annullamento in src/app/api/prenotazioni/[id]/route.ts).
    const rateLimitResult = await criticalApiRateLimiter(request);
    if (rateLimitResult) return rateLimitResult;

    const { id: prenotazioneId } = await params;

    const prenotazione = await prisma.prenotazione.findUnique({
      where: { id: prenotazioneId },
      select: { id: true, userId: true, stato: true },
    });

    if (!prenotazione) {
      return NextResponse.json(
        { success: false, error: "Prenotazione non trovata" },
        { status: 404 },
      );
    }

    // Policy CA-01 (coerente con le altre rotte studente su
    // /api/prenotazioni/[id]): per uno STUDENTE la prenotazione di
    // qualcun altro risulta 404, non 403, per non rivelarne l'esistenza.
    assertOwnership(prenotazione, user);

    // Il QR serve a fare check-in: ha senso generarlo solo se la
    // prenotazione è ancora nello stato da cui il check-in parte davvero
    // (vedi POST /api/prenotazioni/[id]/check-in, che richiede CONFERMATA).
    // Senza questo controllo lo studente poteva generare un QR firmato
    // valido per una prenotazione già annullata, conclusa o già in
    // check-in.
    if (prenotazione.stato !== "CONFERMATA") {
      return NextResponse.json(
        {
          success: false,
          code: "STATO_QR_NON_VALIDO",
          error: `Impossibile generare il QR: la prenotazione non è nello stato corretto per il check-in (stato attuale: ${prenotazione.stato})`,
        },
        { status: 409 },
      );
    }

    const qrData = generateSignedQR(prenotazione.id, user.id);
    // Comunicata al client SOLO per mostrare un countdown nella UI: la
    // decisione se il QR è ancora valido resta interamente lato server,
    // dentro `validateScannedQR` (isQRValid), al momento della scansione.
    const scadeAlle = new Date(
      Date.now() + QR_VALIDITA_MINUTI * 60 * 1000,
    ).toISOString();

    return NextResponse.json({ success: true, qrData, scadeAlle });
  } catch (error) {
    return errorResponse(error);
  }
}
