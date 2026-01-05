/**
 * 🔄 Real-time Events Service
 * 
 * Funzioni helper per emettere eventi real-time quando
 * lo stato dei posti o altri dati cambiano.
 * 
 * Uso in API routes:
 * ```ts
 * import { emitPostoUpdate } from '@/lib/realtime-events';
 * 
 * // Dopo aver aggiornato un posto nel DB
 * await emitPostoUpdate(posto.id, 'OCCUPATO', posto.numero, posto.salaId);
 * ```
 */

import { sseEmitter } from './sse-emitter';
import { prisma } from './prisma';

/**
 * Emette evento di aggiornamento posto
 */
export function emitPostoUpdate(
  postoId: string,
  stato: 'DISPONIBILE' | 'OCCUPATO' | 'MANUTENZIONE',
  numero: string,
  salaId: string,
  salaNome?: string
): void {
  sseEmitter.emit('posti', 'posto-update', {
    postoId,
    stato,
    numero,
    salaId,
    salaNome,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Emette evento di aggiornamento occupazione sala
 */
export async function emitOccupazioneUpdate(salaId: string): Promise<void> {
  try {
    const [sala, stats] = await Promise.all([
      prisma.sala.findUnique({ where: { id: salaId } }),
      prisma.posto.groupBy({
        by: ['stato'],
        where: { salaId },
        _count: true,
      }),
    ]);

    if (!sala) return;

    const totale = stats.reduce((acc, s) => acc + s._count, 0);
    const disponibili = stats.find(s => s.stato === 'DISPONIBILE')?._count || 0;
    const percentuale = totale > 0 ? Math.round(((totale - disponibili) / totale) * 100) : 0;

    sseEmitter.emit('posti', 'occupazione-update', {
      salaId,
      salaNome: sala.nome,
      disponibili,
      totale,
      percentuale,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Errore emitOccupazioneUpdate:', error);
  }
}

/**
 * Emette aggiornamento completo di tutte le sale
 */
export async function emitOccupazioneCompleta(): Promise<void> {
  try {
    const sale = await prisma.sala.findMany({
      include: {
        posti: {
          select: { stato: true },
        },
      },
    });

    for (const sala of sale) {
      const totale = sala.posti.length;
      const disponibili = sala.posti.filter(p => p.stato === 'DISPONIBILE').length;
      const percentuale = totale > 0 ? Math.round(((totale - disponibili) / totale) * 100) : 0;

      sseEmitter.emit('posti', 'occupazione-update', {
        salaId: sala.id,
        salaNome: sala.nome,
        disponibili,
        totale,
        percentuale,
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error) {
    console.error('Errore emitOccupazioneCompleta:', error);
  }
}

/**
 * Emette notifica real-time a un utente specifico
 */
export function emitNotificaRealtime(
  userId: string,
  notifica: {
    id: string;
    tipo: string;
    titolo: string;
    messaggio: string;
    actionUrl?: string;
  }
): void {
  sseEmitter.emit(`user-${userId}`, 'nuova-notifica', {
    ...notifica,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Broadcast messaggio a tutti i client connessi
 */
export function broadcastMessage(
  event: string,
  data: Record<string, unknown>
): void {
  sseEmitter.broadcast(event, {
    ...data,
    timestamp: new Date().toISOString(),
  });
}
