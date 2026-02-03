import { useState, useCallback, useEffect } from 'react';
import type { Session, TerminalTab, PermissionMode, PortForwarding } from '@shared/index.js';
import { Terminal } from '../Terminal';
import { ClaudeChat } from '../ClaudeChat';
import { DiffView } from '../DiffView';
import { useTerminalWebSocket } from '../../hooks';
import { useDiffStats, usePortForwarding } from '../../hooks/useApi';

interface TerminalPaneProps {
  session: Session | null;
  defaultPermissionMode?: PermissionMode;
  speechRecognitionLanguage?: string;
}

interface LocalTab extends TerminalTab {
  isEditing?: boolean;
}

export function TerminalPane({ session, defaultPermissionMode, speechRecognitionLanguage }: TerminalPaneProps) {
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [showDiffView, setShowDiffView] = useState(false);
  const [showPortList, setShowPortList] = useState(false);

  const sessionId = session?.state === 'RUNNING' ? session.sessionId : null;
  const { data: diffStats, execute: fetchDiffStats } = useDiffStats(session?.sessionId ?? null);
  const { ports, listPorts } = usePortForwarding(session?.sessionId ?? null);

  // Fetch diff stats periodically when session is running
  useEffect(() => {
    if (!session?.sessionId || session.state !== 'RUNNING') return;

    fetchDiffStats();
    const interval = setInterval(fetchDiffStats, 10000); // Poll every 10 seconds
    return () => clearInterval(interval);
  }, [session?.sessionId, session?.state, fetchDiffStats]);

  // Fetch port list periodically when session is running
  useEffect(() => {
    if (!session?.sessionId || session.state !== 'RUNNING') return;

    listPorts();
    const interval = setInterval(listPorts, 10000); // Poll every 10 seconds
    return () => clearInterval(interval);
  }, [session?.sessionId, session?.state, listPorts]);
  const {
    isConnected,
    connectionState,
    reconnectAttempt,
    justReconnected,
    tabs: remoteTabs,
    addTab,
    closeTab,
    renameTab,
    attachToTab,
    sendInput,
    resizeTerminal,
    onOutput,
    onHistory,
    onExit,
    onResizeSync,
    onOwnTabAdded,
    // Claude-specific
    sendClaudeMessage,
    respondToPermission,
    changePermissionMode,
    interruptClaude,
    clearClaude,
    onClaudeEvent,
    onClaudeHistory,
    onClaudePermissionResolved,
    onClaudeUserMessage,
    onClaudeTodosUpdated,
    onPermissionModeChanged,
    onPlanFilePathChanged,
    onClaudeCleared,
  } = useTerminalWebSocket(sessionId);

  // Convert remote tabs to local tabs with editing state
  const tabs: LocalTab[] = remoteTabs.map((t) => ({
    ...t,
    isEditing: t.tabId === editingTabId,
  }));

  // Set active tab when tabs change
  useEffect(() => {
    if (tabs.length > 0 && !activeTabId) {
      const firstTab = tabs[0];
      if (firstTab) {
        setActiveTabId(firstTab.tabId);
      }
    } else if (tabs.length > 0 && activeTabId && !tabs.find((t) => t.tabId === activeTabId)) {
      // Active tab was removed, select first tab
      const firstTab = tabs[0];
      if (firstTab) {
        setActiveTabId(firstTab.tabId);
      }
    } else if (tabs.length === 0) {
      setActiveTabId(null);
    }
  }, [tabs, activeTabId]);

  // Attach to active tab when it changes
  useEffect(() => {
    if (activeTabId && isConnected) {
      attachToTab(activeTabId);
    }
  }, [activeTabId, isConnected, attachToTab]);

  // Switch to newly added tab when this client created it
  useEffect(() => {
    return onOwnTabAdded((tab) => {
      setActiveTabId(tab.tabId);
    });
  }, [onOwnTabAdded]);

  const handleAddTerminalTab = useCallback(() => {
    addTab(undefined, 'shell');
  }, [addTab]);

  const handleAddClaudeTab = useCallback(() => {
    addTab(undefined, 'claude');
  }, [addTab]);

  const handleOpenLoginShell = useCallback(() => {
    addTab('Login', 'shell', 'claude /login');
  }, [addTab]);

  const handleCloseTab = useCallback(
    (tabId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      closeTab(tabId);
    },
    [closeTab]
  );

  const handleStartEdit = useCallback(
    (tab: LocalTab, e: React.MouseEvent) => {
      e.stopPropagation();
      setEditingTabId(tab.tabId);
      setEditingTitle(tab.title);
    },
    []
  );

  const handleFinishEdit = useCallback(
    (tabId: string) => {
      if (editingTitle.trim()) {
        renameTab(tabId, editingTitle.trim());
      }
      setEditingTabId(null);
    },
    [editingTitle, renameTab]
  );

  const handleCancelEdit = useCallback(() => {
    setEditingTabId(null);
  }, []);

  if (!session) {
    return (
      <div className="flex flex-col h-full bg-vscode-bg justify-center items-center">
        <div className="text-vscode-text-muted text-base max-md:text-sm max-md:p-5 max-md:text-center">
          Select a session or create a new one
        </div>
      </div>
    );
  }

  const isRunning = session.state === 'RUNNING';

  return (
    <div className="flex flex-col h-full bg-vscode-bg">
      <div className="flex justify-between items-end p-0 bg-vscode-bg-secondary min-h-[35px] max-md:flex-wrap max-md:gap-1">
        <div className="flex items-end flex-1 min-w-0 overflow-hidden pl-2 max-md:w-full max-md:pl-1">
          <div className="flex items-end gap-0 overflow-x-auto flex-1 min-w-0 scrollbar-none">
            {tabs.map((tab) => (
              <div
                key={tab.tabId}
                className={`flex items-center gap-1.5 py-1.5 px-3 bg-transparent border border-transparent border-b-0 cursor-pointer text-xs text-vscode-text-secondary min-w-[80px] max-w-[160px] shrink-0 relative hover:text-[#ccc] max-md:py-[5px] max-md:px-2 max-md:min-w-[60px] max-md:max-w-[120px] max-md:text-[11px] ${activeTabId === tab.tabId ? 'bg-vscode-bg text-white border-vscode-border-light rounded-t -mb-px pb-[7px]' : ''}`}
                onClick={() => setActiveTabId(tab.tabId)}
              >
                {tab.tabType === 'claude' ? (
                  <span className="text-[10px] text-[#E57B3A] shrink-0">◈</span>
                ) : (
                  <span className="text-[10px] text-[#9cdcfe] shrink-0">$</span>
                )}
                {tab.isEditing ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleFinishEdit(tab.tabId);
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="text"
                      className="flex-1 bg-transparent border border-vscode-accent text-white text-xs py-0.5 px-1 rounded-sm outline-none min-w-[50px]"
                      value={editingTitle}
                      onChange={(e) => setEditingTitle(e.target.value)}
                      onBlur={() => handleFinishEdit(tab.tabId)}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                          handleCancelEdit();
                        }
                      }}
                      autoFocus
                    />
                  </form>
                ) : (
                  <span
                    className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap"
                    onDoubleClick={(e) => handleStartEdit(tab, e)}
                  >
                    {tab.title}
                    {tab.ready === false && <span className="text-vscode-text-muted ml-0.5 animate-loading-pulse">...</span>}
                  </span>
                )}
                <button
                  className={`bg-transparent border-none text-vscode-text-secondary text-sm cursor-pointer p-0 leading-none w-4 h-4 flex items-center justify-center rounded-sm hover:bg-white/10 hover:text-white ${activeTabId === tab.tabId ? '' : 'max-[480px]:hidden'}`}
                  onClick={(e) => handleCloseTab(tab.tabId, e)}
                >
                  &times;
                </button>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-1 ml-2 mr-2 shrink-0 max-md:ml-1 max-md:mr-1 max-md:gap-0.5">
            <button
              className="bg-transparent border border-transparent text-[#9cdcfe] text-xs cursor-pointer py-1 px-2 rounded leading-none whitespace-nowrap hover:bg-white/10 hover:text-[#4fc3f7] disabled:opacity-40 disabled:cursor-not-allowed max-md:px-1.5 max-md:text-[11px]"
              onClick={handleAddTerminalTab}
              disabled={!isConnected}
              title="Add Terminal"
            >
              <span className="max-md:hidden">+ Terminal</span>
              <span className="hidden max-md:inline">+$</span>
            </button>
            <button
              className="bg-transparent border border-transparent text-[#E57B3A] text-xs cursor-pointer py-1 px-2 rounded leading-none whitespace-nowrap hover:bg-white/10 hover:text-[#FF8C42] disabled:opacity-40 disabled:cursor-not-allowed max-md:px-1.5 max-md:text-[11px]"
              onClick={handleAddClaudeTab}
              disabled={!isConnected}
              title="Add Claude"
            >
              <span className="max-md:hidden">+ Claude</span>
              <span className="hidden max-md:inline">+◈</span>
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden relative bg-vscode-bg border-t border-vscode-border-light">
        {/* Reconnection banner */}
        {connectionState === 'reconnecting' && (
          <div className="absolute top-0 left-0 right-0 z-20 bg-yellow-900/90 text-yellow-100 text-xs px-3 py-1.5 flex items-center justify-center gap-2 border-b border-yellow-700/50">
            <span className="inline-block w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />
            Reconnecting... (attempt {reconnectAttempt})
          </div>
        )}

        {/* Just reconnected banner */}
        {justReconnected && (
          <div className="absolute top-0 left-0 right-0 z-20 bg-green-900/90 text-green-100 text-xs px-3 py-1.5 flex items-center justify-center gap-2 border-b border-green-700/50">
            <span className="inline-block w-2 h-2 bg-green-400 rounded-full" />
            Connection restored
          </div>
        )}

        {!isRunning ? (
          <div className="text-vscode-text-muted text-[13px] flex items-center justify-center h-full">
            Container is not running. Start the container to use the terminal.
          </div>
        ) : tabs.length === 0 ? (
          <div className="text-vscode-text-muted text-[13px] flex items-center justify-center h-full">
            {isConnected ? (
              <>No terminal tabs. Click + to add one.</>
            ) : (
              <>Connecting...</>
            )}
          </div>
        ) : (
          tabs.map((tab) =>
            tab.tabType === 'claude' ? (
              <ClaudeChat
                key={tab.tabId}
                tabId={tab.tabId}
                sessionId={session!.sessionId}
                isActive={tab.tabId === activeTabId}
                isConnected={isConnected}
                defaultPermissionMode={defaultPermissionMode}
                speechRecognitionLanguage={speechRecognitionLanguage}
                sendClaudeMessage={sendClaudeMessage}
                respondToPermission={respondToPermission}
                changePermissionMode={changePermissionMode}
                interruptClaude={interruptClaude}
                clearClaude={clearClaude}
                onClaudeEvent={onClaudeEvent}
                onClaudeHistory={onClaudeHistory}
                onClaudePermissionResolved={onClaudePermissionResolved}
                onClaudeUserMessage={onClaudeUserMessage}
                onClaudeTodosUpdated={onClaudeTodosUpdated}
                onPermissionModeChanged={onPermissionModeChanged}
                onPlanFilePathChanged={onPlanFilePathChanged}
                onClaudeCleared={onClaudeCleared}
                onOpenLoginShell={handleOpenLoginShell}
              />
            ) : (
              <Terminal
                key={tab.tabId}
                tabId={tab.tabId}
                isActive={tab.tabId === activeTabId}
                initialExited={tab.exited}
                sendInput={sendInput}
                resizeTerminal={resizeTerminal}
                onOutput={onOutput}
                onHistory={onHistory}
                onExit={onExit}
                onResizeSync={onResizeSync}
                closeTab={closeTab}
              />
            )
          )
        )}

        {/* Floating diff badge - always at top-right */}
        {isRunning && diffStats && (diffStats.insertions > 0 || diffStats.deletions > 0) && (
          <button
            className="absolute top-4 right-4 bg-vscode-bg-secondary border border-vscode-border px-3 py-1.5 rounded-md text-sm cursor-pointer hover:bg-[#3c3c3c] z-10 transition-all"
            onClick={() => setShowDiffView(true)}
            title="View diff"
          >
            <span className="text-green-400">+{diffStats.insertions}</span>
            <span className="mx-1 text-vscode-text-muted">/</span>
            <span className="text-red-400">-{diffStats.deletions}</span>
          </button>
        )}

        {/* Floating port forwarding badge - always at top-right, below diff badge if present */}
        {isRunning && ports.length > 0 && (() => {
          const hasDiffBadge = diffStats && (diffStats.insertions > 0 || diffStats.deletions > 0);
          return (
            <div className={`absolute ${hasDiffBadge ? 'top-14' : 'top-4'} right-4 z-10`}>
              <button
                className="bg-vscode-bg-secondary border border-vscode-border px-3 py-1.5 rounded-md text-sm cursor-pointer hover:bg-[#3c3c3c] transition-all flex items-center gap-2"
                onClick={() => setShowPortList(!showPortList)}
                title="Port forwarding"
              >
                <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4 text-blue-400">
                  <path d="M4 8a.5.5 0 0 1 .5-.5h5.793L8.146 5.354a.5.5 0 1 1 .708-.708l3 3a.5.5 0 0 1 0 .708l-3 3a.5.5 0 0 1-.708-.708L10.293 8.5H4.5A.5.5 0 0 1 4 8z" />
                </svg>
                <span className="text-blue-400">{ports.length} port{ports.length !== 1 ? 's' : ''}</span>
              </button>

              {/* Floating port list window */}
              {showPortList && (
                <PortListWindow ports={ports} onClose={() => setShowPortList(false)} />
              )}
            </div>
          );
        })()}
      </div>

      {/* Diff View Modal */}
      {showDiffView && session && (
        <DiffView sessionId={session.sessionId} onClose={() => setShowDiffView(false)} />
      )}
    </div>
  );
}

interface PortListWindowProps {
  ports: PortForwarding[];
  onClose: () => void;
}

function PortListWindow({ ports, onClose }: PortListWindowProps) {
  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-port-list-window]')) {
        onClose();
      }
    };
    // Use setTimeout to avoid immediate close from the toggle button click
    const timer = setTimeout(() => {
      document.addEventListener('click', handleClickOutside);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('click', handleClickOutside);
    };
  }, [onClose]);

  // Close on ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      data-port-list-window
      className="absolute top-full right-0 mt-2 bg-vscode-bg-secondary border border-vscode-border rounded-lg shadow-xl shadow-black/40 min-w-[240px] max-w-[320px] overflow-hidden"
      style={{ animation: 'modal-in 0.15s ease-out' }}
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-vscode-border">
        <span className="text-sm font-medium text-white">Port Forwarding</span>
        <button
          className="text-vscode-text-muted hover:text-white text-lg leading-none p-0.5 hover:bg-white/10 rounded"
          onClick={onClose}
          aria-label="Close"
        >
          &times;
        </button>
      </div>
      <div className="py-1">
        {ports.map((port) => (
          <div
            key={port.id}
            className="flex items-center gap-2 px-3 py-2 hover:bg-white/5"
          >
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <span className="text-white font-mono text-sm">{port.hostPort}</span>
              <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3 text-vscode-text-muted shrink-0">
                <path d="M4 8a.5.5 0 0 1 .5-.5h5.793L8.146 5.354a.5.5 0 1 1 .708-.708l3 3a.5.5 0 0 1 0 .708l-3 3a.5.5 0 0 1-.708-.708L10.293 8.5H4.5A.5.5 0 0 1 4 8z" />
              </svg>
              <span className="text-white font-mono text-sm">{port.containerPort}</span>
            </div>
            {port.label && (
              <span className="text-vscode-text-secondary text-xs px-1.5 py-0.5 bg-vscode-border rounded truncate max-w-[80px]">
                {port.label}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
