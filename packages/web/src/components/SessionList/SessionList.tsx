import type { Session } from '@ccsandbox/shared';
import './SessionList.css';

interface SessionListProps {
  sessions: Session[];
  selectedSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
  onNewSession: () => void;
  onDeleteSession?: (sessionId: string) => void;
  loading?: boolean;
}

function getStateClassName(state: Session['state']): string {
  switch (state) {
    case 'RUNNING':
      return 'state-running';
    case 'READY':
      return 'state-ready';
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
        <button
          className="new-session-button"
          onClick={onNewSession}
          disabled={loading}
        >
          New
        </button>
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
