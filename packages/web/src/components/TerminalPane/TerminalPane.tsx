import { useState, useCallback, useEffect } from 'react';
import type { Session, TerminalTab } from '@ccsandbox/shared';
import { Terminal } from '../Terminal';
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

  const handleAddTab = useCallback(() => {
    addTab();
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
                className={`terminal-tab ${activeTabId === tab.tabId ? 'active' : ''}`}
                onClick={() => setActiveTabId(tab.tabId)}
              >
                {tab.isEditing ? (
                  <input
                    type="text"
                    className="terminal-tab-input"
                    value={editingTitle}
                    onChange={(e) => setEditingTitle(e.target.value)}
                    onBlur={() => handleFinishEdit(tab.tabId)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleFinishEdit(tab.tabId);
                      } else if (e.key === 'Escape') {
                        handleCancelEdit();
                      }
                    }}
                    autoFocus
                    onClick={(e) => e.stopPropagation()}
                  />
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
          <button
            className="terminal-add-tab"
            onClick={handleAddTab}
            disabled={!isConnected}
          >
            +
          </button>
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
          tabs.map((tab) => (
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
          ))
        )}
      </div>
    </div>
  );
}
