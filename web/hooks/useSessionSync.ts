import { useState, useEffect, useCallback, useRef } from 'react';
import type { Session, SessionSyncServerMessage } from '@shared/index.js';

export type ConnectionState = 'connected' | 'disconnected' | 'reconnecting';

interface UseSessionSyncReturn {
  sessions: Session[];
  loading: boolean;
  error: string | null;
  connected: boolean;
  connectionState: ConnectionState;
  reconnectAttempt: number;
  justReconnected: boolean;
}

// Reconnect backoff configuration (same as useTerminalWebSocket)
const RECONNECT_BASE_DELAY = 1000;
const RECONNECT_MAX_DELAY = 30000;
const RECONNECT_MULTIPLIER = 2;

/**
 * Hook for syncing session state via WebSocket.
 * Automatically reconnects on disconnection.
 */
export function useSessionSync(): UseSessionSyncReturn {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const [justReconnected, setJustReconnected] = useState(false);

  // Derived state for backward compatibility
  const connected = connectionState === 'connected';

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const reconnectDelayRef = useRef<number>(RECONNECT_BASE_DELAY);
  const wasReconnectingRef = useRef(false);
  const justReconnectedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      // Send ready message to signal server to start sending data
      ws.send(JSON.stringify({ type: 'ready' }));

      // Reset backoff delay and reconnect attempt on successful connection
      reconnectDelayRef.current = RECONNECT_BASE_DELAY;
      setConnectionState('connected');
      setReconnectAttempt(0);
      setError(null);

      // Show "just reconnected" indicator if this was a reconnection
      if (wasReconnectingRef.current) {
        wasReconnectingRef.current = false;
        setJustReconnected(true);
        // Clear after 2 seconds
        if (justReconnectedTimeoutRef.current) {
          clearTimeout(justReconnectedTimeoutRef.current);
        }
        justReconnectedTimeoutRef.current = setTimeout(() => {
          setJustReconnected(false);
        }, 2000);
      }
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
      wsRef.current = null;
      const currentDelay = reconnectDelayRef.current;
      // Calculate next delay with exponential backoff
      reconnectDelayRef.current = Math.min(
        currentDelay * RECONNECT_MULTIPLIER,
        RECONNECT_MAX_DELAY
      );

      // Update state to reconnecting
      setConnectionState('reconnecting');
      setReconnectAttempt((prev) => prev + 1);
      wasReconnectingRef.current = true;

      // Schedule reconnect
      reconnectTimeoutRef.current = window.setTimeout(() => {
        connect();
      }, currentDelay);
    };
  }, []);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current !== null) {
        window.clearTimeout(reconnectTimeoutRef.current);
      }
      if (justReconnectedTimeoutRef.current !== null) {
        clearTimeout(justReconnectedTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  return { sessions, loading, error, connected, connectionState, reconnectAttempt, justReconnected };
}
