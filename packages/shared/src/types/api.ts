import type { Session } from './session.js';

// API Request types
export interface CreateSessionRequest {
  title: string;
  repo: string;
  baseBranch: string;
  workBranch: string;
}

export interface UpdateSessionRequest {
  title?: string;
  state?: Session['state'];
}

// API Response types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface SessionResponse {
  session: Session;
}

export interface SessionListResponse {
  sessions: Session[];
}

// WebSocket message types
export type WebSocketMessageType =
  | 'terminal:input'
  | 'terminal:output'
  | 'terminal:resize'
  | 'session:state'
  | 'error';

export interface WebSocketMessage<T = unknown> {
  type: WebSocketMessageType;
  payload: T;
}

export interface TerminalInputPayload {
  tabId: string;
  data: string;
}

export interface TerminalOutputPayload {
  tabId: string;
  data: string;
}

export interface TerminalResizePayload {
  tabId: string;
  cols: number;
  rows: number;
}

export interface SessionStatePayload {
  sessionId: string;
  state: Session['state'];
}

export interface ErrorPayload {
  message: string;
  code?: string;
}

/**
 * Editable configuration (stored in config.json)
 */
export interface EditableConfig {
  pat?: string;
  apiBase?: string;
  dotfilesRepository?: string;
  dotfilesTargetPath?: string;
  dotfilesInstallCommand?: string;
  defaultShell?: string;
}

/**
 * Request to update configuration
 */
export interface UpdateConfigRequest {
  pat?: string;
  apiBase?: string;
  dotfilesRepository?: string;
  dotfilesTargetPath?: string;
  dotfilesInstallCommand?: string;
  defaultShell?: string;
}

/**
 * Client-safe configuration exposed via API
 * (PAT is exposed only as hasPat boolean for security)
 */
export interface ClientConfig {
  hasPat: boolean;
  apiBase: string;
  dotfilesRepository?: string;
  dotfilesTargetPath?: string;
  dotfilesInstallCommand?: string;
  defaultShell?: string;
}
