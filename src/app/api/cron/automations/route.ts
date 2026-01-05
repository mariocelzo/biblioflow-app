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

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

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
  try {
    // Verifica autorizzazione
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.split(' ')[1]; // Bearer <token>

    const cronSecret = process.env.CRON_SECRET || 'dev-secret-change-in-production';

    if (token !== cronSecret) {
      console.warn('❌ Tentativo accesso non autorizzato al cron job');
      return NextResponse.json(
        { error: 'Non autorizzato' },
        { status: 401 }
      );
    }

    console.log('🤖 Cron job avviato:', new Date().toISOString());

    // Esegui tutte le automazioni
    const results = await runAllAutomations();

    // Log risultati
    console.log('✅ Cron job completato:', {
      timestamp: results.timestamp,
      reminders: results.reminders.sent,
      loanAlerts: results.loanAlerts.sent,
      noShows: results.noShows.released,
      errors: results.errors.length,
    });

    return NextResponse.json({
      success: true,
      message: 'Automazioni eseguite con successo',
      results,
    });

  } catch (error) {
    console.error('❌ Errore cron job:', error);

    return NextResponse.json(
      {
        success: false,
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
