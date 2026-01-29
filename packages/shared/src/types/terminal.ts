import type { Session } from './session.js';

/**
 * Terminal WebSocket message types
 */

/**
 * Messages sent from client to server
 */
export type TerminalClientMessage =
  | { type: 'attach'; sessionId: string; tabId?: string }
  | { type: 'input'; data: string }
  | { type: 'resize'; cols: number; rows: number }
  | { type: 'detach' }
  | { type: 'close-tab'; tabId: string };

/**
 * Messages sent from server to client
 */
export type TerminalServerMessage =
  | { type: 'output'; data: string }
  | { type: 'attached'; tabId: string }
  | { type: 'error'; message: string }
  | { type: 'exit'; code: number };

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
