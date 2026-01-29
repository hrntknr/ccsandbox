import { WebSocket } from 'ws';
import type { TerminalClientMessage, TerminalServerMessage } from '@ccsandbox/shared';
import { getTerminalManager } from '../services/terminal.service.js';
import { SessionStore } from '../persistence/session-store.js';
import { getConfig } from '../config.js';

// Validation constants
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MIN_TERMINAL_SIZE = 1;
const MAX_TERMINAL_SIZE = 500;

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
export function createTerminalHandler(ws: WebSocket): TerminalHandler {
  const terminalManager = getTerminalManager();
  let currentTabId: string | null = null;
  let currentSessionId: string | null = null;

  // Event listeners that need cleanup
  const dataListener = (tabId: string, data: string): void => {
    if (tabId === currentTabId) {
      sendMessage(ws, { type: 'output', data });
    }
  };

  const exitListener = (tabId: string, code: number): void => {
    if (tabId === currentTabId) {
      sendMessage(ws, { type: 'exit', code });
      currentTabId = null;
    }
  };

  const errorListener = (tabId: string, error: Error): void => {
    if (tabId === currentTabId) {
      sendError(ws, error.message);
      currentTabId = null;
    }
  };

  // Register event listeners
  terminalManager.on('data', dataListener);
  terminalManager.on('exit', exitListener);
  terminalManager.on('error', errorListener);

  /**
   * Handle attach message - create or attach to a terminal
   */
  async function handleAttach(
    sessionId: string,
    tabId?: string
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

      if (!session.containerId) {
        sendError(ws, 'Session has no container');
        return;
      }

      currentSessionId = sessionId;

      // If tabId is provided, try to attach to existing terminal
      if (tabId) {
        const existing = terminalManager.get(tabId);
        if (existing && existing.sessionId === sessionId) {
          currentTabId = tabId;
          sendMessage(ws, { type: 'attached', tabId });
          return;
        }
      }

      // Create new terminal
      const newTabId = await terminalManager.create({
        sessionId,
        containerId: session.containerId,
        tabId,
      });

      currentTabId = newTabId;
      sendMessage(ws, { type: 'attached', tabId: newTabId });

      // Update session tabs
      const tabs = session.tabs ?? [];
      const existingTab = tabs.find((t) => t.tabId === newTabId);
      if (!existingTab) {
        const terminal = terminalManager.get(newTabId);
        tabs.push({
          tabId: newTabId,
          title: `Terminal ${tabs.length + 1}`,
          shell: terminal?.shell ?? 'bash',
        });
        await sessionStore.update(sessionId, { tabs });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to attach';
      sendError(ws, message);
    }
  }

  /**
   * Handle input message - write data to terminal
   */
  function handleInput(data: string): void {
    if (!currentTabId) {
      sendError(ws, 'Not attached to a terminal');
      return;
    }

    const success = terminalManager.write(currentTabId, data);
    if (!success) {
      sendError(ws, 'Failed to write to terminal');
    }
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
    currentTabId = null;
    currentSessionId = null;
  }

  /**
   * Handle close-tab message - kill terminal and update session
   */
  async function handleCloseTab(tabId: string): Promise<void> {
    // Kill the terminal
    terminalManager.kill(tabId);

    // If we were attached to this tab, detach
    if (currentTabId === tabId) {
      currentTabId = null;
    }

    // Update session tabs if we know the session
    if (currentSessionId) {
      try {
        const config = getConfig();
        const sessionStore = new SessionStore(config.repoDir);
        const session = await sessionStore.get(currentSessionId);

        // Remove the tab from session
        const updatedTabs = (session.tabs ?? []).filter(t => t.tabId !== tabId);
        await sessionStore.update(currentSessionId, { tabs: updatedTabs });
      } catch {
        // Ignore errors - session may not exist
      }
    }
  }

  /**
   * Process incoming WebSocket messages
   */
  function handleMessage(message: TerminalClientMessage): void {
    switch (message.type) {
      case 'attach':
        // Validate sessionId format
        if (!isValidUuid(message.sessionId)) {
          sendError(ws, 'Invalid sessionId format');
          return;
        }
        // Validate tabId format if provided
        if (message.tabId !== undefined && !isValidUuid(message.tabId)) {
          sendError(ws, 'Invalid tabId format');
          return;
        }
        handleAttach(message.sessionId, message.tabId).catch((error) => {
          const errorMessage = error instanceof Error ? error.message : 'Attach failed';
          sendError(ws, errorMessage);
        });
        break;
      case 'input':
        handleInput(message.data);
        break;
      case 'resize':
        // Validate cols and rows range
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
      case 'close-tab':
        // Validate tabId format
        if (!isValidUuid(message.tabId)) {
          sendError(ws, 'Invalid tabId format');
          return;
        }
        handleCloseTab(message.tabId).catch((error) => {
          const errorMessage = error instanceof Error ? error.message : 'Close tab failed';
          sendError(ws, errorMessage);
        });
        break;
      default:
        sendError(ws, 'Unknown message type');
    }
  }

  /**
   * Clean up resources when connection closes
   */
  function cleanup(): void {
    // Remove event listeners
    terminalManager.off('data', dataListener);
    terminalManager.off('exit', exitListener);
    terminalManager.off('error', errorListener);

    // Note: We don't kill the terminal on disconnect,
    // allowing reconnection to existing terminals.
    // The terminal will be cleaned up when the session ends
    // or explicitly killed.
    currentTabId = null;
    currentSessionId = null;
  }

  return {
    handleMessage,
    cleanup,
  };
}
