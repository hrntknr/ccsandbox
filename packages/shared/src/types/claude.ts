/**
 * Claude Code CLI related types
 */

/**
 * Permission mode for Claude CLI
 * - 'default': Normal mode with permission prompts
 * - 'acceptEdits': Accept file edits automatically
 * - 'plan': Plan mode (no code edits)
 * - 'bypassPermissions': Auto mode (bypass permission prompts)
 */
export type ClaudePermissionMode = 'default' | 'acceptEdits' | 'plan' | 'bypassPermissions';

/**
 * Stream event types from Claude CLI stdout
 */
export interface ClaudeStreamEventBase {
  session_id?: string;
}

export interface ClaudeSystemInitEvent extends ClaudeStreamEventBase {
  type: 'system';
  subtype: 'init';
  tools: unknown[];
  model: string;
}

export interface ClaudeStreamEventDetail {
  type:
    | 'message_start'
    | 'content_block_start'
    | 'content_block_delta'
    | 'content_block_stop'
    | 'message_delta'
    | 'message_stop';
  index?: number;
  delta?: {
    type: string;
    text?: string;
    partial_json?: string;
  };
  content_block?: {
    type: string;
    id?: string;
    name?: string;
    input?: Record<string, unknown>;
  };
  message?: {
    id?: string;
    role?: string;
    model?: string;
    stop_reason?: string;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
    };
  };
}

export interface ClaudeStreamEvent extends ClaudeStreamEventBase {
  type: 'stream_event';
  event: ClaudeStreamEventDetail;
}

export interface ClaudeContentBlock {
  type: 'text' | 'tool_use' | 'tool_result';
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string;
  is_error?: boolean;
}

export interface ClaudeAssistantEvent extends ClaudeStreamEventBase {
  type: 'assistant';
  message: {
    role: 'assistant';
    content: ClaudeContentBlock[];
    id?: string;
    model?: string;
    stop_reason?: string;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
    };
  };
}

export interface ClaudeUserEvent extends ClaudeStreamEventBase {
  type: 'user';
  message: {
    role: 'user';
    content: ClaudeContentBlock[];
  };
  tool_use_result?: string;
}

export interface ClaudePermissionRequest {
  subtype: 'can_use_tool';
  tool_name: string;
  input: Record<string, unknown>;
  tool_use_id: string;
  permission_suggestions?: unknown[];
}

export interface ClaudeControlRequestEvent extends ClaudeStreamEventBase {
  type: 'control_request';
  request_id: string;
  request: ClaudePermissionRequest;
}

export interface ClaudeResultEvent extends ClaudeStreamEventBase {
  type: 'result';
  subtype: 'success' | 'error';
  result?: string;
  error?: string;
  duration_ms?: number;
  num_turns?: number;
  total_cost_usd?: number;
  is_error?: boolean;
}

export type ClaudeEvent =
  | ClaudeSystemInitEvent
  | ClaudeStreamEvent
  | ClaudeAssistantEvent
  | ClaudeUserEvent
  | ClaudeControlRequestEvent
  | ClaudeResultEvent;

/**
 * Processed message for UI display
 */
export interface ClaudeMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  toolUse?: {
    id: string;
    name: string;
    input: Record<string, unknown>;
  }[];
  toolResults?: {
    toolUseId: string;
    content: string;
    isError?: boolean;
  }[];
  timestamp: string;
  isStreaming?: boolean;
}

/**
 * Pending permission request
 */
export interface ClaudePendingPermission {
  requestId: string;
  toolName: string;
  input: Record<string, unknown>;
  toolUseId: string;
  timestamp: string;
}
