import { WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import type { TerminalClientMessage, TerminalServerMessage, TerminalTab } from '@ccsandbox/shared';
import { getTerminalManager } from '../services/terminal.service.js';
import { SessionStore } from '../persistence/session-store.js';
import { getConfig } from '../config.js';
import type { ConnectionManager } from './connection-manager.js';

// Validation constants
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MIN_TERMINAL_SIZE = 1;
const MAX_TERMINAL_SIZE = 500;
const MAX_TITLE_LENGTH = 100;

/**
 * Validate UUID format
 */
function isValidUuid(id: string): boolean {
  return UUID_REGEX.test(id);
}

/**
 * Validate terminal dimensions
 */
function isValidTerminalSize(value: number): boolean {
  return Number.isInteger(value) && value >= MIN_TERMINAL_SIZE && value <= MAX_TERMINAL_SIZE;
}

/**
 * Validate tab title
 */
function isValidTitle(title: string): boolean {
  return typeof title === 'string' && title.length > 0 && title.length <= MAX_TITLE_LENGTH;
}

/**
 * Generate a unique tab title that doesn't conflict with existing tabs
 */
function generateUniqueTabTitle(existingTabs: TerminalTab[]): string {
  const existingTitles = new Set(existingTabs.map((tab) => tab.title));
  let number = 1;
  while (existingTitles.has(`Terminal ${number}`)) {
    number++;
  }
  return `Terminal ${number}`;
}

/**
 * Terminal WebSocket handler for a single connection
 */
export interface TerminalHandler {
  handleMessage: (message: TerminalClientMessage) => void;
  cleanup: () => void;
}

/**
 * Send a message to the WebSocket client
 */
function sendMessage(ws: WebSocket, message: TerminalServerMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

/**
 * Send an error message
 */
function sendError(ws: WebSocket, errorMessage: string): void {
  sendMessage(ws, { type: 'error', message: errorMessage });
}

/**
 * Create a terminal handler for a WebSocket connection
 */
export function createTerminalHandler(
  ws: WebSocket,
  connectionManager: ConnectionManager
): TerminalHandler {
  const terminalManager = getTerminalManager();
  let clientId: string | null = null;
  let currentSessionId: string | null = null;
  let currentTabId: string | null = null;

  /**
   * Handle join-session message - join a session room
   */
  async function handleJoinSession(
    sessionId: string,
    incomingClientId: string
  ): Promise<void> {
    try {
      const config = getConfig();
      const sessionStore = new SessionStore(config.repoDir);

      // Get session and validate
      const session = await sessionStore.get(sessionId);

      if (session.state !== 'RUNNING') {
        sendError(ws, 'Session is not running');
        return;
      }

      // Leave previous session if switching to a different one
      if (currentSessionId && currentSessionId !== sessionId && clientId) {
        connectionManager.leaveSession(currentSessionId, clientId);
        currentTabId = null;
      }

      clientId = incomingClientId;
      currentSessionId = sessionId;

      // Join the session room
      connectionManager.joinSession(sessionId, clientId, ws);

      // Send current tab state to the client
      const tabs = connectionManager.getTabs(sessionId);
      sendMessage(ws, { type: 'sync-state', tabs });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to join session';
      sendError(ws, message);
    }
  }

  /**
   * Handle add-tab message - create a new tab and terminal
   */
  async function handleAddTab(title?: string): Promise<void> {
    if (!currentSessionId || !clientId) {
      sendError(ws, 'Not joined to a session');
      return;
    }

    try {
      const config = getConfig();
      const sessionStore = new SessionStore(config.repoDir);
      const session = await sessionStore.get(currentSessionId);

      if (session.state !== 'RUNNING') {
        sendError(ws, 'Session is not running');
        return;
      }

      const tabId = uuidv4();
      const existingTabs = connectionManager.getTabs(currentSessionId);
      const tabTitle = title ?? generateUniqueTabTitle(existingTabs);

      // Create terminal
      await terminalManager.create({
        sessionId: currentSessionId,
        workspacePath: session.workspacePath,
        devcontainerCliPath: config.devcontainerCli,
        tabId,
      });

      const terminal = terminalManager.get(tabId);
      const tab: TerminalTab = {
        tabId,
        title: tabTitle,
        shell: terminal?.shell ?? 'bash',
      };

      // Add tab to room state
      connectionManager.addTab(currentSessionId, tab);

      // Broadcast to all clients in the session
      connectionManager.broadcast(currentSessionId, {
        type: 'tab-added',
        tab,
        requesterId: clientId,
      } satisfies TerminalServerMessage);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to add tab';
      sendError(ws, message);
    }
  }

  /**
   * Handle attach message - attach to an existing tab
   */
  async function handleAttach(tabId: string): Promise<void> {
    if (!currentSessionId || !clientId) {
      sendError(ws, 'Not joined to a session');
      return;
    }

    // Validate tab exists in room
    if (!connectionManager.hasTab(currentSessionId, tabId)) {
      sendError(ws, 'Tab not found');
      return;
    }

    // Check if terminal exists (may be null for exited terminals)
    const terminal = terminalManager.get(tabId);

    // Get history BEFORE setting client tab to avoid race condition:
    // If we set client tab first, any output arriving between setClientTab
    // and getOutputHistory would be sent via both 'output' and 'history' messages.
    // For exited terminals, this returns empty string.
    const history = terminalManager.getOutputHistory(tabId);

    currentTabId = tabId;
    connectionManager.setClientTab(currentSessionId, clientId, tabId);

    // Send history (output arriving after setClientTab will be sent via 'output' message)
    // For exited terminals without history, send empty history so client knows to show exit message
    sendMessage(ws, { type: 'history', data: history });

    sendMessage(ws, { type: 'attached', tabId });
  }

  /**
   * Handle switch-tab message - switch to a different tab
   */
  function handleSwitchTab(tabId: string): void {
    if (!currentSessionId || !clientId) {
      sendError(ws, 'Not joined to a session');
      return;
    }

    // Validate tab exists
    if (!connectionManager.hasTab(currentSessionId, tabId)) {
      sendError(ws, 'Tab not found');
      return;
    }

    // Get history BEFORE setting client tab to avoid race condition
    const history = terminalManager.getOutputHistory(tabId);

    currentTabId = tabId;
    connectionManager.setClientTab(currentSessionId, clientId, tabId);

    // Send history for the new tab
    if (history) {
      sendMessage(ws, { type: 'history', data: history });
    }
  }

  /**
   * Handle close-tab message - close a tab and kill terminal
   */
  function handleCloseTab(tabId: string): void {
    if (!currentSessionId || !clientId) {
      sendError(ws, 'Not joined to a session');
      return;
    }

    // Kill the terminal
    terminalManager.kill(tabId);

    // Remove tab from room state
    connectionManager.removeTab(currentSessionId, tabId);

    // Clear currentTabId for all clients watching this tab
    const clients = connectionManager.getClientsOnTab(currentSessionId, tabId);
    for (const client of clients) {
      connectionManager.setClientTab(currentSessionId, client.clientId, null);
    }

    // Reset current tab if we were watching it
    if (currentTabId === tabId) {
      currentTabId = null;
    }

    // Broadcast to all clients in the session
    connectionManager.broadcast(currentSessionId, {
      type: 'tab-removed',
      tabId,
    } satisfies TerminalServerMessage);
  }

  /**
   * Handle rename-tab message - rename a tab
   */
  function handleRenameTab(tabId: string, title: string): void {
    if (!currentSessionId || !clientId) {
      sendError(ws, 'Not joined to a session');
      return;
    }

    // Validate tab exists
    if (!connectionManager.hasTab(currentSessionId, tabId)) {
      sendError(ws, 'Tab not found');
      return;
    }

    // Update tab title
    connectionManager.renameTab(currentSessionId, tabId, title);

    // Broadcast to all clients in the session
    connectionManager.broadcast(currentSessionId, {
      type: 'tab-renamed',
      tabId,
      title,
    } satisfies TerminalServerMessage);
  }

  /**
   * Handle input message - write data to terminal
   */
  function handleInput(data: string): void {
    if (!currentTabId) {
      sendError(ws, 'Not attached to a terminal');
      return;
    }

    // Silently ignore if terminal is not found (may be exited).
    // Client should handle this gracefully via exitedRef state.
    terminalManager.write(currentTabId, data);
  }

  /**
   * Handle resize message - resize terminal
   */
  function handleResize(cols: number, rows: number): void {
    if (!currentTabId) {
      sendError(ws, 'Not attached to a terminal');
      return;
    }

    terminalManager.resize(currentTabId, cols, rows);
  }

  /**
   * Handle detach message - detach from terminal
   */
  function handleDetach(): void {
    if (currentSessionId && clientId) {
      connectionManager.setClientTab(currentSessionId, clientId, null);
    }
    currentTabId = null;
  }

  /**
   * Process incoming WebSocket messages
   */
  function handleMessage(message: TerminalClientMessage): void {
    switch (message.type) {
      case 'join-session':
        if (!isValidUuid(message.sessionId)) {
          sendError(ws, 'Invalid sessionId format');
          return;
        }
        if (!isValidUuid(message.clientId)) {
          sendError(ws, 'Invalid clientId format');
          return;
        }
        handleJoinSession(message.sessionId, message.clientId).catch((error) => {
          const errorMessage = error instanceof Error ? error.message : 'Join session failed';
          sendError(ws, errorMessage);
        });
        break;

      case 'add-tab':
        if (message.title !== undefined && !isValidTitle(message.title)) {
          sendError(ws, 'Invalid title');
          return;
        }
        handleAddTab(message.title).catch((error) => {
          const errorMessage = error instanceof Error ? error.message : 'Add tab failed';
          sendError(ws, errorMessage);
        });
        break;

      case 'attach':
        if (!isValidUuid(message.tabId)) {
          sendError(ws, 'Invalid tabId format');
          return;
        }
        handleAttach(message.tabId).catch((error) => {
          const errorMessage = error instanceof Error ? error.message : 'Attach failed';
          sendError(ws, errorMessage);
        });
        break;

      case 'switch-tab':
        if (!isValidUuid(message.tabId)) {
          sendError(ws, 'Invalid tabId format');
          return;
        }
        handleSwitchTab(message.tabId);
        break;

      case 'close-tab':
        if (!isValidUuid(message.tabId)) {
          sendError(ws, 'Invalid tabId format');
          return;
        }
        handleCloseTab(message.tabId);
        break;

      case 'rename-tab':
        if (!isValidUuid(message.tabId)) {
          sendError(ws, 'Invalid tabId format');
          return;
        }
        if (!isValidTitle(message.title)) {
          sendError(ws, 'Invalid title');
          return;
        }
        handleRenameTab(message.tabId, message.title);
        break;

      case 'input':
        handleInput(message.data);
        break;

      case 'resize':
        if (!isValidTerminalSize(message.cols)) {
          sendError(ws, `Invalid cols value: must be between ${MIN_TERMINAL_SIZE} and ${MAX_TERMINAL_SIZE}`);
          return;
        }
        if (!isValidTerminalSize(message.rows)) {
          sendError(ws, `Invalid rows value: must be between ${MIN_TERMINAL_SIZE} and ${MAX_TERMINAL_SIZE}`);
          return;
        }
        handleResize(message.cols, message.rows);
        break;

      case 'detach':
        handleDetach();
        break;

      default:
        sendError(ws, 'Unknown message type');
    }
  }

  /**
   * Clean up resources when connection closes
   */
  function cleanup(): void {
    // Leave session room
    if (currentSessionId && clientId) {
      connectionManager.leaveSession(currentSessionId, clientId);
    }

    currentTabId = null;
    currentSessionId = null;
    clientId = null;
  }

  return {
    handleMessage,
    cleanup,
  };
}
