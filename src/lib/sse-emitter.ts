/**
 * 🔄 Server-Sent Events (SSE) Emitter
 * 
 * Sistema real-time leggero per Next.js App Router.
 * Alternativa a Socket.io che funziona nativamente.
 * 
 * Uso:
 * - Server: sseEmitter.emit('posti-update', { postoId: '...', stato: 'OCCUPATO' })
 * - Client: useSSE('/api/sse/posti') per ricevere updates
 */

type SSEClient = {
  id: string;
  controller: ReadableStreamDefaultController;
  channel: string;
};

class SSEEmitter {
  private clients: Map<string, SSEClient> = new Map();

  /**
   * Registra un nuovo client SSE
   */
  addClient(id: string, controller: ReadableStreamDefaultController, channel: string): void {
    this.clients.set(id, { id, controller, channel });
    console.log(`📡 SSE Client connesso: ${id} su canale ${channel} (totale: ${this.clients.size})`);
  }

  /**
   * Rimuove un client disconnesso
   */
  removeClient(id: string): void {
    this.clients.delete(id);
    console.log(`📴 SSE Client disconnesso: ${id} (totale: ${this.clients.size})`);
  }

  /**
   * Invia evento a tutti i client di un canale
   */
  emit(channel: string, event: string, data: unknown): void {
    const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    let sent = 0;

    this.clients.forEach((client) => {
      if (client.channel === channel || client.channel === '*') {
        try {
          client.controller.enqueue(new TextEncoder().encode(message));
          sent++;
        } catch (error) {
          // Client disconnesso, rimuovilo
          console.error(`Errore invio a ${client.id}:`, error);
          this.removeClient(client.id);
        }
      }
    });

    if (sent > 0) {
      console.log(`📤 SSE Evento "${event}" inviato a ${sent} client su canale "${channel}"`);
    }
  }

  /**
   * Invia evento a un client specifico
   */
  emitToClient(clientId: string, event: string, data: unknown): void {
    const client = this.clients.get(clientId);
    if (client) {
      const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
      try {
        client.controller.enqueue(new TextEncoder().encode(message));
      } catch (error) {
        console.error(`Errore invio a ${clientId}:`, error);
        this.removeClient(clientId);
      }
    }
  }

  /**
   * Conta client connessi per canale
   */
  getClientCount(channel?: string): number {
    if (!channel) return this.clients.size;
    return Array.from(this.clients.values()).filter(c => c.channel === channel).length;
  }

  /**
   * Broadcast a tutti i client
   */
  broadcast(event: string, data: unknown): void {
    const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    this.clients.forEach((client) => {
      try {
        client.controller.enqueue(new TextEncoder().encode(message));
      } catch {
        this.removeClient(client.id);
      }
    });
  }
}

// Singleton per condividere tra route handlers
export const sseEmitter = new SSEEmitter();

// Helper per creare stream SSE
export function createSSEStream(channel: string): ReadableStream {
  const clientId = `client-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  return new ReadableStream({
    start(controller) {
      // Invia ping iniziale
      controller.enqueue(new TextEncoder().encode(': connected\n\n'));
      
      // Registra client
      sseEmitter.addClient(clientId, controller, channel);

      // Keepalive ogni 30 secondi
      const keepalive = setInterval(() => {
        try {
          controller.enqueue(new TextEncoder().encode(': keepalive\n\n'));
        } catch {
          clearInterval(keepalive);
        }
      }, 30000);
    },
    cancel() {
      sseEmitter.removeClient(clientId);
    },
  });
}
