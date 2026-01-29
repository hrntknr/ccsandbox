import { useState, useEffect, useCallback, useRef } from 'react';
import type { Session, SessionSyncServerMessage } from '@ccsandbox/shared';

interface UseSessionSyncReturn {
  sessions: Session[];
  loading: boolean;
  error: string | null;
  connected: boolean;
}

const WS_RECONNECT_DELAY = 3000;

/**
 * Hook for syncing session state via WebSocket.
 * Automatically reconnects on disconnection.
 */
export function useSessionSync(): UseSessionSyncReturn {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);

  const connect = useCallback(() => {
    // Clear any pending reconnect
    if (reconnectTimeoutRef.current !== null) {
      window.clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    // Close existing connection if any
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/sessions`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      setError(null);
    };

    ws.onmessage = (event) => {
      try {
        const message: SessionSyncServerMessage = JSON.parse(event.data);

        switch (message.type) {
          case 'sessions-sync':
            setSessions(message.sessions);
            setLoading(false);
            break;

          case 'session-created':
            setSessions((prev) => [...prev, message.session]);
            break;

          case 'session-updated':
            setSessions((prev) =>
              prev.map((s) =>
                s.sessionId === message.session.sessionId ? message.session : s
              )
            );
            break;

          case 'session-deleted':
            setSessions((prev) =>
              prev.filter((s) => s.sessionId !== message.sessionId)
            );
            break;
        }
      } catch {
        console.error('Failed to parse WebSocket message');
      }
    };

    ws.onerror = () => {
      setError('WebSocket connection error');
    };

    ws.onclose = () => {
      setConnected(false);
      wsRef.current = null;

      // Schedule reconnect
      reconnectTimeoutRef.current = window.setTimeout(() => {
        connect();
      }, WS_RECONNECT_DELAY);
    };
  }, []);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current !== null) {
        window.clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  return { sessions, loading, error, connected };
}
