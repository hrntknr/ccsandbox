import { WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import type { TerminalClientMessage, TerminalServerMessage, TerminalTab, TabType, ClaudePermissionMode } from '@ccsandbox/shared';
import { getTerminalManager } from '../services/terminal.service.js';
import { getClaudeManager } from '../services/claude.service.js';
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
function generateUniqueTabTitle(existingTabs: TerminalTab[], tabType: TabType = 'shell'): string {
  const existingTitles = new Set(existingTabs.map((tab) => tab.title));
  const prefix = tabType === 'claude' ? 'Claude' : 'Terminal';
  let number = 1;
  while (existingTitles.has(`${prefix} ${number}`)) {
    number++;
  }
  return `${prefix} ${number}`;
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
  const claudeManager = getClaudeManager();
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
      const sessionStore = new SessionStore(config.configDir, config.repoDir);

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
   * Handle add-tab message - create a new tab and terminal/claude instance
   * Uses 2-phase response: immediately broadcasts tab-added (ready: false),
   * then broadcasts tab-ready after terminal/claude creation completes.
   */
  async function handleAddTab(title?: string, tabType: TabType = 'shell'): Promise<void> {
    if (!currentSessionId || !clientId) {
      sendError(ws, 'Not joined to a session');
      return;
    }

    // Capture sessionId for use in async callback
    const sessionId = currentSessionId;

    try {
      const config = getConfig();
      const sessionStore = new SessionStore(config.configDir, config.repoDir);
      const session = await sessionStore.get(sessionId);

      if (session.state !== 'RUNNING') {
        sendError(ws, 'Session is not running');
        return;
      }

      const tabId = uuidv4();
      const existingTabs = connectionManager.getTabs(sessionId);
      const tabTitle = title ?? generateUniqueTabTitle(existingTabs, tabType);

      // Step 1: Immediately add tab with ready: false
      const tab: TerminalTab = {
        tabId,
        title: tabTitle,
        shell: tabType === 'claude' ? 'claude' : 'bash',
        tabType,
        ready: false,
      };

      connectionManager.addTab(sessionId, tab);
      connectionManager.broadcast(sessionId, {
        type: 'tab-added',
        tab,
        requesterId: clientId,
      } satisfies TerminalServerMessage);

      // Step 2: Create terminal or Claude instance in background
      if (tabType === 'claude') {
        claudeManager.create({
          sessionId,
          workspacePath: session.workspacePath,
          devcontainerCliPath: config.devcontainerCli,
          tabId,
        }).then(() => {
          connectionManager.updateTab(sessionId, tabId, {
            ready: true,
          });
          connectionManager.broadcast(sessionId, {
            type: 'tab-ready',
            tabId,
          } satisfies TerminalServerMessage);
        }).catch((error) => {
          // On error: remove the tab
          connectionManager.removeTab(sessionId, tabId);
          connectionManager.broadcast(sessionId, {
            type: 'tab-removed',
            tabId,
          } satisfies TerminalServerMessage);
          const errorMessage = error instanceof Error ? error.message : 'Failed to create Claude instance';
          sendError(ws, errorMessage);
        });
      } else {
        terminalManager.create({
          sessionId,
          workspacePath: session.workspacePath,
          devcontainerCliPath: config.devcontainerCli,
          tabId,
          shell: session.shell,
          remoteEnv: config.pat ? [`GITHUB_TOKEN=${config.pat}`] : undefined,
        }).then(() => {
          const terminal = terminalManager.get(tabId);
          connectionManager.updateTab(sessionId, tabId, {
            shell: terminal?.shell ?? 'bash',
            ready: true,
          });
          connectionManager.broadcast(sessionId, {
            type: 'tab-ready',
            tabId,
          } satisfies TerminalServerMessage);
        }).catch((error) => {
          // On error: remove the tab
          connectionManager.removeTab(sessionId, tabId);
          connectionManager.broadcast(sessionId, {
            type: 'tab-removed',
            tabId,
          } satisfies TerminalServerMessage);
          const errorMessage = error instanceof Error ? error.message : 'Failed to create terminal';
          sendError(ws, errorMessage);
        });
      }
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

    // Get the tab to determine its type
    const tabs = connectionManager.getTabs(currentSessionId);
    const tab = tabs.find((t) => t.tabId === tabId);

    currentTabId = tabId;
    connectionManager.setClientTab(currentSessionId, clientId, tabId);

    if (tab?.tabType === 'claude') {
      // Send Claude history
      const messages = claudeManager.getMessages(tabId);
      const pendingPermissions = claudeManager.getPendingPermissions(tabId);
      sendMessage(ws, { type: 'claude-history', tabId, messages, pendingPermissions });
    } else {
      // Get terminal history BEFORE setting client tab to avoid race condition:
      // If we set client tab first, any output arriving between setClientTab
      // and getOutputHistory would be sent via both 'output' and 'history' messages.
      // For exited terminals, this returns empty string.
      const history = terminalManager.getOutputHistory(tabId);

      // Send history (output arriving after setClientTab will be sent via 'output' message)
      // For exited terminals without history, send empty history so client knows to show exit message
      sendMessage(ws, { type: 'history', data: history });
    }

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
   * Handle close-tab message - close a tab and kill terminal/claude instance
   */
  function handleCloseTab(tabId: string): void {
    if (!currentSessionId || !clientId) {
      sendError(ws, 'Not joined to a session');
      return;
    }

    // Get the tab to determine its type
    const tabs = connectionManager.getTabs(currentSessionId);
    const tab = tabs.find((t) => t.tabId === tabId);

    // Kill the terminal or Claude instance
    if (tab?.tabType === 'claude') {
      claudeManager.kill(tabId);
    } else {
      terminalManager.kill(tabId);
    }

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
   * Syncs to the minimum size across all connected clients
   */
  function handleResize(cols: number, rows: number): void {
    if (!currentTabId || !currentSessionId || !clientId) {
      sendError(ws, 'Not attached to a terminal');
      return;
    }

    // Update this client's size
    connectionManager.setClientSize(currentSessionId, clientId, cols, rows);

    // Calculate minimum size across all clients on this tab
    const minSize = connectionManager.getMinSizeForTab(currentSessionId, currentTabId);
    if (!minSize) {
      return;
    }

    // Resize the PTY to the minimum size
    terminalManager.resize(currentTabId, minSize.cols, minSize.rows);

    // Broadcast the synchronized size to all clients on this tab
    connectionManager.broadcastToTab(currentSessionId, currentTabId, {
      type: 'resize-sync',
      cols: minSize.cols,
      rows: minSize.rows,
    } satisfies TerminalServerMessage);
  }

  /**
   * Recalculate and broadcast minimum size for a tab after client disconnect or detach
   */
  function recalculateTabSize(sessionId: string, tabId: string): void {
    const minSize = connectionManager.getMinSizeForTab(sessionId, tabId);
    if (!minSize) {
      return;
    }

    // Resize the PTY to the new minimum size
    terminalManager.resize(tabId, minSize.cols, minSize.rows);

    // Broadcast the synchronized size to remaining clients
    connectionManager.broadcastToTab(sessionId, tabId, {
      type: 'resize-sync',
      cols: minSize.cols,
      rows: minSize.rows,
    } satisfies TerminalServerMessage);
  }

  /**
   * Handle detach message - detach from terminal
   */
  function handleDetach(): void {
    if (currentSessionId && clientId && currentTabId) {
      const previousTabId = currentTabId;
      connectionManager.setClientTab(currentSessionId, clientId, null);
      // Clear client size since they're no longer on this tab
      connectionManager.setClientSize(currentSessionId, clientId, 0, 0);
      currentTabId = null;
      // Recalculate size for remaining clients on the tab
      recalculateTabSize(currentSessionId, previousTabId);
    } else {
      currentTabId = null;
    }
  }

  /**
   * Handle claude-message - send a message to Claude
   */
  async function handleClaudeMessage(content: string, permissionMode?: ClaudePermissionMode): Promise<void> {
    if (!currentTabId || !currentSessionId) {
      sendError(ws, 'Not attached to a Claude tab');
      return;
    }

    const instance = claudeManager.get(currentTabId);
    if (!instance) {
      sendError(ws, 'Claude instance not found');
      return;
    }

    // Update permission mode if changed
    if (permissionMode && permissionMode !== instance.permissionMode) {
      const config = getConfig();
      await claudeManager.setPermissionMode(currentTabId, permissionMode, config.devcontainerCli);
    }

    if (!claudeManager.sendMessage(currentTabId, content)) {
      sendError(ws, 'Failed to send message to Claude');
    }
  }

  /**
   * Handle claude-permission-response - respond to a permission request
   */
  function handleClaudePermissionResponse(requestId: string, permission: 'allow' | 'deny'): void {
    if (!currentTabId) {
      sendError(ws, 'Not attached to a Claude tab');
      return;
    }

    if (!claudeManager.respondToPermission(currentTabId, requestId, permission)) {
      sendError(ws, 'Failed to respond to permission request');
    }
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
        handleAddTab(message.title, message.tabType).catch((error) => {
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

      case 'claude-message':
        handleClaudeMessage(message.content, message.permissionMode).catch((error) => {
          const errorMessage = error instanceof Error ? error.message : 'Failed to send Claude message';
          sendError(ws, errorMessage);
        });
        break;

      case 'claude-permission-response':
        if (!isValidUuid(message.requestId)) {
          sendError(ws, 'Invalid requestId format');
          return;
        }
        handleClaudePermissionResponse(message.requestId, message.permission);
        break;

      default:
        sendError(ws, 'Unknown message type');
    }
  }

  /**
   * Clean up resources when connection closes
   */
  function cleanup(): void {
    // Recalculate tab size before leaving (if attached to a tab)
    const previousSessionId = currentSessionId;
    const previousTabId = currentTabId;

    // Leave session room
    if (currentSessionId && clientId) {
      connectionManager.leaveSession(currentSessionId, clientId);
    }

    currentTabId = null;
    currentSessionId = null;
    clientId = null;

    // Recalculate size for remaining clients on the tab
    if (previousSessionId && previousTabId) {
      recalculateTabSize(previousSessionId, previousTabId);
    }
  }

  return {
    handleMessage,
    cleanup,
  };
}
