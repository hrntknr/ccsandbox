import { WebSocket } from 'ws';
import type { Session, SessionSyncServerMessage } from '../shared/index.js';

/**
 * Manages WebSocket connections for session synchronization.
 * Broadcasts session changes to all connected clients.
 */
export class SessionSyncManager {
  private clients: Set<WebSocket> = new Set();

  /**
   * Adds a client to the sync group.
   */
  addClient(ws: WebSocket): void {
    this.clients.add(ws);
  }

  /**
   * Removes a client from the sync group.
   */
  removeClient(ws: WebSocket): void {
    this.clients.delete(ws);
  }

  /**
   * Broadcasts a message to all connected clients.
   */
  private broadcast(message: SessionSyncServerMessage): void {
    const data = JSON.stringify(message);
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    }
  }

  /**
   * Sends the initial session list to a specific client.
   */
  sendInitialSync(ws: WebSocket, sessions: Session[]): void {
    if (ws.readyState === WebSocket.OPEN) {
      const message: SessionSyncServerMessage = {
        type: 'sessions-sync',
        sessions,
      };
      ws.send(JSON.stringify(message));
    }
  }

  /**
   * Broadcasts a session creation event.
   */
  broadcastCreated(session: Session): void {
    this.broadcast({ type: 'session-created', session });
  }

  /**
   * Broadcasts a session update event.
   */
  broadcastUpdated(session: Session): void {
    this.broadcast({ type: 'session-updated', session });
  }

  /**
   * Broadcasts a session deletion event.
   */
  broadcastDeleted(sessionId: string): void {
    this.broadcast({ type: 'session-deleted', sessionId });
  }

  /**
   * Gets the number of connected clients.
   */
  getClientCount(): number {
    return this.clients.size;
  }
}

// Singleton instance
let sessionSyncManagerInstance: SessionSyncManager | null = null;

/**
 * Gets the singleton SessionSyncManager instance.
 */
export function getSessionSyncManager(): SessionSyncManager {
  if (!sessionSyncManagerInstance) {
    sessionSyncManagerInstance = new SessionSyncManager();
  }
  return sessionSyncManagerInstance;
}

/**
 * Resets the singleton SessionSyncManager instance (for testing).
 */
export function resetSessionSyncManager(): void {
  sessionSyncManagerInstance = null;
}
