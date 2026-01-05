"use client";

/**
 * 🔄 Hook useSSE - Real-time Updates via Server-Sent Events
 * 
 * Hook React per ricevere aggiornamenti in tempo reale dal server.
 * Si riconnette automaticamente in caso di disconnessione.
 * 
 * @example
 * ```tsx
 * const { data, isConnected, error } = useSSE<PostoUpdate>('/api/sse/posti', {
 *   onMessage: (event, data) => console.log('Nuovo evento:', event, data),
 *   events: ['posto-update', 'occupazione-update'],
 * });
 * ```
 */

import { useEffect, useState, useRef, useCallback } from 'react';

interface UseSSEOptions<T> {
  /** Callback quando arriva un messaggio */
  onMessage?: (event: string, data: T) => void;
  /** Eventi specifici da ascoltare (default: tutti) */
  events?: string[];
  /** Riconnetti automaticamente (default: true) */
  autoReconnect?: boolean;
  /** Delay riconnessione in ms (default: 3000) */
  reconnectDelay?: number;
  /** Abilitato (default: true) */
  enabled?: boolean;
}

interface UseSSEReturn<T> {
  /** Ultimo dato ricevuto */
  data: T | null;
  /** Ultimo evento ricevuto */
  lastEvent: string | null;
  /** Connesso al server */
  isConnected: boolean;
  /** Errore di connessione */
  error: Error | null;
  /** Riconnetti manualmente */
  reconnect: () => void;
  /** Disconnetti */
  disconnect: () => void;
}

export function useSSE<T = unknown>(
  url: string,
  options: UseSSEOptions<T> = {}
): UseSSEReturn<T> {
  const {
    onMessage,
    events,
    autoReconnect = true,
    reconnectDelay = 3000,
    enabled = true,
  } = options;

  const [data, setData] = useState<T | null>(null);
  const [lastEvent, setLastEvent] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const onMessageRef = useRef(onMessage);

  // Aggiorna ref per evitare stale closures
  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  const connectRef = useRef<(() => void) | undefined>(undefined);

  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    setIsConnected(false);
  }, []);

  const connect = useCallback(() => {
    if (!enabled) return;

    // Pulisci connessione esistente
    disconnect();

    try {
      const eventSource = new EventSource(url);
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        console.log(`✅ SSE Connesso a ${url}`);
        setIsConnected(true);
        setError(null);
      };

      eventSource.onerror = (e) => {
        console.error(`❌ SSE Errore su ${url}:`, e);
        setIsConnected(false);
        setError(new Error('Connessione SSE persa'));

        // Chiudi e riconnetti
        eventSource.close();
        eventSourceRef.current = null;

        if (autoReconnect && connectRef.current) {
          console.log(`🔄 SSE Riconnessione tra ${reconnectDelay}ms...`);
          reconnectTimeoutRef.current = setTimeout(() => {
            connectRef.current?.();
          }, reconnectDelay);
        }
      };

      // Handler generico per tutti gli eventi
      eventSource.onmessage = (e) => {
        try {
          const parsedData = JSON.parse(e.data) as T;
          setData(parsedData);
          setLastEvent('message');
          onMessageRef.current?.('message', parsedData);
        } catch {
          console.warn('SSE: Impossibile parsare messaggio:', e.data);
        }
      };

      // Handler per eventi specifici
      if (events && events.length > 0) {
        events.forEach((eventName) => {
          eventSource.addEventListener(eventName, (e: Event) => {
            const messageEvent = e as MessageEvent;
            try {
              const parsedData = JSON.parse(messageEvent.data) as T;
              setData(parsedData);
              setLastEvent(eventName);
              onMessageRef.current?.(eventName, parsedData);
            } catch {
              console.warn(`SSE: Impossibile parsare evento ${eventName}:`, messageEvent.data);
            }
          });
        });
      }
    } catch (err) {
      console.error('SSE: Errore creazione EventSource:', err);
      setError(err instanceof Error ? err : new Error('Errore sconosciuto'));
    }
  }, [url, enabled, autoReconnect, reconnectDelay, events, disconnect]);

  // Aggiorna ref per evitare problemi di closure
  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  const reconnect = useCallback(() => {
    disconnect();
    connect();
  }, [disconnect, connect]);

  useEffect(() => {
    // Avvia connessione SSE (pattern valido per sincronizzare con sistema esterno)
    const initConnection = () => {
      connect();
    };
    initConnection();

    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  return {
    data,
    lastEvent,
    isConnected,
    error,
    reconnect,
    disconnect,
  };
}

// Types per eventi specifici
export interface PostoUpdate {
  postoId: string;
  stato: 'DISPONIBILE' | 'OCCUPATO' | 'MANUTENZIONE';
  numero: string;
  salaId: string;
  salaNome?: string;
}

export interface OccupazioneUpdate {
  salaId: string;
  salaNome: string;
  disponibili: number;
  totale: number;
  percentuale: number;
}

// Hook specializzato per aggiornamenti posti
export function usePostiRealtime(options?: {
  onPostoUpdate?: (data: PostoUpdate) => void;
  onOccupazioneUpdate?: (data: OccupazioneUpdate) => void;
  enabled?: boolean;
}) {
  const { onPostoUpdate, onOccupazioneUpdate, enabled = true } = options || {};

  return useSSE<PostoUpdate | OccupazioneUpdate>('/api/sse/posti', {
    enabled,
    events: ['posto-update', 'occupazione-update'],
    onMessage: (event, data) => {
      if (event === 'posto-update' && onPostoUpdate) {
        onPostoUpdate(data as PostoUpdate);
      } else if (event === 'occupazione-update' && onOccupazioneUpdate) {
        onOccupazioneUpdate(data as OccupazioneUpdate);
      }
    },
  });
}
