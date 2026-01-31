import type { Session, TabType, TerminalTab } from './session.js';
import type { ClaudeEvent, ClaudeMessage, ClaudePendingPermission, ClaudePermissionMode } from './claude.js';
import type { DevcontainerSource } from './template.js';

/**
 * Terminal WebSocket message types
 */

/**
 * Messages sent from client to server
 */
export type TerminalClientMessage =
  | { type: 'join-session'; sessionId: string; clientId: string }
  | { type: 'attach'; tabId: string }
  | { type: 'add-tab'; title?: string; tabType?: TabType }
  | { type: 'close-tab'; tabId: string }
  | { type: 'rename-tab'; tabId: string; title: string }
  | { type: 'switch-tab'; tabId: string }
  | { type: 'input'; data: string }
  | { type: 'resize'; cols: number; rows: number }
  | { type: 'detach' }
  // Claude-specific messages
  | { type: 'claude-message'; content: string; permissionMode?: ClaudePermissionMode }
  | {
      type: 'claude-permission-response';
      requestId: string;
      permission: 'allow' | 'deny';
      /** Answers for AskUserQuestion tool (key: question text, value: selected label(s)) */
      answers?: Record<string, string>;
    };

/**
 * Messages sent from server to client
 */
export type TerminalServerMessage =
  | { type: 'sync-state'; tabs: TerminalTab[] }
  | { type: 'tab-added'; tab: TerminalTab; requesterId?: string }
  | { type: 'tab-removed'; tabId: string }
  | { type: 'tab-renamed'; tabId: string; title: string }
  | { type: 'tab-ready'; tabId: string }
  | { type: 'history'; data: string }
  | { type: 'output'; data: string }
  | { type: 'attached'; tabId: string }
  | { type: 'error'; message: string }
  | { type: 'exit'; tabId: string; code: number }
  | { type: 'resize-sync'; cols: number; rows: number }
  // Claude-specific messages
  | { type: 'claude-event'; tabId: string; event: ClaudeEvent }
  | {
      type: 'claude-history';
      tabId: string;
      messages: ClaudeMessage[];
      pendingPermissions: ClaudePendingPermission[];
    };

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
  shell?: string;
  /** Source of devcontainer configuration (default: { type: 'project' }) */
  devcontainerSource?: DevcontainerSource;
};

/**
 * Messages sent from server to client during session creation
 */
export type SessionCreateServerMessage =
  | { type: 'session-log'; data: string }
  | { type: 'session-created'; session: Session }
  | { type: 'session-error'; message: string };
