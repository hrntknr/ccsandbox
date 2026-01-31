import { useState, useCallback, useEffect } from 'react';
import type { Session, TerminalTab } from '@ccsandbox/shared';
import { Terminal } from '../Terminal';
import { ClaudeChat } from '../ClaudeChat';
import { useTerminalWebSocket } from '../../hooks';

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
                  className="bg-transparent border-none text-vscode-text-secondary text-sm cursor-pointer p-0 leading-none w-4 h-4 flex items-center justify-center rounded-sm hover:bg-white/10 hover:text-white max-[480px]:hidden max-[480px]:[.terminal-tab.active_&]:flex"
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
