import { useState, useCallback, useEffect } from 'react';
import type { Session, ClientConfig } from '@ccsandbox/shared';
import { SessionList } from './components/SessionList';
import { TerminalPane } from './components/TerminalPane';
import { NewSessionModal } from './components/NewSessionModal';
import { SettingsModal } from './components/SettingsModal';
import { useDeleteSession, useClientConfig } from './hooks/useApi';
import { useSessionSync } from './hooks/useSessionSync';
import './App.css';

type MobileView = 'sessions' | 'terminal';

export function App() {
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [isNewSessionModalOpen, setIsNewSessionModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [deleteConfirmSessionId, setDeleteConfirmSessionId] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<MobileView>('sessions');
  const [clientConfig, setClientConfig] = useState<ClientConfig | null>(null);

  const { sessions, loading, error } = useSessionSync();
  const { deleteSession, loading: deleteLoading } = useDeleteSession();
  const { execute: fetchConfig } = useClientConfig();

  // Fetch config on mount and check if PAT is required
  useEffect(() => {
    fetchConfig().then((config) => {
      if (config) {
        setClientConfig(config);
        // Auto-open settings modal if PAT is not configured
        if (!config.hasPat) {
          setIsSettingsModalOpen(true);
        }
      }
    });
  }, [fetchConfig]);

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

  const handleOpenSettings = useCallback(() => {
    setIsSettingsModalOpen(true);
  }, []);

  const handleCloseSettingsModal = useCallback(() => {
    setIsSettingsModalOpen(false);
  }, []);

  const handleConfigUpdated = useCallback((config: ClientConfig) => {
    setClientConfig(config);
  }, []);

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
      // Session list will be updated via WebSocket sync
    }
    setDeleteConfirmSessionId(null);
  }, [deleteConfirmSessionId, deleteSession, selectedSessionId]);

  const handleCancelDelete = useCallback(() => {
    setDeleteConfirmSessionId(null);
  }, []);

  const selectedSession: Session | null =
    sessions?.find((s) => s.sessionId === selectedSessionId) ?? null;

  const sessionToDelete = deleteConfirmSessionId
    ? sessions?.find((s) => s.sessionId === deleteConfirmSessionId)
    : null;

  // Determine if PAT is required (not yet configured)
  const requirePat = clientConfig !== null && !clientConfig.hasPat;

  return (
    <div className="app">
      {error && (
        <div className="error-banner">
          <span className="error-message">{error}</span>
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
          onOpenSettings={handleOpenSettings}
          loading={loading}
        />
      </div>
      <div className={`app-main ${mobileView !== 'terminal' ? 'hidden' : ''}`}>
        <TerminalPane
          session={selectedSession}
        />
      </div>

      <NewSessionModal
        isOpen={isNewSessionModalOpen}
        onClose={handleCloseNewSessionModal}
      />

      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={handleCloseSettingsModal}
        initialConfig={clientConfig}
        onConfigUpdated={handleConfigUpdated}
        requirePat={requirePat}
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
