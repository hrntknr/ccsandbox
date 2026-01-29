import type { Session, TerminalTab } from './session.js';

/**
 * Terminal WebSocket message types
 */

/**
 * Messages sent from client to server
 */
export type TerminalClientMessage =
  | { type: 'join-session'; sessionId: string; clientId: string }
  | { type: 'attach'; tabId: string }
  | { type: 'add-tab'; title?: string }
  | { type: 'close-tab'; tabId: string }
  | { type: 'rename-tab'; tabId: string; title: string }
  | { type: 'switch-tab'; tabId: string }
  | { type: 'input'; data: string }
  | { type: 'resize'; cols: number; rows: number }
  | { type: 'detach' };

/**
 * Messages sent from server to client
 */
export type TerminalServerMessage =
  | { type: 'sync-state'; tabs: TerminalTab[] }
  | { type: 'tab-added'; tab: TerminalTab }
  | { type: 'tab-removed'; tabId: string }
  | { type: 'tab-renamed'; tabId: string; title: string }
  | { type: 'history'; data: string }
  | { type: 'output'; data: string }
  | { type: 'attached'; tabId: string }
  | { type: 'error'; message: string }
  | { type: 'exit'; tabId: string; code: number };

/**
 * Session creation WebSocket message types
 */

/**
 * Messages sent from client to server for session creation
 */
export type SessionCreateClientMessage = {
  type: 'create-session';
  title?: string;
  repo: string;
  baseBranch: string;
  workBranch: string;
};

/**
 * Messages sent from server to client during session creation
 */
export type SessionCreateServerMessage =
  | { type: 'session-log'; data: string }
  | { type: 'session-created'; session: Session }
  | { type: 'session-error'; message: string };
