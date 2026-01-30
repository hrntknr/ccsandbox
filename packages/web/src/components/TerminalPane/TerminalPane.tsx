import { useState, useCallback, useEffect } from 'react';
import type { Session, TerminalTab } from '@ccsandbox/shared';
import { Terminal } from '../Terminal';
import { ClaudeChat } from '../ClaudeChat';
import { useTerminalWebSocket } from '../../hooks';
import './TerminalPane.css';

interface TerminalPaneProps {
  session: Session | null;
}

interface LocalTab extends TerminalTab {
  isEditing?: boolean;
}

export function TerminalPane({ session }: TerminalPaneProps) {
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [editingTabId, setEditingTabId] = useState<string | null>(null);

  const sessionId = session?.state === 'RUNNING' ? session.sessionId : null;
  const {
    isConnected,
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
    onClaudeEvent,
    onClaudeHistory,
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
      <div className="terminal-pane terminal-pane-empty">
        <div className="terminal-pane-placeholder">
          Select a session or create a new one
        </div>
      </div>
    );
  }

  const isRunning = session.state === 'RUNNING';

  return (
    <div className="terminal-pane">
      <div className="terminal-pane-header">
        <div className="terminal-tabs-bar">
          <div className="terminal-tabs">
            {tabs.map((tab) => (
              <div
                key={tab.tabId}
                className={`terminal-tab ${activeTabId === tab.tabId ? 'active' : ''} ${tab.tabType === 'claude' ? 'terminal-tab-claude' : ''}`}
                onClick={() => setActiveTabId(tab.tabId)}
              >
                {tab.tabType === 'claude' && (
                  <span className="terminal-tab-icon">&#9672;</span>
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
                      className="terminal-tab-input"
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
                    className="terminal-tab-title"
                    onDoubleClick={(e) => handleStartEdit(tab, e)}
                  >
                    {tab.title}
                    {tab.ready === false && <span className="terminal-tab-loading">...</span>}
                  </span>
                )}
                <button
                  className="terminal-tab-close"
                  onClick={(e) => handleCloseTab(tab.tabId, e)}
                >
                  &times;
                </button>
              </div>
            ))}
          </div>
          <div className="terminal-add-tabs">
            <button
              className="terminal-add-tab"
              onClick={handleAddTerminalTab}
              disabled={!isConnected}
              title="Add Terminal"
            >
              + Terminal
            </button>
            <button
              className="terminal-add-tab terminal-add-tab-claude"
              onClick={handleAddClaudeTab}
              disabled={!isConnected}
              title="Add Claude"
            >
              + Claude
            </button>
          </div>
        </div>
      </div>

      <div className="terminal-container">
        {!isRunning ? (
          <div className="terminal-placeholder">
            Container is not running. Start the container to use the terminal.
          </div>
        ) : tabs.length === 0 ? (
          <div className="terminal-placeholder">
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
                isActive={tab.tabId === activeTabId}
                sendClaudeMessage={sendClaudeMessage}
                respondToPermission={respondToPermission}
                onClaudeEvent={onClaudeEvent}
                onClaudeHistory={onClaudeHistory}
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
      </div>
    </div>
  );
}
