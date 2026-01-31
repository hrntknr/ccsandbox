import type { DevcontainerSource } from './template.js';

export type SessionState = 'STOPPED' | 'RUNNING' | 'ERROR';

export type TabType = 'shell' | 'claude';

export interface TerminalTab {
  tabId: string;
  title: string;
  shell: string;
  tabType: TabType;
  exited?: boolean;
  ready?: boolean;
}

export interface ClaudeStats {
  running: number; // Number of Claude tabs with isProcessing === true
  total: number; // Total number of Claude tabs in the session
}

export interface Session {
  sessionId: string;
  title: string;
  repo: string; // owner/name
  apiBase: string;
  baseBranch: string;
  workBranch: string;
  workspacePath: string;
  state: SessionState;
  createdAt: string; // ISO 8601
  containerId?: string;
  containerName?: string;
  shell?: string;
  hasPendingPermissions?: boolean;
  claudeStats?: ClaudeStats;
  /** Source of devcontainer configuration */
  devcontainerSource?: DevcontainerSource;
}

/**
 * WebSocket messages for session synchronization across browser tabs.
 */
export type SessionSyncServerMessage =
  | { type: 'sessions-sync'; sessions: Session[] }
  | { type: 'session-created'; session: Session }
  | { type: 'session-updated'; session: Session }
  | { type: 'session-deleted'; sessionId: string };
