import type { Session, TabType, TerminalTab } from './session.js';
import type { ClaudeMessage, ClaudePendingPermission, ImageAttachment, PermissionMode, TodoItem } from './claude.js';
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
  | { type: 'add-tab'; title?: string; tabType?: TabType; initialCommand?: string }
  | { type: 'close-tab'; tabId: string }
  | { type: 'rename-tab'; tabId: string; title: string }
  | { type: 'switch-tab'; tabId: string }
  | { type: 'input'; data: string }
  | { type: 'resize'; cols: number; rows: number }
  | { type: 'detach' }
  // Heartbeat
  | { type: 'pong'; timestamp: number }
  // Claude-specific messages
  | { type: 'claude-message'; content: string; images?: ImageAttachment[]; permissionMode?: PermissionMode }
  | {
      type: 'claude-permission-response';
      requestId: string;
      permission: 'allow' | 'deny';
      /** Answers for AskUserQuestion tool (key: question text, value: selected label(s)) */
      answers?: Record<string, string>;
      /** Permission mode to set (for ExitPlanMode) */
      permissionMode?: PermissionMode;
    }
  | { type: 'claude-change-permission-mode'; permissionMode: PermissionMode }
  | { type: 'claude-interrupt' }
  | { type: 'claude-clear' };

/**
 * Messages sent from server to client
 */
export type TerminalServerMessage =
  | { type: 'sync-state'; tabs: TerminalTab[] }
  | { type: 'tab-added'; tab: TerminalTab; requesterId?: string }
  | { type: 'tab-removed'; tabId: string }
  | { type: 'tab-renamed'; tabId: string; title: string }
  | { type: 'tab-ready'; tabId: string }
  | { type: 'history'; tabId?: string; data: string }
  | { type: 'output'; tabId: string; data: string }
  | { type: 'attached'; tabId: string }
  | { type: 'error'; tabId?: string; message: string }
  | { type: 'exit'; tabId: string; code: number }
  | { type: 'resize-sync'; cols: number; rows: number }
  // Heartbeat
  | { type: 'ping'; timestamp: number }
  // Claude-specific messages (event is SDK's SDKMessage type)
  | { type: 'claude-event'; tabId: string; event: unknown }
  | {
      type: 'claude-history';
      tabId: string;
      messages: ClaudeMessage[];
      pendingPermissions: ClaudePendingPermission[];
      todos: TodoItem[];
      permissionMode?: PermissionMode;
      isProcessing?: boolean;
      planFilePath?: string;
    }
  | { type: 'claude-permission-resolved'; tabId: string; requestId: string }
  | { type: 'claude-user-message'; tabId: string; message: ClaudeMessage }
  | { type: 'claude-todos-updated'; tabId: string; todos: TodoItem[] }
  | { type: 'claude-permission-mode-changed'; tabId: string; mode: PermissionMode }
  | { type: 'claude-plan-file-path-changed'; tabId: string; planFilePath: string }
  | { type: 'claude-cleared'; tabId: string };

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
  /** Whether to mount Claude settings from host to container (default: true) */
  mountClaudeSettings?: boolean;
};

/**
 * Messages sent from server to client during session creation
 */
export type SessionCreateServerMessage =
  | { type: 'session-log'; data: string }
  | { type: 'session-created'; session: Session }
  | { type: 'session-error'; message: string };
