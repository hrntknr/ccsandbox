import { useState, useEffect, useCallback, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { TerminalTab, TerminalClientMessage, TerminalServerMessage } from '@ccsandbox/shared';

interface OutputCallback {
  (data: string): void;
}

interface OutputSubscription {
  tabId: string;
  callback: OutputCallback;
}

export interface UseTerminalWebSocketReturn {
  isConnected: boolean;
  tabs: TerminalTab[];
  sendInput: (tabId: string, data: string) => void;
  addTab: (title?: string) => void;
  closeTab: (tabId: string) => void;
  renameTab: (tabId: string, title: string) => void;
  attachToTab: (tabId: string) => void;
  resizeTerminal: (cols: number, rows: number) => void;
  onOutput: (tabId: string, callback: OutputCallback) => () => void;
  onHistory: (tabId: string, callback: OutputCallback) => () => void;
  onExit: (tabId: string, callback: (code: number) => void) => () => void;
  onOwnTabAdded: (callback: (tab: TerminalTab) => void) => () => void;
}

export function useTerminalWebSocket(sessionId: string | null): UseTerminalWebSocketReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [tabs, setTabs] = useState<TerminalTab[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const clientIdRef = useRef<string>(uuidv4());
  const currentTabIdRef = useRef<string | null>(null);
  const outputSubscriptionsRef = useRef<OutputSubscription[]>([]);
  const historySubscriptionsRef = useRef<OutputSubscription[]>([]);
  const exitSubscriptionsRef = useRef<{ tabId: string; callback: (code: number) => void }[]>([]);
  const ownTabAddedSubscriptionsRef = useRef<((tab: TerminalTab) => void)[]>([]);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
          // Auto-create a tab if none exists
          if (message.tabs.length === 0) {
            sendMessage({ type: 'add-tab' });
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
    outputSubscriptionsRef.current = [];
    historySubscriptionsRef.current = [];
    exitSubscriptionsRef.current = [];
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
          }, 2000);
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
    (title?: string) => {
      sendMessage({ type: 'add-tab', title });
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
    onOwnTabAdded,
  };
}
