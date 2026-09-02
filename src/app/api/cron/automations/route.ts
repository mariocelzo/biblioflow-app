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

import { NextRequest, NextResponse } from 'next/server';
import { runAllAutomations } from '@/lib/automation-service';
import { env } from '@/lib/env';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const CRON_AUTOMATIONS_LOCK_KEY = 424241;

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

    const cronSecret = env.CRON_SECRET || 'dev-secret-change-in-production';

    if (token !== cronSecret) {
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

    return NextResponse.json(
      {
        success: false,
        runId,
        error: 'Errore durante l\'esecuzione delle automazioni',
        message: error instanceof Error ? error.message : 'Errore sconosciuto',
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
