import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import type { Session, SessionCreateClientMessage, SessionCreateServerMessage, DevcontainerSource } from '@shared/index.js';
import '@xterm/xterm/css/xterm.css';

export interface SessionCreationRequest {
  id: string;
  title?: string;
  repo: string;
  baseBranch: string;
  workBranch: string;
  shell?: string;
  devcontainerSource?: DevcontainerSource;
  mountClaudeSettings?: boolean;
}

interface SessionCreationWidgetProps {
  request: SessionCreationRequest;
  index: number;
  onComplete: (id: string, session: Session) => void;
  onError: (id: string, error: string) => void;
  onCancel: (id: string) => void;
}

const SESSION_CREATE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export function SessionCreationWidget({
  request,
  index,
  onComplete,
  onError,
  onCancel,
}: SessionCreationWidgetProps) {
  const [logs, setLogs] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const terminalContainerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  // Start WebSocket connection on mount
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/session`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    // Set timeout
    timeoutRef.current = setTimeout(() => {
      if (wsRef.current === ws) {
        setError('Session creation timed out');
        setLoading(false);
        ws.close();
        wsRef.current = null;
      }
    }, SESSION_CREATE_TIMEOUT_MS);

    ws.onopen = () => {
      const message: SessionCreateClientMessage = {
        type: 'create-session',
        title: request.title,
        repo: request.repo,
        baseBranch: request.baseBranch,
        workBranch: request.workBranch,
        shell: request.shell,
        devcontainerSource: request.devcontainerSource,
        mountClaudeSettings: request.mountClaudeSettings,
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
            if (timeoutRef.current) {
              clearTimeout(timeoutRef.current);
              timeoutRef.current = null;
            }
            setSession(message.session);
            setLoading(false);
            ws.close();
            wsRef.current = null;
            break;
          case 'session-error':
            if (timeoutRef.current) {
              clearTimeout(timeoutRef.current);
              timeoutRef.current = null;
            }
            setError(message.message);
            setLoading(false);
            ws.close();
            wsRef.current = null;
            break;
        }
      } catch {
        console.error('Failed to parse WebSocket message');
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
        setError('Failed to parse server message');
        setLoading(false);
        ws.close();
        wsRef.current = null;
      }
    };

    ws.onerror = () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      setError('WebSocket connection error');
      setLoading(false);
      wsRef.current = null;
    };

    ws.onclose = () => {
      if (wsRef.current === ws) {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
        setLoading(false);
        wsRef.current = null;
      }
    };

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [request]);

  // Notify parent on completion
  useEffect(() => {
    if (session) {
      onComplete(request.id, session);
    }
  }, [session, request.id, onComplete]);

  // Notify parent on error (but don't auto-remove, let user see error)
  useEffect(() => {
    if (error) {
      onError(request.id, error);
    }
  }, [error, request.id, onError]);

  // Initialize terminal when expanded
  useEffect(() => {
    const container = terminalContainerRef.current;
    if (!isExpanded || !container || terminalRef.current) {
      return;
    }

    const terminal = new XTerm({
      cursorBlink: false,
      fontSize: 12,
      fontFamily: '"JetBrainsMono Nerd Font", "FiraCode Nerd Font", "MesloLGS NF", "Hack Nerd Font", Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: '#1e1e1e',
        foreground: '#d4d4d4',
        cursor: '#d4d4d4',
      },
      disableStdin: true,
      convertEol: true,
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);

    terminal.open(container);
    fitAddon.fit();

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    // Write existing logs
    if (logs) {
      terminal.write(logs);
    }
  }, [isExpanded, logs]);

  // Dispose terminal when collapsing
  useEffect(() => {
    if (!isExpanded && terminalRef.current) {
      terminalRef.current.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    }
  }, [isExpanded]);

  // Write logs to terminal
  useEffect(() => {
    if (terminalRef.current && logs) {
      terminalRef.current.clear();
      terminalRef.current.write(logs);
    }
  }, [logs]);

  const handleCancel = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    onCancel(request.id);
  }, [request.id, onCancel]);

  const handleClose = useCallback(() => {
    onCancel(request.id);
  }, [request.id, onCancel]);

  const container = document.getElementById('terminal-pane-container');
  if (!container) return null;

  // Calculate top position based on index
  const topPosition = 16 + index * 72; // 16px base + 72px per widget (including gap)

  // Collapsed widget
  if (!isExpanded) {
    return createPortal(
      <div
        className="absolute right-4 z-[100] bg-[#1e1e1e] rounded-lg shadow-2xl border border-[#333] p-3 cursor-pointer hover:border-[#0078d4] transition-all group"
        style={{ top: `${topPosition}px` }}
        onClick={() => setIsExpanded(true)}
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#0078d4]/20 flex items-center justify-center">
            {loading ? (
              <div className="w-4 h-4 border-2 border-[#0078d4]/30 border-t-[#0078d4] rounded-full animate-spin" />
            ) : error ? (
              <svg className="w-4 h-4 text-[#ff6b6b]" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            ) : session ? (
              <svg className="w-4 h-4 text-[#4ec9b0]" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            ) : null}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-white truncate max-w-[180px]">
              {error ? 'Creation Failed' : session ? 'Session Created' : 'Creating Session...'}
            </div>
            <div className="text-xs text-[#888] truncate max-w-[180px]">
              {request.repo.split('/')[1] || request.repo}
            </div>
          </div>
          <button
            className="w-5 h-5 flex items-center justify-center text-[#666] hover:text-white transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              handleClose();
            }}
            title="Close"
          >
            <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
              <path d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" />
            </svg>
          </button>
        </div>
      </div>,
      container
    );
  }

  // Expanded modal
  return createPortal(
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex justify-center items-center z-[1000]">
      <div className="bg-[#1e1e1e] rounded-xl w-[900px] max-w-[90%] h-[700px] max-h-[90%] flex flex-col overflow-hidden shadow-2xl border border-[#333] max-md:w-[95%] max-md:max-w-none max-md:h-[calc(100%-32px)] max-md:max-h-none">
        <div className="flex justify-between items-center py-4 px-5 border-b border-[#333]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#0078d4]/20 flex items-center justify-center">
              {loading ? (
                <div className="w-4 h-4 border-2 border-[#0078d4]/30 border-t-[#0078d4] rounded-full animate-spin" />
              ) : error ? (
                <svg className="w-4 h-4 text-[#ff6b6b]" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              ) : session ? (
                <svg className="w-4 h-4 text-[#4ec9b0]" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              ) : null}
            </div>
            <div>
              <h2 className="m-0 text-lg font-semibold text-white">
                {error ? 'Creation Failed' : session ? 'Session Created' : 'Creating Session'}
              </h2>
              <p className="m-0 text-xs text-[#888]">
                {request.repo}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {loading && (
              <button
                className="flex items-center justify-center w-8 h-8 bg-transparent border-none rounded-lg text-[#888] cursor-pointer transition-all hover:text-white hover:bg-[#333]"
                onClick={() => setIsExpanded(false)}
                title="Minimize"
              >
                <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M5 10a1 1 0 011-1h8a1 1 0 110 2H6a1 1 0 01-1-1z" clipRule="evenodd" />
                </svg>
              </button>
            )}
            <button
              className="flex items-center justify-center w-8 h-8 bg-transparent border-none rounded-lg text-[#888] cursor-pointer transition-all hover:text-white hover:bg-[#333]"
              onClick={loading ? handleCancel : handleClose}
            >
              <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                <path d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex-1 flex flex-col p-4 min-h-0">
          {error && (
            <div className="flex items-center gap-3 bg-[#3d1f1f] text-[#ff8080] p-3 rounded-lg text-sm border border-[#5c2b2b] mb-3">
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <span className="flex-1">{error}</span>
            </div>
          )}

          <div className="flex-1 bg-[#1e1e1e] border border-[#333] rounded-lg overflow-hidden min-h-0" ref={terminalContainerRef} />

          <div className="flex justify-between items-center gap-3 mt-3">
            {error ? (
              <button
                type="button"
                className="py-2 px-4 rounded-lg font-medium text-sm cursor-pointer border-none bg-[#0078d4] text-white transition-all hover:bg-[#1084d8]"
                onClick={handleClose}
              >
                Close
              </button>
            ) : loading ? (
              <>
                <span className="text-[#888] text-sm flex items-center gap-2">
                  <div className="w-3 h-3 border-2 border-[#444] border-t-[#0078d4] rounded-full animate-spin" />
                  Creating session...
                </span>
                <button
                  type="button"
                  className="py-2 px-4 rounded-lg font-medium text-sm cursor-pointer border border-[#444] bg-transparent text-[#ccc] transition-all hover:bg-[#333] hover:border-[#555] hover:text-white"
                  onClick={handleCancel}
                >
                  Cancel
                </button>
              </>
            ) : session ? (
              <>
                <span className="text-[#4ec9b0] text-sm flex items-center gap-2">
                  <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  Session created successfully!
                </span>
                <button
                  type="button"
                  className="py-2 px-4 rounded-lg font-medium text-sm cursor-pointer border-none bg-[#0078d4] text-white transition-all hover:bg-[#1084d8]"
                  onClick={handleClose}
                >
                  Close
                </button>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
