import { useState, useRef, useEffect, useCallback } from 'react';
import type { Session } from '@ccsandbox/shared';

interface SessionListProps {
  sessions: Session[];
  selectedSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
  onNewSession: () => void;
  onDeleteSession?: (sessionId: string) => void;
  onStartSession?: (sessionId: string) => void;
  onStopSession?: (sessionId: string) => void;
  onOpenSettings?: () => void;
  loading?: boolean;
}

function getStateClasses(state: Session['state']): string {
  switch (state) {
    case 'RUNNING':
      return 'bg-vscode-success-bg text-vscode-success';
    case 'STOPPED':
      return 'bg-vscode-info-bg text-vscode-info';
    case 'ERROR':
      return 'bg-vscode-error-bg text-vscode-error';
    default:
      return 'bg-vscode-border text-vscode-text-secondary';
  }
}

export function SessionList({
  sessions,
  selectedSessionId,
  onSelectSession,
  onNewSession,
  onDeleteSession,
  onStartSession,
  onStopSession,
  onOpenSettings,
  loading = false,
}: SessionListProps) {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const handleMenuToggle = (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setOpenMenuId(openMenuId === sessionId ? null : sessionId);
  };

  const handleMenuAction = useCallback((action: () => void, e: React.MouseEvent) => {
    e.stopPropagation();
    setOpenMenuId(null);
    action();
  }, []);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenuId(null);
      }
    };

    if (openMenuId) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [openMenuId]);

  return (
    <div className="flex flex-col h-full bg-vscode-bg border-r border-vscode-border max-md:border-r-0">
      <div className="flex justify-between items-center py-3 px-4 border-b border-vscode-border max-md:py-2.5 max-md:px-3">
        <h2 className="m-0 text-base font-semibold text-white max-md:text-[15px]">Sessions</h2>
        <div className="flex items-center gap-2">
          {onOpenSettings && (
            <button
              className="flex items-center justify-center w-8 h-8 p-0 bg-transparent border-none rounded text-vscode-text-secondary cursor-pointer transition-colors hover:text-vscode-text hover:bg-vscode-border-light disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={onOpenSettings}
              disabled={loading}
              title="Settings"
            >
              <svg viewBox="0 0 16 16" fill="currentColor" className="w-[18px] h-[18px]">
                <path d="M8 4.754a3.246 3.246 0 1 0 0 6.492 3.246 3.246 0 0 0 0-6.492ZM5.754 8a2.246 2.246 0 1 1 4.492 0 2.246 2.246 0 0 1-4.492 0Z" />
                <path d="M9.796 1.343c-.527-1.79-3.065-1.79-3.592 0l-.094.319a.873.873 0 0 1-1.255.52l-.292-.16c-1.64-.892-3.433.902-2.54 2.541l.159.292a.873.873 0 0 1-.52 1.255l-.319.094c-1.79.527-1.79 3.065 0 3.592l.319.094a.873.873 0 0 1 .52 1.255l-.16.292c-.892 1.64.901 3.434 2.541 2.54l.292-.159a.873.873 0 0 1 1.255.52l.094.319c.527 1.79 3.065 1.79 3.592 0l.094-.319a.873.873 0 0 1 1.255-.52l.292.16c1.64.893 3.434-.902 2.54-2.541l-.159-.292a.873.873 0 0 1 .52-1.255l.319-.094c1.79-.527 1.79-3.065 0-3.592l-.319-.094a.873.873 0 0 1-.52-1.255l.16-.292c.893-1.64-.902-3.433-2.541-2.54l-.292.159a.873.873 0 0 1-1.255-.52l-.094-.319Zm-2.633.283c.246-.835 1.428-.835 1.674 0l.094.319a1.873 1.873 0 0 0 2.693 1.115l.291-.16c.764-.415 1.6.42 1.184 1.185l-.159.292a1.873 1.873 0 0 0 1.116 2.692l.318.094c.835.246.835 1.428 0 1.674l-.319.094a1.873 1.873 0 0 0-1.115 2.693l.16.291c.415.764-.42 1.6-1.185 1.184l-.291-.159a1.873 1.873 0 0 0-2.693 1.116l-.094.318c-.246.835-1.428.835-1.674 0l-.094-.319a1.873 1.873 0 0 0-2.692-1.115l-.292.16c-.764.415-1.6-.42-1.184-1.185l.159-.291A1.873 1.873 0 0 0 1.945 8.93l-.319-.094c-.835-.246-.835-1.428 0-1.674l.319-.094A1.873 1.873 0 0 0 3.06 4.377l-.16-.292c-.415-.764.42-1.6 1.185-1.184l.292.159a1.873 1.873 0 0 0 2.692-1.115l.094-.319Z" />
              </svg>
            </button>
          )}
          <button
            className="py-1.5 px-3 bg-vscode-accent text-white border-none rounded cursor-pointer text-[13px] hover:bg-vscode-accent-hover disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={onNewSession}
            disabled={loading}
          >
            New
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading && sessions.length === 0 && (
          <div className="p-4 text-vscode-text-secondary text-center">Loading...</div>
        )}

        {!loading && sessions.length === 0 && (
          <div className="p-4 text-vscode-text-secondary text-center">No sessions</div>
        )}

        {sessions.map((session) => (
          <div
            key={session.sessionId}
            className={`py-3 px-4 border-b border-vscode-bg-hover cursor-pointer hover:bg-vscode-bg-hover max-md:py-2.5 max-md:px-3 ${selectedSessionId === session.sessionId ? 'bg-vscode-selection' : ''}`}
            onClick={() => onSelectSession(session.sessionId)}
          >
            <div className="flex justify-between items-start mb-1">
              <div className="text-sm font-medium text-white flex-1 overflow-hidden text-ellipsis whitespace-nowrap max-md:text-[13px]">{session.title || 'Untitled'}</div>
              <div className="relative ml-2 shrink-0" ref={openMenuId === session.sessionId ? menuRef : null}>
                <button
                  className="bg-transparent border-none text-vscode-text-muted cursor-pointer p-1 w-6 h-6 flex items-center justify-center rounded-[3px] hover:bg-white/10 hover:text-vscode-text"
                  onClick={(e) => handleMenuToggle(session.sessionId, e)}
                  title="Session actions"
                >
                  <svg viewBox="0 0 16 16" fill="currentColor" width="16" height="16">
                    <path d="M8 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM1.5 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm13 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" />
                  </svg>
                </button>
                {openMenuId === session.sessionId && (
                  <div className="absolute top-full right-0 z-[100] min-w-[120px] bg-vscode-bg-secondary border border-vscode-border-light rounded shadow-[0_4px_12px_rgba(0,0,0,0.3)] py-1 mt-1">
                    {session.state === 'STOPPED' && onStartSession && (
                      <button
                        className="flex items-center gap-2 w-full py-2 px-3 bg-transparent border-none text-vscode-text text-[13px] cursor-pointer text-left hover:bg-vscode-selection"
                        onClick={(e) => handleMenuAction(() => onStartSession(session.sessionId), e)}
                      >
                        <svg viewBox="0 0 16 16" fill="currentColor" width="14" height="14" className="shrink-0">
                          <path d="M4 2.5a.5.5 0 0 1 .77-.42l9 5.5a.5.5 0 0 1 0 .84l-9 5.5A.5.5 0 0 1 4 13.5v-11Z" />
                        </svg>
                        Start
                      </button>
                    )}
                    {session.state === 'RUNNING' && onStopSession && (
                      <button
                        className="flex items-center gap-2 w-full py-2 px-3 bg-transparent border-none text-vscode-text text-[13px] cursor-pointer text-left hover:bg-vscode-selection"
                        onClick={(e) => handleMenuAction(() => onStopSession(session.sessionId), e)}
                      >
                        <svg viewBox="0 0 16 16" fill="currentColor" width="14" height="14" className="shrink-0">
                          <path d="M3.5 3.5A.5.5 0 0 1 4 3h8a.5.5 0 0 1 .5.5v9a.5.5 0 0 1-.5.5H4a.5.5 0 0 1-.5-.5v-9Z" />
                        </svg>
                        Stop
                      </button>
                    )}
                    {onDeleteSession && (
                      <button
                        className="flex items-center gap-2 w-full py-2 px-3 bg-transparent border-none text-vscode-error text-[13px] cursor-pointer text-left hover:bg-vscode-error-bg"
                        onClick={(e) => handleMenuAction(() => onDeleteSession(session.sessionId), e)}
                      >
                        <svg viewBox="0 0 16 16" fill="currentColor" width="14" height="14" className="shrink-0">
                          <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5Zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5Zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6Z" />
                          <path d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1ZM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118ZM2.5 3h11V2h-11v1Z" />
                        </svg>
                        Delete
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="text-xs text-[#aaa] mb-1 max-md:text-[11px]">{session.repo}</div>
            <div className="text-[11px] text-vscode-text-secondary mb-1 max-md:text-[10px]">
              <span className="text-vscode-text-muted">base:</span> {session.baseBranch}
              <span className="mx-1.5 text-[#444]">/</span>
              <span className="text-vscode-text-muted">work:</span> {session.workBranch}
            </div>
            <div className={`inline-block text-[10px] font-semibold uppercase py-0.5 px-1.5 rounded-[3px] max-md:text-[9px] ${getStateClasses(session.state)}`}>
              {session.state}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
