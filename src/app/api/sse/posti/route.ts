/**
 * 🔄 SSE Endpoint per Real-time Posti
 * 
 * GET /api/sse/posti
 * 
 * Connessione Server-Sent Events per ricevere
 * aggiornamenti in tempo reale sullo stato dei posti.
 * 
 * Eventi:
 * - posto-update: { postoId, stato, numero, salaId }
 * - occupazione-update: { salaId, disponibili, totale, percentuale }
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
