import type { WebSocket } from 'ws';
import type { TerminalTab, TerminalServerMessage, ClaudeEvent, TodoItem } from '../shared/index.js';
import type { TerminalManager } from '../services/terminal.service.js';
import type { ClaudeManager, ClaudeProcessingStats } from '../services/claude.service.js';
import { getSessionSyncManager } from './session-sync-manager.js';
import { getSessionStore } from '../persistence/session-store.js';

export interface ClientConnection {
  ws: WebSocket;
  clientId: string;
  currentTabId: string | null;
  cols: number | null;
  rows: number | null;
}

export interface SessionRoom {
  sessionId: string;
  clients: Map<string, ClientConnection>;
  tabs: TerminalTab[];
}

export class ConnectionManager {
  private rooms: Map<string, SessionRoom> = new Map();
  private tabToSession: Map<string, string> = new Map();
  private terminalManager: TerminalManager | null = null;
  private claudeManager: ClaudeManager | null = null;
  private listenersRegistered = false;
  private claudeListenersRegistered = false;

  /**
   * Initialize with TerminalManager and register event listeners
   */
  initialize(terminalManager: TerminalManager): void {
    if (this.listenersRegistered) return;

    this.terminalManager = terminalManager;

    terminalManager.on('data', this.handleTerminalData);
    terminalManager.on('exit', this.handleTerminalExit);
    terminalManager.on('error', this.handleTerminalError);

    this.listenersRegistered = true;
  }

  /**
   * Initialize with ClaudeManager and register event listeners
   */
  initializeClaude(claudeManager: ClaudeManager): void {
    if (this.claudeListenersRegistered) return;

    this.claudeManager = claudeManager;

    claudeManager.on('event', this.handleClaudeEvent);
    claudeManager.on('exit', this.handleClaudeExit);
    claudeManager.on('error', this.handleClaudeError);
    claudeManager.on('pendingPermissionsChanged', this.handlePendingPermissionsChanged);
    claudeManager.on('processingStateChanged', this.handleProcessingStateChanged);
    claudeManager.on('todosChanged', this.handleTodosChanged);

    this.claudeListenersRegistered = true;
  }

  private handleTerminalData = (tabId: string, data: string): void => {
    const sessionId = this.tabToSession.get(tabId);
    if (!sessionId) return;

    this.broadcastToTab(sessionId, tabId, {
      type: 'output',
      data,
    } satisfies TerminalServerMessage);
  };

  private handleTerminalExit = (tabId: string, code: number): void => {
    const sessionId = this.tabToSession.get(tabId);
    if (!sessionId) return;

    // Mark tab as exited for reconnection state restoration
    const room = this.rooms.get(sessionId);
    if (room) {
      const tab = room.tabs.find((t) => t.tabId === tabId);
      if (tab) {
        tab.exited = true;
      }
    }

    // Notify all clients in the session about the exit
    // Do not remove the tab immediately - wait for client to close it after user input
    this.broadcast(sessionId, {
      type: 'exit',
      tabId,
      code,
    } satisfies TerminalServerMessage);
  };

  private handleTerminalError = (tabId: string, error: Error): void => {
    const sessionId = this.tabToSession.get(tabId);
    if (!sessionId) return;

    this.broadcastToTab(sessionId, tabId, {
      type: 'error',
      message: error.message,
    } satisfies TerminalServerMessage);
  };

  private handleClaudeEvent = (tabId: string, event: ClaudeEvent): void => {
    const sessionId = this.tabToSession.get(tabId);
    if (!sessionId) return;

    this.broadcastToTab(sessionId, tabId, {
      type: 'claude-event',
      tabId,
      event,
    } satisfies TerminalServerMessage);
  };

  private handleClaudeExit = (tabId: string, code: number): void => {
    const sessionId = this.tabToSession.get(tabId);
    if (!sessionId) return;

    // Mark tab as exited
    const room = this.rooms.get(sessionId);
    if (room) {
      const tab = room.tabs.find((t) => t.tabId === tabId);
      if (tab) {
        tab.exited = true;
      }
    }

    this.broadcast(sessionId, {
      type: 'exit',
      tabId,
      code,
    } satisfies TerminalServerMessage);
  };

  private handleClaudeError = (tabId: string, error: Error): void => {
    const sessionId = this.tabToSession.get(tabId);
    if (!sessionId) return;

    this.broadcastToTab(sessionId, tabId, {
      type: 'error',
      message: error.message,
    } satisfies TerminalServerMessage);
  };

  private handlePendingPermissionsChanged = async (sessionId: string, hasPending: boolean): Promise<void> => {
    // Update session and broadcast to all clients
    const sessionStore = getSessionStore();
    try {
      const session = await sessionStore.get(sessionId);
      const updatedSession = { ...session, hasPendingPermissions: hasPending };
      getSessionSyncManager().broadcastUpdated(updatedSession);
    } catch {
      // Session not found, ignore
    }
  };

  private handleProcessingStateChanged = async (sessionId: string, stats: ClaudeProcessingStats): Promise<void> => {
    // Update session and broadcast to all clients
    const sessionStore = getSessionStore();
    try {
      const session = await sessionStore.get(sessionId);
      const updatedSession = { ...session, claudeStats: stats };
      getSessionSyncManager().broadcastUpdated(updatedSession);
    } catch {
      // Session not found, ignore
    }
  };

  private handleTodosChanged = (tabId: string, todos: TodoItem[]): void => {
    const sessionId = this.tabToSession.get(tabId);
    if (!sessionId) return;

    this.broadcastToTab(sessionId, tabId, {
      type: 'claude-todos-updated',
      tabId,
      todos,
    } satisfies TerminalServerMessage);
  };

  joinSession(
    sessionId: string,
    clientId: string,
    ws: WebSocket
  ): SessionRoom {
    let room = this.rooms.get(sessionId);

    if (!room) {
      room = {
        sessionId,
        clients: new Map(),
        tabs: [],
      };
      this.rooms.set(sessionId, room);
    }

    const existingClient = room.clients.get(clientId);
    if (existingClient) {
      existingClient.ws = ws;
    } else {
      room.clients.set(clientId, {
        ws,
        clientId,
        currentTabId: null,
        cols: null,
        rows: null,
      });
    }

    return room;
  }

  leaveSession(sessionId: string, clientId: string): void {
    const room = this.rooms.get(sessionId);
    if (!room) return;

    room.clients.delete(clientId);

    // Don't delete room even if empty - keep tabs state for reconnection
  }

  getRoom(sessionId: string): SessionRoom | undefined {
    return this.rooms.get(sessionId);
  }

  getClient(sessionId: string, clientId: string): ClientConnection | undefined {
    const room = this.rooms.get(sessionId);
    return room?.clients.get(clientId);
  }

  setClientTab(sessionId: string, clientId: string, tabId: string | null): void {
    const client = this.getClient(sessionId, clientId);
    if (client) {
      client.currentTabId = tabId;
    }
  }

  broadcast(
    sessionId: string,
    message: unknown,
    excludeClientId?: string
  ): void {
    const room = this.rooms.get(sessionId);
    if (!room) return;

    const data = JSON.stringify(message);
    for (const [clientId, client] of room.clients) {
      if (excludeClientId && clientId === excludeClientId) continue;
      if (client.ws.readyState === 1) {
        // WebSocket.OPEN = 1
        client.ws.send(data);
      }
    }
  }

  broadcastToTab(sessionId: string, tabId: string, message: unknown, excludeClientId?: string): void {
    const room = this.rooms.get(sessionId);
    if (!room) return;

    const data = JSON.stringify(message);
    for (const client of room.clients.values()) {
      if (excludeClientId && client.clientId === excludeClientId) continue;
      if (client.currentTabId === tabId && client.ws.readyState === 1) {
        client.ws.send(data);
      }
    }
  }

  addTab(sessionId: string, tab: TerminalTab): void {
    const room = this.rooms.get(sessionId);
    if (!room) return;

    room.tabs.push(tab);
    this.tabToSession.set(tab.tabId, sessionId);
  }

  removeTab(sessionId: string, tabId: string): void {
    const room = this.rooms.get(sessionId);
    if (!room) return;

    const index = room.tabs.findIndex((t) => t.tabId === tabId);
    if (index !== -1) {
      room.tabs.splice(index, 1);
    }
    this.tabToSession.delete(tabId);
  }

  renameTab(sessionId: string, tabId: string, title: string): void {
    const room = this.rooms.get(sessionId);
    if (!room) return;

    const tab = room.tabs.find((t) => t.tabId === tabId);
    if (tab) {
      tab.title = title;
    }
  }

  updateTab(sessionId: string, tabId: string, updates: Partial<TerminalTab>): void {
    const room = this.rooms.get(sessionId);
    if (!room) return;

    const tab = room.tabs.find((t) => t.tabId === tabId);
    if (tab) {
      Object.assign(tab, updates);
    }
  }

  getTabs(sessionId: string): TerminalTab[] {
    const room = this.rooms.get(sessionId);
    return room?.tabs ?? [];
  }

  hasTab(sessionId: string, tabId: string): boolean {
    const room = this.rooms.get(sessionId);
    return room?.tabs.some((t) => t.tabId === tabId) ?? false;
  }

  getClientsOnTab(sessionId: string, tabId: string): ClientConnection[] {
    const room = this.rooms.get(sessionId);
    if (!room) return [];

    return Array.from(room.clients.values()).filter(
      (c) => c.currentTabId === tabId
    );
  }

  setClientSize(sessionId: string, clientId: string, cols: number, rows: number): void {
    const client = this.getClient(sessionId, clientId);
    if (client) {
      client.cols = cols;
      client.rows = rows;
    }
  }

  getMinSizeForTab(sessionId: string, tabId: string): { cols: number; rows: number } | null {
    const clients = this.getClientsOnTab(sessionId, tabId);
    const clientsWithSize = clients.filter(
      (c): c is ClientConnection & { cols: number; rows: number } =>
        c.cols !== null && c.rows !== null
    );

    if (clientsWithSize.length === 0) {
      return null;
    }

    const minCols = Math.min(...clientsWithSize.map((c) => c.cols));
    const minRows = Math.min(...clientsWithSize.map((c) => c.rows));

    return { cols: minCols, rows: minRows };
  }

  /**
   * Clear all tabs for a session (used when session is stopped)
   */
  clearSessionTabs(sessionId: string): void {
    const room = this.rooms.get(sessionId);
    if (!room) return;

    // Remove tab-to-session mappings
    for (const tab of room.tabs) {
      this.tabToSession.delete(tab.tabId);
    }

    // Clear tabs array
    room.tabs = [];

    // Reset currentTabId for all clients in this session
    for (const client of room.clients.values()) {
      client.currentTabId = null;
    }
  }

  cleanup(): void {
    if (this.terminalManager && this.listenersRegistered) {
      this.terminalManager.off('data', this.handleTerminalData);
      this.terminalManager.off('exit', this.handleTerminalExit);
      this.terminalManager.off('error', this.handleTerminalError);
      this.listenersRegistered = false;
    }
    if (this.claudeManager && this.claudeListenersRegistered) {
      this.claudeManager.off('event', this.handleClaudeEvent);
      this.claudeManager.off('exit', this.handleClaudeExit);
      this.claudeManager.off('error', this.handleClaudeError);
      this.claudeManager.off('pendingPermissionsChanged', this.handlePendingPermissionsChanged);
      this.claudeManager.off('processingStateChanged', this.handleProcessingStateChanged);
      this.claudeManager.off('todosChanged', this.handleTodosChanged);
      this.claudeListenersRegistered = false;
    }
    this.rooms.clear();
    this.tabToSession.clear();
  }
}

let connectionManager: ConnectionManager | null = null;

export function getConnectionManager(): ConnectionManager {
  if (!connectionManager) {
    connectionManager = new ConnectionManager();
  }
  return connectionManager;
}

export function resetConnectionManager(): void {
  if (connectionManager) {
    connectionManager.cleanup();
    connectionManager = null;
  }
}
