/**
 * 🔄 SSE Endpoint per Real-time Posti
 * 
 * GET /api/sse/posti
 * 
 * Connessione Server-Sent Events per ricevere
 * aggiornamenti in tempo reale sullo stato dei posti.
 *
 * Canale: `posti` (invariato).
 *
 * Eventi:
 * - posto-update: { postoId, stato, numero, salaId }
 * - occupazione-update: { salaId, disponibili, totale, percentuale }
 * - coda-ingresso: { postoId, numero, salaId, data, oraInizio, oraFine, posizione } (BIB-45, CA-06)
 * - coda-promozione: { userId, postoId, numero, prenotazioneId, data, oraInizio, oraFine } (BIB-45, CA-06)
 *
 * NOTA (CA-06): `coda-ingresso` / `coda-promozione` sono nomi-evento nuovi che
 * NON alterano il contratto esistente. Un client che ascolta solo
 * `posto-update` / `occupazione-update` li ignora senza errori, perché
 * EventSource recapita un evento solo ai listener esplicitamente registrati.
 * La promozione viene inoltre notificata all'utente promosso sul canale
 * personale `user-<id>` con l'evento `nuova-notifica` già esistente.
 */

import { createSSEStream } from '@/lib/sse-emitter';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
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
