import { useState, useEffect, useCallback } from 'react';
import type { Session } from '@ccsandbox/shared';
import { SessionList } from './components/SessionList';
import { TerminalPane } from './components/TerminalPane';
import { NewSessionModal } from './components/NewSessionModal';
import { useSessions, useDeleteSession } from './hooks/useApi';
import './App.css';

type MobileView = 'sessions' | 'terminal';

export function App() {
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [isNewSessionModalOpen, setIsNewSessionModalOpen] = useState(false);
  const [deleteConfirmSessionId, setDeleteConfirmSessionId] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<MobileView>('sessions');

  const { data: sessions, loading, error, execute: fetchSessions } = useSessions();
  const { deleteSession, loading: deleteLoading } = useDeleteSession();

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const handleSelectSession = useCallback((sessionId: string) => {
    setSelectedSessionId(sessionId);
    // Switch to terminal view on mobile when selecting a session
    setMobileView('terminal');
  }, []);

  const handleNewSession = useCallback(() => {
    setIsNewSessionModalOpen(true);
  }, []);

  const handleCloseNewSessionModal = useCallback(() => {
    setIsNewSessionModalOpen(false);
  }, []);

  const handleSessionCreated = useCallback(() => {
    fetchSessions();
  }, [fetchSessions]);

  const handleDeleteSession = useCallback((sessionId: string) => {
    setDeleteConfirmSessionId(sessionId);
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteConfirmSessionId) return;

    const success = await deleteSession(deleteConfirmSessionId);
    if (success) {
      if (selectedSessionId === deleteConfirmSessionId) {
        setSelectedSessionId(null);
      }
      fetchSessions();
    }
    setDeleteConfirmSessionId(null);
  }, [deleteConfirmSessionId, deleteSession, selectedSessionId, fetchSessions]);

  const handleCancelDelete = useCallback(() => {
    setDeleteConfirmSessionId(null);
  }, []);

  const handleSessionUpdate = useCallback(() => {
    fetchSessions();
  }, [fetchSessions]);

  const selectedSession: Session | null =
    sessions?.find((s) => s.sessionId === selectedSessionId) ?? null;

  const sessionToDelete = deleteConfirmSessionId
    ? sessions?.find((s) => s.sessionId === deleteConfirmSessionId)
    : null;

  return (
    <div className="app">
      {error && (
        <div className="error-banner">
          <span className="error-message">{error}</span>
          <button className="error-retry-button" onClick={fetchSessions}>
            Retry
          </button>
        </div>
      )}
      {/* Mobile navigation */}
      <nav className="mobile-nav">
        <button
          className={`mobile-nav-button ${mobileView === 'sessions' ? 'active' : ''}`}
          onClick={() => setMobileView('sessions')}
        >
          Sessions
        </button>
        <button
          className={`mobile-nav-button ${mobileView === 'terminal' ? 'active' : ''}`}
          onClick={() => setMobileView('terminal')}
        >
          Terminal
        </button>
      </nav>
      <div className={`app-sidebar ${mobileView !== 'sessions' ? 'hidden' : ''}`}>
        <SessionList
          sessions={sessions ?? []}
          selectedSessionId={selectedSessionId}
          onSelectSession={handleSelectSession}
          onNewSession={handleNewSession}
          onDeleteSession={handleDeleteSession}
          loading={loading}
        />
      </div>
      <div className={`app-main ${mobileView !== 'terminal' ? 'hidden' : ''}`}>
        <TerminalPane
          session={selectedSession}
          onSessionUpdate={handleSessionUpdate}
        />
      </div>

      <NewSessionModal
        isOpen={isNewSessionModalOpen}
        onClose={handleCloseNewSessionModal}
        onSessionCreated={handleSessionCreated}
      />

      {deleteConfirmSessionId && (
        <div className="modal-backdrop" onClick={handleCancelDelete}>
          <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-dialog-header">
              <h3>Delete Session</h3>
            </div>
            <div className="confirm-dialog-body">
              <p>
                Are you sure you want to delete this session?
              </p>
              {sessionToDelete && (
                <div className="confirm-dialog-session-info">
                  <strong>{sessionToDelete.title || 'Untitled'}</strong>
                  <span>{sessionToDelete.repo}</span>
                </div>
              )}
              <p className="confirm-dialog-warning">
                This action cannot be undone.
              </p>
            </div>
            <div className="confirm-dialog-actions">
              <button
                className="button button-secondary"
                onClick={handleCancelDelete}
                disabled={deleteLoading}
              >
                Cancel
              </button>
              <button
                className="button button-danger"
                onClick={handleConfirmDelete}
                disabled={deleteLoading}
              >
                {deleteLoading ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
