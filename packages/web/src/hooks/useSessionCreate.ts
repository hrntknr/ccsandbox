import { useState, useCallback, useRef } from 'react';
import type { Session, SessionCreateClientMessage, SessionCreateServerMessage } from '@ccsandbox/shared';

export interface SessionCreateRequest {
  title?: string;
  repo: string;
  baseBranch: string;
  workBranch: string;
}

export interface UseSessionCreateReturn {
  /** Start session creation via WebSocket */
  create: (request: SessionCreateRequest) => void;
  /** Cancel session creation (closes WebSocket) */
  cancel: () => void;
  /** Accumulated log output */
  logs: string;
  /** Whether creation is in progress */
  loading: boolean;
  /** Error message if creation failed */
  error: string | null;
  /** Created session on success */
  session: Session | null;
  /** Reset state for new creation */
  reset: () => void;
}

export function useSessionCreate(): UseSessionCreateReturn {
  const [logs, setLogs] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const reset = useCallback(() => {
    setLogs('');
    setLoading(false);
    setError(null);
    setSession(null);
  }, []);

  const cancel = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setLoading(false);
  }, []);

  const create = useCallback((request: SessionCreateRequest) => {
    // Reset previous state
    reset();
    setLoading(true);

    // Build WebSocket URL
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/session`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      // Send create-session message
      const message: SessionCreateClientMessage = {
        type: 'create-session',
        title: request.title,
        repo: request.repo,
        baseBranch: request.baseBranch,
        workBranch: request.workBranch,
      };
      ws.send(JSON.stringify(message));
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as SessionCreateServerMessage;

        switch (message.type) {
          case 'session-log':
            setLogs((prev) => prev + message.data);
            break;
          case 'session-created':
            setSession(message.session);
            setLoading(false);
            ws.close();
            wsRef.current = null;
            break;
          case 'session-error':
            setError(message.message);
            setLoading(false);
            ws.close();
            wsRef.current = null;
            break;
        }
      } catch {
        console.error('Failed to parse WebSocket message');
      }
    };

    ws.onerror = () => {
      setError('WebSocket connection error');
      setLoading(false);
      wsRef.current = null;
    };

    ws.onclose = () => {
      // If still loading when closed, it's an unexpected close
      if (wsRef.current === ws) {
        setLoading(false);
        wsRef.current = null;
      }
    };
  }, [reset]);

  return {
    create,
    cancel,
    logs,
    loading,
    error,
    session,
    reset,
  };
}
