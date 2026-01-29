import type { WebSocket } from 'ws';
import type { TerminalTab, TerminalServerMessage } from '@ccsandbox/shared';
import type { TerminalManager } from '../services/terminal.service.js';

export interface ClientConnection {
  ws: WebSocket;
  clientId: string;
  currentTabId: string | null;
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
  private listenersRegistered = false;

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

    // Notify clients watching this tab about the exit
    this.broadcastToTab(sessionId, tabId, {
      type: 'exit',
      tabId,
      code,
    } satisfies TerminalServerMessage);

    // Clear currentTabId for all clients watching this tab
    const room = this.rooms.get(sessionId);
    if (room) {
      for (const client of room.clients.values()) {
        if (client.currentTabId === tabId) {
          client.currentTabId = null;
        }
      }
    }

    // Remove the tab from the session
    this.removeTab(sessionId, tabId);

    // Notify all clients in the session that the tab was removed
    this.broadcast(sessionId, {
      type: 'tab-removed',
      tabId,
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

  broadcastToTab(sessionId: string, tabId: string, message: unknown): void {
    const room = this.rooms.get(sessionId);
    if (!room) return;

    const data = JSON.stringify(message);
    for (const client of room.clients.values()) {
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

  cleanup(): void {
    if (this.terminalManager && this.listenersRegistered) {
      this.terminalManager.off('data', this.handleTerminalData);
      this.terminalManager.off('exit', this.handleTerminalExit);
      this.terminalManager.off('error', this.handleTerminalError);
      this.listenersRegistered = false;
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
