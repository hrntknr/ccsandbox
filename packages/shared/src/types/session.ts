export type SessionState = 'READY' | 'RUNNING' | 'ERROR';

export interface TerminalTab {
  tabId: string;
  title: string;
  shell: string;
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
}

/**
 * WebSocket messages for session synchronization across browser tabs.
 */
export type SessionSyncServerMessage =
  | { type: 'sessions-sync'; sessions: Session[] }
  | { type: 'session-created'; session: Session }
  | { type: 'session-updated'; session: Session }
  | { type: 'session-deleted'; sessionId: string };
