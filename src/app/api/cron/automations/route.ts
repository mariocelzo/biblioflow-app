/**
 * 🤖 Cron Job API - Automazioni Periodiche
 * 
 * Endpoint chiamato automaticamente da Vercel Cron ogni 5 minuti.
 * Esegue tutte le automazioni del sistema:
 * - Reminder check-in
 * - Alert scadenza prestiti
 * - Rilascio automatico no-show
 * 
 * Protezione: Richiede Authorization header con secret token
 */

import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { runAllAutomations } from '@/lib/automation-service';
import { env } from '@/lib/env';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const CRON_AUTOMATIONS_LOCK_KEY = 424241;

/**
 * Confronto a tempo costante fra il token ricevuto e il secret configurato (A-2).
 *
 * PERCHE': il confronto `!==` fra stringhe esce al primo carattere diverso, e
 * la differenza di tempo permette in teoria di ricostruire il secret carattere
 * per carattere (timing attack).
 *
 * `crypto.timingSafeEqual` pretende buffer della STESSA lunghezza (altrimenti
 * lancia): se le lunghezze differiscono il token e' comunque sbagliato, quindi
 * rispondiamo `false` senza chiamarlo.
 */
function secretCorrisponde(token: string, secret: string): boolean {
  const tokenBuffer = Buffer.from(token, 'utf8');
  const secretBuffer = Buffer.from(secret, 'utf8');

  if (tokenBuffer.length !== secretBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(tokenBuffer, secretBuffer);
}

async function runAutomationsWithLock(runId: string) {
  return prisma.$transaction(
    async (tx) => {
      const [lock] = await tx.$queryRaw<Array<{ acquired: boolean }>>`
        SELECT pg_try_advisory_xact_lock(${CRON_AUTOMATIONS_LOCK_KEY}) AS "acquired"
      `;

      if (!lock?.acquired) {
        console.info('Cron automazioni saltato: esecuzione gia\' attiva', { runId });
        return { skipped: true as const, results: null };
      }

      console.info('Cron automazioni: lock acquisito', { runId });
      const results = await runAllAutomations();
      return { skipped: false as const, results };
    },
    // Il cron puo' includere piu' automazioni e deve conservare il lock
    // oltre il timeout interattivo Prisma predefinito di cinque secondi.
    { maxWait: 5_000, timeout: 4 * 60_000 },
  );
}

/**
 * GET /api/cron/automations
 * 
 * Esegue tutte le automazioni periodiche
 * 
 * Headers richiesti:
 * - Authorization: Bearer <CRON_SECRET>
 * 
 * Responses:
 * - 200: Automazioni eseguite con successo
 * - 401: Token non valido
 * - 500: Errore durante l'esecuzione
 */
export async function GET(request: NextRequest) {
  const runId = crypto.randomUUID();

  try {
    // Verifica autorizzazione
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.split(' ')[1]; // Bearer <token>

    // Fail-closed (A-2): il default hardcoded 'dev-secret-change-in-production'
    // era pubblico nel repository, quindi in un deploy senza CRON_SECRET
    // chiunque poteva far girare le automazioni (rilasci no-show, promozioni
    // dalla coda...). Nessun valore di ripiego: se il secret non c'e'
    // l'endpoint non autorizza nessuno.
    const cronSecret = env.CRON_SECRET ?? process.env.CRON_SECRET;

    if (!cronSecret) {
      console.error('CRON_SECRET non configurato: endpoint cron disabilitato', { runId });

      // In produzione e' un errore di configurazione da far emergere (500),
      // non un problema di credenziali del chiamante.
      if (env.NODE_ENV === 'production') {
        return NextResponse.json(
          { success: false, runId, error: 'Cron non configurato' },
          { status: 500 }
        );
      }

      // In sviluppo non c'e' nulla con cui confrontare: si nega e basta.
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 });
    }

    if (!token || !secretCorrisponde(token, cronSecret)) {
      console.warn('❌ Tentativo accesso non autorizzato al cron job');
      return NextResponse.json(
        { error: 'Non autorizzato' },
        { status: 401 }
      );
    }

    console.info('Cron automazioni avviato', {
      runId,
      startedAt: new Date().toISOString(),
    });

    // Il lock transazionale impedisce che due invocazioni sovrapposte
    // processino gli stessi elementi. Le transizioni di stato rendono
    // idempotente una successiva esecuzione dopo il rilascio del lock.
    const execution = await runAutomationsWithLock(runId);

    if (execution.skipped) {
      return NextResponse.json({
        success: true,
        skipped: true,
        runId,
        message: 'Automazioni già in esecuzione',
      });
    }

    const { results } = execution;
    const promotions =
      'promoted' in results.noShows &&
      typeof results.noShows.promoted === 'number'
        ? results.noShows.promoted
        : 0;

    // Log risultati
    console.info('Cron automazioni completato', {
      runId,
      timestamp: results.timestamp,
      reminders: results.reminders.sent,
      loanAlerts: results.loanAlerts.sent,
      noShows: results.noShows.released,
      promotions,
      errors: results.errors.length,
    });

    return NextResponse.json({
      success: true,
      skipped: false,
      runId,
      message: 'Automazioni eseguite con successo',
      results,
    });

  } catch (error) {
    console.error('Errore cron automazioni', { runId, error });

    // B-2: il messaggio dell'eccezione non viene restituito al chiamante.
    // Poteva contenere dettagli interni (query Prisma, nomi di tabella,
    // stringhe di connessione) utili a chi sta sondando l'endpoint.
    // Il dettaglio resta nei log applicativi, insieme al runId per correlare.
    return NextResponse.json(
      {
        success: false,
        runId,
        error: 'Errore durante l\'esecuzione delle automazioni',
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/cron/automations
 * 
 * Endpoint alternativo per test manuali (stesso comportamento di GET)
 */
export async function POST(request: NextRequest) {
  return GET(request);
}
