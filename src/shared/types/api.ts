import type { Session } from './session.js';
import type { DevcontainerTemplate } from './template.js';
import type { PermissionMode } from './claude.js';

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
  /** Authentication token (random, stored as plaintext) */
  authToken?: string;
  /** Authentication password hash (bcrypt) */
  authPasswordHash?: string;
  /** Maximum thinking tokens for Claude extended thinking (0 to disable) */
  maxThinkingTokens?: number;
  /** Default permission mode for Claude tabs */
  defaultPermissionMode?: PermissionMode;
  /** Speech recognition language (BCP 47 format, e.g., "ja-JP", "en-US") */
  speechRecognitionLanguage?: string;
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
  /** Plaintext password (will be hashed on server side) */
  authPassword?: string;
  /** Maximum thinking tokens for Claude extended thinking (0 to disable) */
  maxThinkingTokens?: number;
  /** Default permission mode for Claude tabs */
  defaultPermissionMode?: PermissionMode;
  /** Speech recognition language (BCP 47 format, e.g., "ja-JP", "en-US") */
  speechRecognitionLanguage?: string;
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
  /** Whether a password has been set for authentication */
  hasAuthPassword: boolean;
  /** Available devcontainer templates */
  templates: DevcontainerTemplate[];
  /** Maximum thinking tokens for Claude extended thinking (0 to disable) */
  maxThinkingTokens?: number;
  /** Default permission mode for Claude tabs */
  defaultPermissionMode?: PermissionMode;
  /** Speech recognition language (BCP 47 format, e.g., "ja-JP", "en-US") */
  speechRecognitionLanguage?: string;
}

// Diff types
export interface DiffStats {
  insertions: number;
  deletions: number;
  filesChanged: number;
}

export interface DiffLine {
  type: 'context' | 'add' | 'delete';
  content: string;
}

export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: DiffLine[];
}

export interface FileDiff {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  insertions: number;
  deletions: number;
  hunks: DiffHunk[];
}

export interface DiffStatsResponse {
  stats: DiffStats;
}

export interface DiffDetailResponse {
  files: FileDiff[];
  stats: DiffStats;
}

// Git status types
export interface GitStatus {
  /** Whether there are uncommitted changes (staged, unstaged, or untracked files) */
  hasUncommittedChanges: boolean;
  /** Whether there are unpushed commits on the current branch */
  hasUnpushedCommits: boolean;
  /** Number of uncommitted files */
  uncommittedFileCount: number;
  /** Number of unpushed commits */
  unpushedCommitCount: number;
  /** Current branch name */
  currentBranch: string | null;
}

export interface GitStatusResponse {
  status: GitStatus;
}

// Port forwarding types
export interface AddPortForwardingRequest {
  hostPort: number;
  containerPort: number;
  label?: string;
}

export interface PortForwardingListResponse {
  portForwardings: import('./session.js').PortForwarding[];
}

// Port detection types
export interface DetectedPort {
  port: number;
  protocol: 'tcp' | 'tcp6';
  processName: string;
  pid?: number;
}

export interface DetectedPortsResponse {
  detectedPorts: DetectedPort[];
}
