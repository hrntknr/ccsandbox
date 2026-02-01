import { useState, useEffect, useCallback, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type {
  TerminalTab,
  TabType,
  TerminalClientMessage,
  TerminalServerMessage,
  ClaudeEvent,
  ClaudeMessage,
  ClaudePendingPermission,
  PermissionMode,
  TodoItem,
} from '@shared/index.js';

interface OutputCallback {
  (data: string): void;
}

interface ResizeSyncCallback {
  (cols: number, rows: number): void;
}

interface OutputSubscription {
  tabId: string;
  callback: OutputCallback;
}

interface ResizeSyncSubscription {
  tabId: string;
  callback: ResizeSyncCallback;
}

interface ClaudeEventCallback {
  (event: ClaudeEvent): void;
}

interface ClaudeHistoryCallback {
  (messages: ClaudeMessage[], pendingPermissions: ClaudePendingPermission[], todos: TodoItem[], permissionMode?: PermissionMode, isProcessing?: boolean): void;
}

interface ClaudeEventSubscription {
  tabId: string;
  callback: ClaudeEventCallback;
}

interface ClaudeHistorySubscription {
  tabId: string;
  callback: ClaudeHistoryCallback;
}

interface ClaudePermissionResolvedCallback {
  (requestId: string): void;
}

interface ClaudePermissionResolvedSubscription {
  tabId: string;
  callback: ClaudePermissionResolvedCallback;
}

interface ClaudeUserMessageCallback {
  (message: ClaudeMessage): void;
}

interface ClaudeUserMessageSubscription {
  tabId: string;
  callback: ClaudeUserMessageCallback;
}

interface ClaudeTodosUpdatedCallback {
  (todos: TodoItem[]): void;
}

interface ClaudeTodosUpdatedSubscription {
  tabId: string;
  callback: ClaudeTodosUpdatedCallback;
}

interface PermissionModeChangedCallback {
  (mode: PermissionMode): void;
}

interface PermissionModeChangedSubscription {
  tabId: string;
  callback: PermissionModeChangedCallback;
}

export interface UseTerminalWebSocketReturn {
  isConnected: boolean;
  tabs: TerminalTab[];
  sendInput: (tabId: string, data: string) => void;
  addTab: (title?: string, tabType?: TabType) => void;
  closeTab: (tabId: string) => void;
  renameTab: (tabId: string, title: string) => void;
  attachToTab: (tabId: string) => void;
  resizeTerminal: (cols: number, rows: number) => void;
  onOutput: (tabId: string, callback: OutputCallback) => () => void;
  onHistory: (tabId: string, callback: OutputCallback) => () => void;
  onExit: (tabId: string, callback: (code: number) => void) => () => void;
  onResizeSync: (tabId: string, callback: ResizeSyncCallback) => () => void;
  onOwnTabAdded: (callback: (tab: TerminalTab) => void) => () => void;
  // Claude-specific
  sendClaudeMessage: (content: string, permissionMode?: PermissionMode) => void;
  /**
   * Respond to a permission request
   * @param requestId - The permission request ID
   * @param permission - 'allow' or 'deny'
   * @param answers - For AskUserQuestion tool: map of question text to selected answer(s)
   * @param permissionMode - Permission mode to set (for ExitPlanMode)
   */
  respondToPermission: (
    requestId: string,
    permission: 'allow' | 'deny',
    answers?: Record<string, string>,
    permissionMode?: PermissionMode
  ) => void;
  /**
   * Change permission mode for the current Claude tab
   */
  changePermissionMode: (permissionMode: PermissionMode) => void;
  onClaudeEvent: (tabId: string, callback: ClaudeEventCallback) => () => void;
  onClaudeHistory: (tabId: string, callback: ClaudeHistoryCallback) => () => void;
  onClaudePermissionResolved: (tabId: string, callback: ClaudePermissionResolvedCallback) => () => void;
  onClaudeUserMessage: (tabId: string, callback: ClaudeUserMessageCallback) => () => void;
  onClaudeTodosUpdated: (tabId: string, callback: ClaudeTodosUpdatedCallback) => () => void;
  onPermissionModeChanged: (tabId: string, callback: PermissionModeChangedCallback) => () => void;
}

// Reconnect backoff configuration
const RECONNECT_BASE_DELAY = 1000;
const RECONNECT_MAX_DELAY = 30000;
const RECONNECT_MULTIPLIER = 2;

export function useTerminalWebSocket(sessionId: string | null): UseTerminalWebSocketReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [tabs, setTabs] = useState<TerminalTab[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const clientIdRef = useRef<string>(uuidv4());
  const currentTabIdRef = useRef<string | null>(null);
  const outputSubscriptionsRef = useRef<OutputSubscription[]>([]);
  const historySubscriptionsRef = useRef<OutputSubscription[]>([]);
  const exitSubscriptionsRef = useRef<{ tabId: string; callback: (code: number) => void }[]>([]);
  const resizeSyncSubscriptionsRef = useRef<ResizeSyncSubscription[]>([]);
  const ownTabAddedSubscriptionsRef = useRef<((tab: TerminalTab) => void)[]>([]);
  const claudeEventSubscriptionsRef = useRef<ClaudeEventSubscription[]>([]);
  const claudeHistorySubscriptionsRef = useRef<ClaudeHistorySubscription[]>([]);
  const claudePermissionResolvedSubscriptionsRef = useRef<ClaudePermissionResolvedSubscription[]>([]);
  const claudeUserMessageSubscriptionsRef = useRef<ClaudeUserMessageSubscription[]>([]);
  const claudeTodosUpdatedSubscriptionsRef = useRef<ClaudeTodosUpdatedSubscription[]>([]);
  const claudePermissionModeChangedSubscriptionsRef = useRef<PermissionModeChangedSubscription[]>([]);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectDelayRef = useRef<number>(RECONNECT_BASE_DELAY);

  const sendMessage = useCallback((message: TerminalClientMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  const handleMessage = useCallback((event: MessageEvent) => {
    try {
      const message: TerminalServerMessage = JSON.parse(event.data);

      switch (message.type) {
        case 'sync-state':
          setTabs(message.tabs);
          // Auto-create a claude tab if none exists
          if (message.tabs.length === 0) {
            sendMessage({ type: 'add-tab', tabType: 'claude' });
          } else if (currentTabIdRef.current) {
            // Re-attach to the previous tab if it still exists (reconnection case)
            // This re-fetches history/state that may have been missed during disconnection
            const previousTabExists = message.tabs.some(t => t.tabId === currentTabIdRef.current);
            if (previousTabExists) {
              sendMessage({ type: 'attach', tabId: currentTabIdRef.current });
            }
          }
          break;

        case 'tab-added':
          setTabs((prev) => [...prev, message.tab]);
          // Notify if this client requested the tab
          if (message.requesterId === clientIdRef.current) {
            for (const callback of ownTabAddedSubscriptionsRef.current) {
              callback(message.tab);
            }
          }
          break;

        case 'tab-removed':
          setTabs((prev) => prev.filter((t) => t.tabId !== message.tabId));
          break;

        case 'tab-renamed':
          setTabs((prev) =>
            prev.map((t) =>
              t.tabId === message.tabId ? { ...t, title: message.title } : t
            )
          );
          break;

        case 'tab-ready':
          setTabs((prev) =>
            prev.map((t) =>
              t.tabId === message.tabId ? { ...t, ready: true } : t
            )
          );
          break;

        case 'output':
          for (const sub of outputSubscriptionsRef.current) {
            if (sub.tabId === currentTabIdRef.current) {
              sub.callback(message.data);
            }
          }
          break;

        case 'history':
          for (const sub of historySubscriptionsRef.current) {
            if (sub.tabId === currentTabIdRef.current) {
              sub.callback(message.data);
            }
          }
          break;

        case 'attached':
          currentTabIdRef.current = message.tabId;
          break;

        case 'exit':
          for (const sub of exitSubscriptionsRef.current) {
            if (sub.tabId === message.tabId) {
              sub.callback(message.code);
            }
          }
          break;

        case 'resize-sync':
          for (const sub of resizeSyncSubscriptionsRef.current) {
            if (sub.tabId === currentTabIdRef.current) {
              sub.callback(message.cols, message.rows);
            }
          }
          break;

        case 'claude-event':
          for (const sub of claudeEventSubscriptionsRef.current) {
            if (sub.tabId === message.tabId) {
              // SDK events are compatible with ClaudeEvent type
              sub.callback(message.event as ClaudeEvent);
            }
          }
          break;

        case 'claude-history':
          for (const sub of claudeHistorySubscriptionsRef.current) {
            if (sub.tabId === message.tabId) {
              sub.callback(message.messages, message.pendingPermissions, message.todos, message.permissionMode, message.isProcessing);
            }
          }
          break;

        case 'claude-permission-resolved':
          for (const sub of claudePermissionResolvedSubscriptionsRef.current) {
            if (sub.tabId === message.tabId) {
              sub.callback(message.requestId);
            }
          }
          break;

        case 'claude-user-message':
          for (const sub of claudeUserMessageSubscriptionsRef.current) {
            if (sub.tabId === message.tabId) {
              sub.callback(message.message);
            }
          }
          break;

        case 'claude-todos-updated':
          for (const sub of claudeTodosUpdatedSubscriptionsRef.current) {
            if (sub.tabId === message.tabId) {
              sub.callback(message.todos);
            }
          }
          break;

        case 'claude-permission-mode-changed':
          for (const sub of claudePermissionModeChangedSubscriptionsRef.current) {
            if (sub.tabId === message.tabId) {
              sub.callback(message.mode);
            }
          }
          break;

        case 'error':
          console.error('Terminal WebSocket error:', message.message);
          break;
      }
    } catch {
      console.error('Failed to parse WebSocket message');
    }
  }, [sendMessage]);

  // Track current sessionId to prevent reconnecting to old session
  const sessionIdRef = useRef<string | null>(null);

  // Cleanup function to close WebSocket and reset state
  const cleanup = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setTabs([]);
    setIsConnected(false);
    currentTabIdRef.current = null;
    reconnectDelayRef.current = RECONNECT_BASE_DELAY;
    outputSubscriptionsRef.current = [];
    historySubscriptionsRef.current = [];
    exitSubscriptionsRef.current = [];
    resizeSyncSubscriptionsRef.current = [];
    claudeEventSubscriptionsRef.current = [];
    claudeHistorySubscriptionsRef.current = [];
    claudePermissionResolvedSubscriptionsRef.current = [];
    claudeUserMessageSubscriptionsRef.current = [];
    claudeTodosUpdatedSubscriptionsRef.current = [];
    claudePermissionModeChangedSubscriptionsRef.current = [];
  }, []);

  // Connect to WebSocket and join session
  useEffect(() => {
    // Always cleanup previous connection first
    cleanup();

    // Update ref to current sessionId
    sessionIdRef.current = sessionId;

    if (!sessionId) {
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/terminal`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      // Check if sessionId hasn't changed during connection
      if (sessionIdRef.current !== sessionId) {
        ws.close();
        return;
      }
      // Reset backoff delay on successful connection
      reconnectDelayRef.current = RECONNECT_BASE_DELAY;
      setIsConnected(true);
      ws.send(JSON.stringify({
        type: 'join-session',
        sessionId,
        clientId: clientIdRef.current,
      }));
    };

    ws.onmessage = handleMessage;

    ws.onclose = () => {
      // Only update state if this is still the current connection
      if (wsRef.current === ws) {
        setIsConnected(false);
        wsRef.current = null;

        // Only reconnect if sessionId hasn't changed
        if (sessionIdRef.current === sessionId) {
          const currentDelay = reconnectDelayRef.current;
          // Calculate next delay with exponential backoff
          reconnectDelayRef.current = Math.min(
            currentDelay * RECONNECT_MULTIPLIER,
            RECONNECT_MAX_DELAY
          );

          reconnectTimeoutRef.current = setTimeout(() => {
            // Double-check sessionId before reconnecting
            if (sessionIdRef.current === sessionId) {
              // Trigger reconnect by re-running this effect is not possible,
              // so we need to manually create new connection
              const newWs = new WebSocket(wsUrl);
              wsRef.current = newWs;
              newWs.onopen = ws.onopen;
              newWs.onmessage = ws.onmessage;
              newWs.onclose = ws.onclose;
              newWs.onerror = ws.onerror;
            }
          }, currentDelay);
        }
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    return cleanup;
  }, [sessionId, handleMessage, cleanup]);

  const sendInput = useCallback(
    (tabId: string, data: string) => {
      if (currentTabIdRef.current !== tabId) {
        return;
      }
      sendMessage({ type: 'input', data });
    },
    [sendMessage]
  );

  const addTab = useCallback(
    (title?: string, tabType?: TabType) => {
      sendMessage({ type: 'add-tab', title, tabType });
    },
    [sendMessage]
  );

  const closeTab = useCallback(
    (tabId: string) => {
      sendMessage({ type: 'close-tab', tabId });
      if (currentTabIdRef.current === tabId) {
        currentTabIdRef.current = null;
      }
    },
    [sendMessage]
  );

  const renameTab = useCallback(
    (tabId: string, title: string) => {
      sendMessage({ type: 'rename-tab', tabId, title });
    },
    [sendMessage]
  );

  const attachToTab = useCallback(
    (tabId: string) => {
      currentTabIdRef.current = tabId;
      sendMessage({ type: 'attach', tabId });
    },
    [sendMessage]
  );

  const resizeTerminal = useCallback(
    (cols: number, rows: number) => {
      sendMessage({ type: 'resize', cols, rows });
    },
    [sendMessage]
  );

  const onOutput = useCallback(
    (tabId: string, callback: OutputCallback): (() => void) => {
      const subscription = { tabId, callback };
      outputSubscriptionsRef.current.push(subscription);

      return () => {
        outputSubscriptionsRef.current = outputSubscriptionsRef.current.filter(
          (s) => s !== subscription
        );
      };
    },
    []
  );

  const onHistory = useCallback(
    (tabId: string, callback: OutputCallback): (() => void) => {
      const subscription = { tabId, callback };
      historySubscriptionsRef.current.push(subscription);

      return () => {
        historySubscriptionsRef.current = historySubscriptionsRef.current.filter(
          (s) => s !== subscription
        );
      };
    },
    []
  );

  const onExit = useCallback(
    (tabId: string, callback: (code: number) => void): (() => void) => {
      const subscription = { tabId, callback };
      exitSubscriptionsRef.current.push(subscription);

      return () => {
        exitSubscriptionsRef.current = exitSubscriptionsRef.current.filter(
          (s) => s !== subscription
        );
      };
    },
    []
  );

  const onResizeSync = useCallback(
    (tabId: string, callback: ResizeSyncCallback): (() => void) => {
      const subscription = { tabId, callback };
      resizeSyncSubscriptionsRef.current.push(subscription);

      return () => {
        resizeSyncSubscriptionsRef.current = resizeSyncSubscriptionsRef.current.filter(
          (s) => s !== subscription
        );
      };
    },
    []
  );

  const onOwnTabAdded = useCallback(
    (callback: (tab: TerminalTab) => void): (() => void) => {
      ownTabAddedSubscriptionsRef.current.push(callback);

      return () => {
        ownTabAddedSubscriptionsRef.current = ownTabAddedSubscriptionsRef.current.filter(
          (c) => c !== callback
        );
      };
    },
    []
  );

  // Claude-specific functions
  const sendClaudeMessage = useCallback(
    (content: string, permissionMode?: PermissionMode) => {
      sendMessage({ type: 'claude-message', content, permissionMode });
    },
    [sendMessage]
  );

  const respondToPermission = useCallback(
    (requestId: string, permission: 'allow' | 'deny', answers?: Record<string, string>, permissionMode?: PermissionMode) => {
      sendMessage({ type: 'claude-permission-response', requestId, permission, answers, permissionMode });
    },
    [sendMessage]
  );

  const changePermissionMode = useCallback(
    (permissionMode: PermissionMode) => {
      sendMessage({ type: 'claude-change-permission-mode', permissionMode });
    },
    [sendMessage]
  );

  const onClaudeEvent = useCallback(
    (tabId: string, callback: ClaudeEventCallback): (() => void) => {
      const subscription = { tabId, callback };
      claudeEventSubscriptionsRef.current.push(subscription);

      return () => {
        claudeEventSubscriptionsRef.current = claudeEventSubscriptionsRef.current.filter(
          (s) => s !== subscription
        );
      };
    },
    []
  );

  const onClaudeHistory = useCallback(
    (tabId: string, callback: ClaudeHistoryCallback): (() => void) => {
      const subscription = { tabId, callback };
      claudeHistorySubscriptionsRef.current.push(subscription);

      return () => {
        claudeHistorySubscriptionsRef.current = claudeHistorySubscriptionsRef.current.filter(
          (s) => s !== subscription
        );
      };
    },
    []
  );

  const onClaudePermissionResolved = useCallback(
    (tabId: string, callback: ClaudePermissionResolvedCallback): (() => void) => {
      const subscription = { tabId, callback };
      claudePermissionResolvedSubscriptionsRef.current.push(subscription);

      return () => {
        claudePermissionResolvedSubscriptionsRef.current = claudePermissionResolvedSubscriptionsRef.current.filter(
          (s) => s !== subscription
        );
      };
    },
    []
  );

  const onClaudeUserMessage = useCallback(
    (tabId: string, callback: ClaudeUserMessageCallback): (() => void) => {
      const subscription = { tabId, callback };
      claudeUserMessageSubscriptionsRef.current.push(subscription);

      return () => {
        claudeUserMessageSubscriptionsRef.current = claudeUserMessageSubscriptionsRef.current.filter(
          (s) => s !== subscription
        );
      };
    },
    []
  );

  const onClaudeTodosUpdated = useCallback(
    (tabId: string, callback: ClaudeTodosUpdatedCallback): (() => void) => {
      const subscription = { tabId, callback };
      claudeTodosUpdatedSubscriptionsRef.current.push(subscription);

      return () => {
        claudeTodosUpdatedSubscriptionsRef.current = claudeTodosUpdatedSubscriptionsRef.current.filter(
          (s) => s !== subscription
        );
      };
    },
    []
  );

  const onPermissionModeChanged = useCallback(
    (tabId: string, callback: PermissionModeChangedCallback): (() => void) => {
      const subscription = { tabId, callback };
      claudePermissionModeChangedSubscriptionsRef.current.push(subscription);

      return () => {
        claudePermissionModeChangedSubscriptionsRef.current = claudePermissionModeChangedSubscriptionsRef.current.filter(
          (s) => s !== subscription
        );
      };
    },
    []
  );

  return {
    isConnected,
    tabs,
    sendInput,
    addTab,
    closeTab,
    renameTab,
    attachToTab,
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
    onClaudeEvent,
    onClaudeHistory,
    onClaudePermissionResolved,
    onClaudeUserMessage,
    onClaudeTodosUpdated,
    onPermissionModeChanged,
  };
}
