import { useState, useCallback, useEffect, useRef } from 'react';
import type { Session, ClientConfig } from '@shared/index.js';
import { SessionList } from './components/SessionList';
import { TerminalPane } from './components/TerminalPane';
import { NewSessionModal } from './components/NewSessionModal';
import { SettingsModal } from './components/SettingsModal';
import { useDeleteSession, useStartSession, useStopSession, useClientConfig } from './hooks/useApi';
import { useSessionSync } from './hooks/useSessionSync';

type MobileView = 'sessions' | 'terminal';

const SIDEBAR_WIDTH_KEY = 'ccsandbox-sidebar-width';
const DEFAULT_SIDEBAR_WIDTH = 280;
const MIN_SIDEBAR_WIDTH = 180;
const MAX_SIDEBAR_WIDTH = 500;

export function App() {
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [isNewSessionModalOpen, setIsNewSessionModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [deleteConfirmSessionId, setDeleteConfirmSessionId] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<MobileView>('sessions');
  const [clientConfig, setClientConfig] = useState<ClientConfig | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return saved ? Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, parseInt(saved, 10))) : DEFAULT_SIDEBAR_WIDTH;
  });
  const [isResizing, setIsResizing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const { sessions, loading, error } = useSessionSync();
  const { deleteSession, loading: deleteLoading } = useDeleteSession();
  const { startSession } = useStartSession();
  const { stopSession } = useStopSession();
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

  // Handle sidebar resize
  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const containerRect = containerRef.current.getBoundingClientRect();
      const newWidth = e.clientX - containerRect.left;
      const clampedWidth = Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, newWidth));
      setSidebarWidth(clampedWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString());
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, sidebarWidth]);

  const handleResizeStart = useCallback(() => {
    setIsResizing(true);
  }, []);

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

  const handleStartSession = useCallback(async (sessionId: string) => {
    await startSession(sessionId);
    // Session state will be updated via WebSocket sync
  }, [startSession]);

  const handleStopSession = useCallback(async (sessionId: string) => {
    await stopSession(sessionId);
    // Session state will be updated via WebSocket sync
  }, [stopSession]);

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
    <div ref={containerRef} className={`flex h-full w-full max-md:flex-col ${isResizing ? 'select-none' : ''}`}>
      {error && (
        <div className="fixed top-0 left-0 right-0 bg-red-700 text-white py-3 px-4 flex items-center justify-center gap-4 z-[1000] max-md:flex-col max-md:gap-2 max-md:py-2.5">
          <span className="text-sm">{error}</span>
        </div>
      )}
      {/* Mobile navigation */}
      <nav className="hidden max-md:flex bg-vscode-bg-secondary border-b border-vscode-border">
        <button
          className={`flex-1 py-3 px-4 bg-transparent border-none text-vscode-text-secondary text-sm cursor-pointer border-b-2 border-transparent hover:text-[#aaa] ${mobileView === 'sessions' ? 'text-white border-b-vscode-accent' : ''}`}
          onClick={() => setMobileView('sessions')}
        >
          Sessions
        </button>
        <button
          className={`flex-1 py-3 px-4 bg-transparent border-none text-vscode-text-secondary text-sm cursor-pointer border-b-2 border-transparent hover:text-[#aaa] ${mobileView === 'terminal' ? 'text-white border-b-vscode-accent' : ''}`}
          onClick={() => setMobileView('terminal')}
        >
          Terminal
        </button>
      </nav>
      <div
        style={{ width: sidebarWidth }}
        className={`h-full shrink-0 max-md:!w-full max-md:h-auto max-md:flex-1 max-md:min-h-0 ${mobileView !== 'sessions' ? 'max-md:hidden' : ''}`}
      >
        <SessionList
          sessions={sessions ?? []}
          selectedSessionId={selectedSessionId}
          onSelectSession={handleSelectSession}
          onNewSession={handleNewSession}
          onDeleteSession={handleDeleteSession}
          onStartSession={handleStartSession}
          onStopSession={handleStopSession}
          onOpenSettings={handleOpenSettings}
          loading={loading}
        />
      </div>
      {/* Resize handle */}
      <div
        className="w-1 h-full bg-vscode-border hover:bg-vscode-accent cursor-col-resize shrink-0 max-md:hidden transition-colors"
        onMouseDown={handleResizeStart}
      />
      <div className={`flex-1 h-full min-w-0 max-md:min-h-0 ${mobileView !== 'terminal' ? 'max-md:hidden' : ''}`}>
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
        <div className="fixed inset-0 bg-black/60 flex justify-center items-center z-[1000]" onClick={handleCancelDelete}>
          <div className="bg-vscode-bg-secondary rounded-lg w-[400px] max-w-[90%] shadow-[0_4px_20px_rgba(0,0,0,0.4)] max-md:w-[95%] max-md:max-w-none max-md:mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="py-4 px-5 border-b border-vscode-border">
              <h3 className="m-0 text-base font-semibold text-white">Delete Session</h3>
            </div>
            <div className="p-5">
              <p className="m-0 mb-3 text-vscode-text text-sm">
                Are you sure you want to delete this session?
              </p>
              {sessionToDelete && (
                <div className="bg-vscode-bg p-3 rounded mb-3">
                  <strong className="block text-white mb-1">{sessionToDelete.title || 'Untitled'}</strong>
                  <span className="text-vscode-text-secondary text-xs">{sessionToDelete.repo}</span>
                </div>
              )}
              <p className="m-0 text-[#ff6b6b] text-[13px]">
                This action cannot be undone.
              </p>
            </div>
            <div className="flex justify-end gap-3 py-4 px-5 border-t border-vscode-border max-md:flex-col-reverse">
              <button
                className="py-2.5 px-5 rounded font-medium text-sm cursor-pointer border-none bg-vscode-border-light text-vscode-text hover:bg-[#4a4a4a] disabled:opacity-50 disabled:cursor-not-allowed max-md:w-full"
                onClick={handleCancelDelete}
                disabled={deleteLoading}
              >
                Cancel
              </button>
              <button
                className="py-2.5 px-5 rounded font-medium text-sm cursor-pointer border-none bg-vscode-error text-white hover:bg-[#d85858] disabled:opacity-50 disabled:cursor-not-allowed max-md:w-full"
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
