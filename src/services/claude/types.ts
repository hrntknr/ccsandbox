/**
 * Types for Claude session management using Agent SDK
 */

import type {
  SDKMessage,
  SDKUserMessage,
  PermissionResult,
  PermissionMode,
} from '@anthropic-ai/claude-agent-sdk';
import type {
  ClaudeMessage,
  ClaudePendingPermission,
  ImageAttachment,
  TodoItem,
} from '../../shared/types/claude.js';

// Re-export SDK types for convenience
export type { SDKMessage, SDKUserMessage, PermissionResult, PermissionMode };

// Re-export internal types from shared
export type {
  ClaudeMessage,
  ClaudePendingPermission,
  ImageAttachment,
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
  permissionMode?: PermissionMode;
  /** Path to devcontainer.json config (for template-based sessions) */
  configPath?: string;
  /** Remote environment variables to pass to the container */
  remoteEnv?: string[];
  /** Directory to store wrapper scripts */
  scratchDir: string;
  /** Maximum thinking tokens for extended thinking (0 or undefined to disable) */
  maxThinkingTokens?: number;
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
  permissionModeChanged: (tabId: string, mode: PermissionMode) => void;
}
