// Types
export type {
  Session,
  SessionState,
  SessionSyncServerMessage,
  TabType,
  TerminalTab,
} from './types/session.js';

export type {
  ClaudeAssistantEvent,
  ClaudeContentBlock,
  ClaudeControlRequestEvent,
  ClaudeEvent,
  ClaudeMessage,
  ClaudePendingPermission,
  ClaudePermissionMode,
  ClaudePermissionRequest,
  ClaudeResultEvent,
  ClaudeStreamEvent,
  ClaudeStreamEventDetail,
  ClaudeSystemInitEvent,
  ClaudeUserEvent,
} from './types/claude.js';

export type { Repository } from './types/github.js';

export type {
  ContainerInfo,
  DevcontainerUpResult,
} from './types/container.js';

export type {
  CreateSessionRequest,
  UpdateSessionRequest,
  ApiResponse,
  SessionResponse,
  SessionListResponse,
  WebSocketMessageType,
  WebSocketMessage,
  TerminalInputPayload,
  TerminalOutputPayload,
  TerminalResizePayload,
  SessionStatePayload,
  ErrorPayload,
  EditableConfig,
  UpdateConfigRequest,
  ClientConfig,
  DiffStats,
  DiffLine,
  DiffHunk,
  FileDiff,
  DiffStatsResponse,
  DiffDetailResponse,
} from './types/api.js';

export type {
  TerminalClientMessage,
  TerminalServerMessage,
  SessionCreateClientMessage,
  SessionCreateServerMessage,
} from './types/terminal.js';

// Utilities
export { escapeBranchName } from './utils/branch-escape.js';
export {
  extractRepoName,
  generateWorkspaceDirName,
  generateWorkspacePath,
} from './utils/workspace-path.js';
