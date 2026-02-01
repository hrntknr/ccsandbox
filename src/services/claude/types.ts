/**
 * Types for Claude session management using Agent SDK
 */

import type { SDKMessage, PermissionResult, PermissionMode } from '@anthropic-ai/claude-agent-sdk';
import type {
  ClaudeMessage,
  ClaudePendingPermission,
  ClaudePermissionMode,
  TodoItem,
} from '../../shared/types/claude.js';

// Re-export SDK types for convenience
export type { SDKMessage, PermissionResult, PermissionMode };

// Re-export internal types from shared
export type {
  ClaudeMessage,
  ClaudePendingPermission,
  ClaudePermissionMode,
  TodoItem,
};

/**
 * Options for creating a Claude session
 */
export interface CreateSessionOptions {
  /** Unique identifier for this tab */
  tabId: string;
  /** Session ID this tab belongs to */
  sessionId: string;
  /** Path to the workspace inside devcontainer */
  workspacePath: string;
  /** Path to devcontainer CLI executable */
  devcontainerCliPath?: string;
  /** Initial permission mode */
  permissionMode?: ClaudePermissionMode;
  /** Path to devcontainer.json config (for template-based sessions) */
  configPath?: string;
  /** Remote environment variables to pass to the container */
  remoteEnv?: string[];
  /** Directory to store wrapper scripts */
  scratchDir: string;
}

/**
 * Pending permission resolver
 */
export interface PermissionResolver {
  resolve: (
    permission: 'allow' | 'deny',
    answers?: Record<string, string>
  ) => void;
}

/**
 * Processing stats for a session's Claude instances
 */
export interface ClaudeProcessingStats {
  running: number;
  total: number;
}

/**
 * Events emitted by ClaudeSessionManager
 */
export interface ClaudeSessionManagerEvents {
  event: (tabId: string, event: SDKMessage) => void;
  exit: (tabId: string, code: number) => void;
  error: (tabId: string, error: Error) => void;
  pendingPermissionsChanged: (sessionId: string, hasPending: boolean) => void;
  processingStateChanged: (sessionId: string, stats: ClaudeProcessingStats) => void;
  todosChanged: (tabId: string, todos: TodoItem[]) => void;
  permissionModeChanged: (tabId: string, mode: ClaudePermissionMode) => void;
}

/**
 * Map internal ClaudePermissionMode to SDK PermissionMode
 */
export function toSdkPermissionMode(mode: ClaudePermissionMode): PermissionMode {
  switch (mode) {
    case 'default':
      return 'default';
    case 'acceptEdits':
      return 'acceptEdits';
    case 'plan':
      return 'plan';
    case 'bypassPermissions':
      return 'bypassPermissions';
    default:
      return 'default';
  }
}

/**
 * Map SDK PermissionMode to internal ClaudePermissionMode
 */
export function fromSdkPermissionMode(mode: PermissionMode): ClaudePermissionMode {
  switch (mode) {
    case 'default':
      return 'default';
    case 'acceptEdits':
      return 'acceptEdits';
    case 'plan':
      return 'plan';
    case 'bypassPermissions':
      return 'bypassPermissions';
    default:
      return 'default';
  }
}
