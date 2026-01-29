import { useState, useCallback, useEffect } from 'react';
import type { Session, TerminalTab } from '@ccsandbox/shared';
import { Terminal } from '../Terminal';
import { useContainerAction } from '../../hooks';
import './TerminalPane.css';

interface TerminalPaneProps {
  session: Session | null;
  onSessionUpdate?: () => void;
}

interface LocalTab extends TerminalTab {
  isEditing?: boolean;
}

function generateTabId(): string {
  // Use crypto.randomUUID if available (HTTPS), otherwise generate UUID v4 manually
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback UUID v4 generation for HTTP environments
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function TerminalPane({ session, onSessionUpdate }: TerminalPaneProps) {
  const [tabs, setTabs] = useState<LocalTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');

  const { execute: executeContainerAction, loading: containerActionLoading } = useContainerAction();

  // Reset tabs when session changes
  useEffect(() => {
    if (session) {
      const initialTabs: LocalTab[] = session.tabs?.length
        ? session.tabs.map((t) => ({ ...t }))
        : [{ tabId: generateTabId(), title: 'Terminal 1', shell: 'bash' }];
      setTabs(initialTabs);
      setActiveTabId(initialTabs[0]?.tabId ?? null);
    } else {
      setTabs([]);
      setActiveTabId(null);
    }
  }, [session?.sessionId]);

  const handleAddTab = useCallback(() => {
    const newTab: LocalTab = {
      tabId: generateTabId(),
      title: `Terminal ${tabs.length + 1}`,
      shell: 'bash',
    };
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(newTab.tabId);
  }, [tabs.length]);

  const handleCloseTab = useCallback(
    (tabId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      setTabs((prev) => {
        const newTabs = prev.filter((t) => t.tabId !== tabId);
        if (activeTabId === tabId && newTabs.length > 0) {
          const firstTab = newTabs[0];
          if (firstTab) {
            setActiveTabId(firstTab.tabId);
          }
        } else if (newTabs.length === 0) {
          setActiveTabId(null);
        }
        return newTabs;
      });
    },
    [activeTabId]
  );

  const handleStartEdit = useCallback(
    (tab: LocalTab, e: React.MouseEvent) => {
      e.stopPropagation();
      setTabs((prev) =>
        prev.map((t) => ({
          ...t,
          isEditing: t.tabId === tab.tabId,
        }))
      );
      setEditingTitle(tab.title);
    },
    []
  );

  const handleFinishEdit = useCallback((tabId: string) => {
    setTabs((prev) =>
      prev.map((t) =>
        t.tabId === tabId
          ? { ...t, title: editingTitle || t.title, isEditing: false }
          : t
      )
    );
  }, [editingTitle]);

  const handleContainerAction = useCallback(
    async (action: 'start' | 'stop' | 'remove') => {
      if (!session) return;
      const success = await executeContainerAction(session.sessionId, action);
      if (success && onSessionUpdate) {
        onSessionUpdate();
      }
    },
    [session, executeContainerAction, onSessionUpdate]
  );

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
                        setTabs((prev) =>
                          prev.map((t) =>
                            t.tabId === tab.tabId ? { ...t, isEditing: false } : t
                          )
                        );
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
          <button className="terminal-add-tab" onClick={handleAddTab}>
            +
          </button>
        </div>

        <div className="terminal-actions">
          {isRunning ? (
            <button
              className="terminal-action-button stop"
              onClick={() => handleContainerAction('stop')}
              disabled={containerActionLoading}
              title="Stop container"
            >
              Stop
            </button>
          ) : (
            <button
              className="terminal-action-button start"
              onClick={() => handleContainerAction('start')}
              disabled={containerActionLoading || session.state === 'ERROR'}
              title="Start container"
            >
              Start
            </button>
          )}
          <button
            className="terminal-action-button remove"
            onClick={() => handleContainerAction('remove')}
            disabled={containerActionLoading}
            title="Remove container"
          >
            Remove
          </button>
        </div>
      </div>

      <div className="terminal-container">
        {tabs.length === 0 ? (
          <div className="terminal-placeholder">
            No terminal tabs. Click + to add one.
          </div>
        ) : !isRunning ? (
          <div className="terminal-placeholder">
            Container is not running. Start the container to use the terminal.
          </div>
        ) : (
          tabs.map((tab) => (
            <Terminal
              key={tab.tabId}
              sessionId={session.sessionId}
              tabId={tab.tabId}
              isActive={tab.tabId === activeTabId}
            />
          ))
        )}
      </div>
    </div>
  );
}
