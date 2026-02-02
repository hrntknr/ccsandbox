/**
 * Claude session manager using Agent SDK
 *
 * This module provides backward-compatible API with the old claude.service.ts
 * while using the Agent SDK internally.
 */

import { EventEmitter } from 'node:events';
import { resolve, normalize } from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import { ClaudeSession } from './claude-session.js';
import type {
  CreateSessionOptions,
  ClaudeProcessingStats,
  ClaudeSessionManagerEvents,
  ClaudeMessage,
  ClaudePendingPermission,
  PermissionMode,
  TodoItem,
} from './types.js';

// Re-export types for convenience
export type {
  CreateSessionOptions,
  ClaudeProcessingStats,
  ClaudeMessage,
  ClaudePendingPermission,
  PermissionMode,
  TodoItem,
};

/**
 * Validate workspace path to prevent path traversal attacks
 */
function isValidWorkspacePath(workspacePath: string): boolean {
  if (!workspacePath || typeof workspacePath !== 'string') {
    return false;
  }
  if (!workspacePath.startsWith('/')) {
    return false;
  }
  const normalized = normalize(workspacePath);
  const resolved = resolve(workspacePath);
  return normalized === resolved;
}

/**
 * Options for creating a new Claude instance (backward-compatible)
 */
export interface CreateClaudeOptions {
  sessionId: string;
  workspacePath: string;
  devcontainerCliPath?: string;
  tabId?: string;
  permissionMode?: PermissionMode;
  configPath?: string;
  remoteEnv?: string[];
  scratchDir?: string;
  /** Maximum thinking tokens for extended thinking (0 or undefined to disable) */
  maxThinkingTokens?: number;
}

/**
 * Session info exposed by ClaudeSessionManager
 */
export interface ClaudeSessionInfo {
  tabId: string;
  sessionId: string;
  isProcessing: boolean;
  permissionMode: PermissionMode;
}

/**
 * Manages Claude sessions using Agent SDK
 */
export class ClaudeSessionManager extends EventEmitter {
  private sessions = new Map<string, ClaudeSession>();
  private defaultScratchDir: string;

  constructor(scratchDir?: string) {
    super();
    this.defaultScratchDir = scratchDir ?? '/tmp/claude-wrappers';
  }

  /**
   * Create a new Claude session
   */
  async create(options: CreateClaudeOptions): Promise<string> {
    const {
      sessionId,
      workspacePath,
      devcontainerCliPath = 'devcontainer',
      tabId = uuidv4(),
      permissionMode = 'default',
      configPath,
      remoteEnv,
      scratchDir = this.defaultScratchDir,
      maxThinkingTokens,
    } = options;

    if (!isValidWorkspacePath(workspacePath)) {
      throw new Error('Invalid workspace path');
    }

    const sessionOptions: CreateSessionOptions = {
      tabId,
      sessionId,
      workspacePath,
      devcontainerCliPath,
      permissionMode,
      configPath,
      remoteEnv,
      scratchDir,
      maxThinkingTokens,
    };

    const session = new ClaudeSession(sessionOptions);
    this.sessions.set(tabId, session);

    // Forward events
    session.on('event', (event) => {
      this.emit('event', tabId, event);
    });

    session.on('exit', (code) => {
      this.emit('exit', tabId, code);
      // Emit processing state changed
      this.emit('processingStateChanged', sessionId, this.getProcessingStatsForSession(sessionId));
    });

    session.on('error', (error) => {
      this.emit('error', tabId, error);
    });

    session.on('permissionRequest', (request: ClaudePendingPermission) => {
      // Emit synthetic control_request event for frontend compatibility
      const syntheticEvent = {
        type: 'control_request',
        request_id: request.requestId,
        request: {
          subtype: 'can_use_tool',
          tool_name: request.toolName,
          input: request.input,
          tool_use_id: request.toolUseId,
        },
      };
      this.emit('event', tabId, syntheticEvent);

      // Check if pending permissions changed from none to some
      const hasPending = this.hasPendingPermissionsForSession(sessionId);
      this.emit('pendingPermissionsChanged', sessionId, hasPending);
    });

    session.on('pendingPermissionsChanged', (hasPending) => {
      const actuallyHasPending = this.hasPendingPermissionsForSession(sessionId);
      this.emit('pendingPermissionsChanged', sessionId, actuallyHasPending);
    });

    session.on('processingStateChanged', () => {
      this.emit('processingStateChanged', sessionId, this.getProcessingStatsForSession(sessionId));
    });

    session.on('todosChanged', (todos) => {
      this.emit('todosChanged', tabId, todos);
    });

    session.on('permissionModeChanged', (mode) => {
      this.emit('permissionModeChanged', tabId, mode);
    });

    // Emit initial processing state
    this.emit('processingStateChanged', sessionId, this.getProcessingStatsForSession(sessionId));

    // Start the session
    await session.start();

    return tabId;
  }

  /**
   * Send a user message to Claude
   */
  sendMessage(tabId: string, content: string): ClaudeMessage | null {
    const session = this.sessions.get(tabId);
    if (!session) {
      return null;
    }
    return session.send(content);
  }

  /**
   * Respond to a permission request
   */
  respondToPermission(
    tabId: string,
    requestId: string,
    permission: 'allow' | 'deny',
    answers?: Record<string, string>
  ): boolean {
    const session = this.sessions.get(tabId);
    if (!session) {
      return false;
    }
    return session.respondToPermission(requestId, permission, answers);
  }

  /**
   * Get all messages for a session
   */
  getMessages(tabId: string): ClaudeMessage[] {
    const session = this.sessions.get(tabId);
    return session?.getMessages() ?? [];
  }

  /**
   * Get pending permissions for a session
   */
  getPendingPermissions(tabId: string): ClaudePendingPermission[] {
    const session = this.sessions.get(tabId);
    return session?.getPendingPermissions() ?? [];
  }

  /**
   * Get todos for a session
   */
  getTodos(tabId: string): TodoItem[] {
    const session = this.sessions.get(tabId);
    return session?.getTodos() ?? [];
  }

  /**
   * Get session info by tabId
   */
  get(tabId: string): ClaudeSessionInfo | undefined {
    const session = this.sessions.get(tabId);
    if (!session) {
      return undefined;
    }
    return {
      tabId: session.tabId,
      sessionId: session.sessionId,
      isProcessing: session.isProcessing,
      permissionMode: session.permissionMode,
    };
  }

  /**
   * Set permission mode dynamically
   */
  async setPermissionMode(tabId: string, permissionMode: PermissionMode): Promise<boolean> {
    const session = this.sessions.get(tabId);
    if (!session) {
      return false;
    }
    return session.setPermissionMode(permissionMode);
  }

  /**
   * Get all sessions for a session ID
   */
  getBySession(sessionId: string): ClaudeSessionInfo[] {
    return Array.from(this.sessions.values())
      .filter((s) => s.sessionId === sessionId)
      .map((s) => ({
        tabId: s.tabId,
        sessionId: s.sessionId,
        isProcessing: s.isProcessing,
        permissionMode: s.permissionMode,
      }));
  }

  /**
   * Check if any session has pending permissions
   */
  hasPendingPermissionsForSession(sessionId: string): boolean {
    const sessions = Array.from(this.sessions.values()).filter((s) => s.sessionId === sessionId);
    return sessions.some((s) => s.getPendingPermissions().length > 0);
  }

  /**
   * Get processing stats for a session
   */
  getProcessingStatsForSession(sessionId: string): ClaudeProcessingStats {
    const sessions = Array.from(this.sessions.values()).filter((s) => s.sessionId === sessionId);
    const running = sessions.filter((s) => s.isProcessing).length;
    return { running, total: sessions.length };
  }

  /**
   * Interrupt the current processing for a Claude tab
   * Unlike kill(), this keeps the session alive for continued conversation
   */
  async interrupt(tabId: string): Promise<boolean> {
    const session = this.sessions.get(tabId);
    if (!session) {
      return false;
    }
    return session.interrupt();
  }

  /**
   * Kill a session
   */
  kill(tabId: string): boolean {
    const session = this.sessions.get(tabId);
    if (!session) {
      return false;
    }

    const sessionId = session.sessionId;
    session.close();
    this.sessions.delete(tabId);

    // Emit processing state changed
    this.emit('processingStateChanged', sessionId, this.getProcessingStatsForSession(sessionId));

    return true;
  }

  /**
   * Kill all sessions for a session ID
   */
  killBySession(sessionId: string): void {
    const sessions = Array.from(this.sessions.entries()).filter(([, s]) => s.sessionId === sessionId);
    for (const [tabId] of sessions) {
      this.kill(tabId);
    }
  }

  /**
   * Kill all sessions
   */
  killAll(): void {
    for (const tabId of this.sessions.keys()) {
      this.kill(tabId);
    }
  }

  /**
   * Get the number of active sessions
   */
  get size(): number {
    return this.sessions.size;
  }
}

// Singleton instance
let sessionManager: ClaudeSessionManager | null = null;

/**
 * Get the singleton ClaudeSessionManager instance
 */
export function getClaudeSessionManager(): ClaudeSessionManager {
  if (!sessionManager) {
    sessionManager = new ClaudeSessionManager();
  }
  return sessionManager;
}

/**
 * Reset the singleton instance (for testing)
 */
export function resetClaudeSessionManager(): void {
  if (sessionManager) {
    sessionManager.killAll();
    sessionManager = null;
  }
}

// Backward-compatible aliases
export { ClaudeSessionManager as ClaudeManager };
export { getClaudeSessionManager as getClaudeManager };
export { resetClaudeSessionManager as resetClaudeManager };
