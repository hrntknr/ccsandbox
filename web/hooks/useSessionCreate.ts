import { useState, useCallback, useRef } from 'react';
import type { Session, SessionCreateClientMessage, SessionCreateServerMessage, DevcontainerSource } from '@shared/index.js';

export interface SessionCreateRequest {
  title?: string;
  repo: string;
  baseBranch: string;
  workBranch: string;
  shell?: string;
  /** Source of devcontainer configuration (default: { type: 'project' }) */
  devcontainerSource?: DevcontainerSource;
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

const SESSION_CREATE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export function useSessionCreate(): UseSessionCreateReturn {
  const [logs, setLogs] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearSessionTimeout = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    setLogs('');
    setLoading(false);
    setError(null);
    setSession(null);
    clearSessionTimeout();
  }, [clearSessionTimeout]);

  const cancel = useCallback(() => {
    clearSessionTimeout();
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setLoading(false);
  }, [clearSessionTimeout]);

  const create = useCallback((request: SessionCreateRequest) => {
    // Reset previous state
    reset();
    setLoading(true);

    // Build WebSocket URL
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/session`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    // Set timeout
    timeoutRef.current = setTimeout(() => {
      if (wsRef.current === ws && loading) {
        setError('Session creation timed out');
        setLoading(false);
        ws.close();
        wsRef.current = null;
      }
    }, SESSION_CREATE_TIMEOUT_MS);

    ws.onopen = () => {
      // Send create-session message
      const message: SessionCreateClientMessage = {
        type: 'create-session',
        title: request.title,
        repo: request.repo,
        baseBranch: request.baseBranch,
        workBranch: request.workBranch,
        shell: request.shell,
        devcontainerSource: request.devcontainerSource,
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
            clearSessionTimeout();
            setSession(message.session);
            setLoading(false);
            ws.close();
            wsRef.current = null;
            break;
          case 'session-error':
            clearSessionTimeout();
            setError(message.message);
            setLoading(false);
            ws.close();
            wsRef.current = null;
            break;
        }
      } catch {
        console.error('Failed to parse WebSocket message');
        clearSessionTimeout();
        setError('Failed to parse server message');
        setLoading(false);
        ws.close();
        wsRef.current = null;
      }
    };

    ws.onerror = () => {
      clearSessionTimeout();
      setError('WebSocket connection error');
      setLoading(false);
      wsRef.current = null;
    };

    ws.onclose = () => {
      // If still loading when closed, it's an unexpected close
      if (wsRef.current === ws) {
        clearSessionTimeout();
        setLoading(false);
        wsRef.current = null;
      }
    };
  }, [reset, clearSessionTimeout]);

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
