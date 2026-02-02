// Types
export type {
  Session,
  SessionState,
  SessionSyncServerMessage,
  TabType,
  TerminalTab,
  PortForwarding,
} from './types/session.js';

export type {
  // Permission mode (SDK-compatible)
  PermissionMode,
  ClaudePermissionMode, // deprecated alias

  // SDK-compatible message types
  ContentBlock,
  SystemInitMessage,
  StreamEventMessage,
  AssistantMessage,
  UserMessage,
  ResultMessage,
  ControlRequestMessage,
  ClaudeEvent,

  // UI types
  ClaudeMessage,
  ClaudePendingPermission,
  ImageAttachment,
  TodoItem,
  TodoWriteResult,

  // AskUserQuestion types
  AskUserQuestion,
  AskUserQuestionInput,
  AskUserQuestionOption,
} from './types/claude.js';

export type { Repository } from './types/github.js';

export type {
  DevcontainerSource,
  DevcontainerTemplate,
} from './types/template.js';

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
  GitStatus,
  GitStatusResponse,
  AddPortForwardingRequest,
  PortForwardingListResponse,
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
