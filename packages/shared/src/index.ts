// Types
export type {
  Session,
  SessionState,
  SessionSyncServerMessage,
  TerminalTab,
} from './types/session.js';

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
  ClientConfig,
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
