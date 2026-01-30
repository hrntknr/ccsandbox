import type { Session } from '@ccsandbox/shared';
import './SessionList.css';

interface SessionListProps {
  sessions: Session[];
  selectedSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
  onNewSession: () => void;
  onDeleteSession?: (sessionId: string) => void;
  onOpenSettings?: () => void;
  loading?: boolean;
}

function getStateClassName(state: Session['state']): string {
  switch (state) {
    case 'RUNNING':
      return 'state-running';
    case 'STOPPED':
      return 'state-stopped';
    case 'ERROR':
      return 'state-error';
    default:
      return '';
  }
}

export function SessionList({
  sessions,
  selectedSessionId,
  onSelectSession,
  onNewSession,
  onDeleteSession,
  onOpenSettings,
  loading = false,
}: SessionListProps) {
  const handleDeleteClick = (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onDeleteSession?.(sessionId);
  };

  return (
    <div className="session-list">
      <div className="session-list-header">
        <h2>Sessions</h2>
        <div className="session-list-header-actions">
          {onOpenSettings && (
            <button
              className="settings-button"
              onClick={onOpenSettings}
              disabled={loading}
              title="Settings"
            >
              <svg viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 4.754a3.246 3.246 0 1 0 0 6.492 3.246 3.246 0 0 0 0-6.492ZM5.754 8a2.246 2.246 0 1 1 4.492 0 2.246 2.246 0 0 1-4.492 0Z" />
                <path d="M9.796 1.343c-.527-1.79-3.065-1.79-3.592 0l-.094.319a.873.873 0 0 1-1.255.52l-.292-.16c-1.64-.892-3.433.902-2.54 2.541l.159.292a.873.873 0 0 1-.52 1.255l-.319.094c-1.79.527-1.79 3.065 0 3.592l.319.094a.873.873 0 0 1 .52 1.255l-.16.292c-.892 1.64.901 3.434 2.541 2.54l.292-.159a.873.873 0 0 1 1.255.52l.094.319c.527 1.79 3.065 1.79 3.592 0l.094-.319a.873.873 0 0 1 1.255-.52l.292.16c1.64.893 3.434-.902 2.54-2.541l-.159-.292a.873.873 0 0 1 .52-1.255l.319-.094c1.79-.527 1.79-3.065 0-3.592l-.319-.094a.873.873 0 0 1-.52-1.255l.16-.292c.893-1.64-.902-3.433-2.541-2.54l-.292.159a.873.873 0 0 1-1.255-.52l-.094-.319Zm-2.633.283c.246-.835 1.428-.835 1.674 0l.094.319a1.873 1.873 0 0 0 2.693 1.115l.291-.16c.764-.415 1.6.42 1.184 1.185l-.159.292a1.873 1.873 0 0 0 1.116 2.692l.318.094c.835.246.835 1.428 0 1.674l-.319.094a1.873 1.873 0 0 0-1.115 2.693l.16.291c.415.764-.42 1.6-1.185 1.184l-.291-.159a1.873 1.873 0 0 0-2.693 1.116l-.094.318c-.246.835-1.428.835-1.674 0l-.094-.319a1.873 1.873 0 0 0-2.692-1.115l-.292.16c-.764.415-1.6-.42-1.184-1.185l.159-.291A1.873 1.873 0 0 0 1.945 8.93l-.319-.094c-.835-.246-.835-1.428 0-1.674l.319-.094A1.873 1.873 0 0 0 3.06 4.377l-.16-.292c-.415-.764.42-1.6 1.185-1.184l.292.159a1.873 1.873 0 0 0 2.692-1.115l.094-.319Z" />
              </svg>
            </button>
          )}
          <button
            className="new-session-button"
            onClick={onNewSession}
            disabled={loading}
          >
            New
          </button>
        </div>
      </div>

      <div className="session-list-content">
        {loading && sessions.length === 0 && (
          <div className="session-list-loading">Loading...</div>
        )}

        {!loading && sessions.length === 0 && (
          <div className="session-list-empty">No sessions</div>
        )}

        {sessions.map((session) => (
          <div
            key={session.sessionId}
            className={`session-item ${selectedSessionId === session.sessionId ? 'selected' : ''}`}
            onClick={() => onSelectSession(session.sessionId)}
          >
            <div className="session-item-header">
              <div className="session-title">{session.title || 'Untitled'}</div>
              {onDeleteSession && (
                <button
                  className="session-delete-button"
                  onClick={(e) => handleDeleteClick(session.sessionId, e)}
                  title="Delete session"
                >
                  &times;
                </button>
              )}
            </div>
            <div className="session-repo">{session.repo}</div>
            <div className="session-branches">
              <span className="branch-label">base:</span> {session.baseBranch}
              <span className="branch-separator">/</span>
              <span className="branch-label">work:</span> {session.workBranch}
            </div>
            <div className={`session-state ${getStateClassName(session.state)}`}>
              {session.state}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
