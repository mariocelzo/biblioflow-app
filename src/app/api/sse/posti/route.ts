/**
 * 🔄 SSE Endpoint per Real-time Posti
 *
 * GET /api/sse/posti
 *
 * Connessione Server-Sent Events per ricevere aggiornamenti in tempo reale
 * sullo stato dei posti.
 *
 * Canale: `posti` (invariato).
 *
 * Eventi:
 * - posto-update: { postoId, stato, numero, salaId }
 * - occupazione-update: { salaId, disponibili, totale, percentuale }
 * - coda-ingresso: { postoId, numero, salaId, data, oraInizio, oraFine, posizione } (BIB-45, CA-06)
 * - coda-promozione: { postoId, numero, data, oraInizio, oraFine } (BIB-45, CA-06)
 *   (M-3: NIENTE userId/prenotazioneId sul canale pubblico)
 *
 * NOTA (CA-06): `coda-ingresso` / `coda-promozione` sono nomi-evento nuovi che
 * NON alterano il contratto esistente. Un client che ascolta solo
 * `posto-update` / `occupazione-update` li ignora senza errori, perché
 * EventSource recapita un evento solo ai listener esplicitamente registrati.
 * La promozione viene inoltre notificata all'utente promosso sul canale
 * personale `user-<id>` con l'evento `nuova-notifica` già esistente.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 🔐 Hardening M-3 (audit sicurezza 2026-09-04)
 * Prima l'handler non chiamava `auth()`: chiunque, anche senza sessione, poteva
 * aprire lo stream `posti` e restare in ascolto del broadcast. Ora si richiede
 * una sessione valida con `requireUser()` → 401 (via `AuthError`) se assente.
 * In coppia con questa modifica, `emitCodaPromozione` NON mette più
 * `userId`/`prenotazioneId` di terzi nel payload del canale pubblico `posti`
 * (restano solo nella notifica personale sul canale `user-<id>`).
 */

import { NextResponse } from 'next/server';

import { AuthError, requireUser } from '@/lib/auth';
import { createSSEStream } from '@/lib/sse-emitter';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    // Gate di autenticazione: senza sessione valida `requireUser` lancia
    // `AuthError(401)` e lo stream non viene nemmeno creato.
    await requireUser();
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, code: error.code, error: error.message },
        { status: error.status },
      );
    }
    // Errore inatteso durante il recupero della sessione: 500 generico.
    console.error('Errore auth SSE /api/sse/posti:', error);
    return NextResponse.json(
      { success: false, error: 'Errore interno del server' },
      { status: 500 },
    );
  }

  const stream = createSSEStream('posti');

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disabilita buffering nginx
    },
  });
}
