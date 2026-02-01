import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { resolve, normalize } from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import type {
  ClaudeEvent,
  ClaudeMessage,
  ClaudePendingPermission,
  ClaudePermissionMode,
  TodoItem,
} from '../shared/index.js';

/**
 * Validate workspace path to prevent path traversal attacks.
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
 * Pending control request callback
 */
interface PendingControlRequest {
  resolve: (response: ControlResponsePayload) => void;
  reject: (error: Error) => void;
}

/**
 * Control response payload from CLI
 */
interface ControlResponsePayload {
  subtype: 'success' | 'error';
  request_id: string;
  response?: unknown;
  error?: string;
}

/**
 * Information about an active Claude instance
 */
export interface ClaudeInstance {
  tabId: string;
  sessionId: string;
  workspacePath: string;
  claudeSessionId: string;
  process: ChildProcess | null;
  messages: ClaudeMessage[];
  pendingPermissions: Map<string, ClaudePendingPermission>;
  /** Pending control requests waiting for response from CLI */
  pendingControlRequests: Map<string, PendingControlRequest>;
  isProcessing: boolean;
  currentStreamingMessage: ClaudeMessage | null;
  permissionMode: ClaudePermissionMode;
  devcontainerCliPath: string;
  /** Path to devcontainer.json config (for template-based sessions) */
  configPath?: string;
  remoteEnv?: string[];
  /** Current todo list from TodoWrite tool */
  todos: TodoItem[];
}

/**
 * Processing stats for a session's Claude instances
 */
export interface ClaudeProcessingStats {
  running: number; // Number of Claude tabs with isProcessing === true
  total: number; // Total number of Claude tabs in the session
}

/**
 * Events emitted by ClaudeManager
 */
export interface ClaudeManagerEvents {
  event: (tabId: string, event: ClaudeEvent) => void;
  exit: (tabId: string, code: number) => void;
  error: (tabId: string, error: Error) => void;
  pendingPermissionsChanged: (sessionId: string, hasPending: boolean) => void;
  processingStateChanged: (sessionId: string, stats: ClaudeProcessingStats) => void;
}

/**
 * Options for creating a new Claude instance
 */
export interface CreateClaudeOptions {
  sessionId: string;
  workspacePath: string;
  devcontainerCliPath?: string;
  tabId?: string;
  permissionMode?: ClaudePermissionMode;
  /** Path to devcontainer.json config (for template-based sessions) */
  configPath?: string;
  remoteEnv?: string[];
}

/**
 * Manages Claude CLI instances
 */
export class ClaudeManager extends EventEmitter {
  private instances: Map<string, ClaudeInstance> = new Map();

  constructor() {
    super();
  }

  /**
   * Create a new Claude instance
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
    } = options;

    if (!isValidWorkspacePath(workspacePath)) {
      throw new Error('Invalid workspace path');
    }

    const claudeSessionId = uuidv4();

    const instance: ClaudeInstance = {
      tabId,
      sessionId,
      workspacePath,
      claudeSessionId,
      process: null,
      messages: [],
      pendingPermissions: new Map(),
      pendingControlRequests: new Map(),
      isProcessing: false,
      currentStreamingMessage: null,
      permissionMode,
      devcontainerCliPath,
      configPath,
      remoteEnv,
      todos: [],
    };

    this.instances.set(tabId, instance);

    // Emit processing state changed (total increased)
    this.emit('processingStateChanged', sessionId, this.getProcessingStatsForSession(sessionId));

    // Start persistent Claude process
    await this.startClaudeProcess(instance);

    return tabId;
  }

  /**
   * Start the Claude CLI process
   */
  private async startClaudeProcess(instance: ClaudeInstance): Promise<void> {
    const args = [
      'exec',
      '--workspace-folder',
      instance.workspacePath,
    ];

    // Add config path for template-based sessions
    if (instance.configPath) {
      args.push('--config', instance.configPath);
    }

    // Add remote environment variables (e.g., GITHUB_TOKEN)
    if (instance.remoteEnv) {
      for (const env of instance.remoteEnv) {
        args.push('--remote-env', env);
      }
    }

    args.push(
      'claude',
      '-p',
      '--session-id',
      instance.claudeSessionId,
      '--input-format',
      'stream-json',
      '--output-format',
      'stream-json',
      '--verbose',
      '--include-partial-messages',
      '--permission-prompt-tool',
      'stdio',
    );

    if (instance.permissionMode !== 'default') {
      args.push('--permission-mode', instance.permissionMode);
    }

    const proc = spawn(instance.devcontainerCliPath, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    instance.process = proc;

    let buffer = '';
    proc.stdout?.on('data', (data: Buffer) => {
      buffer += data.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (line.trim()) {
          try {
            const event = JSON.parse(line) as ClaudeEvent;
            this.handleEvent(instance, event);
          } catch {
            // Ignore non-JSON lines (e.g., debug output)
          }
        }
      }
    });

    proc.stderr?.on('data', (data: Buffer) => {
      console.error(`Claude stderr [${instance.tabId}]:`, data.toString());
    });

    proc.on('close', (code) => {
      const wasProcessing = instance.isProcessing;
      instance.process = null;
      instance.isProcessing = false;
      this.emit('exit', instance.tabId, code ?? 0);

      // Emit processing state changed if it was processing
      if (wasProcessing) {
        this.emit('processingStateChanged', instance.sessionId, this.getProcessingStatsForSession(instance.sessionId));
      }
    });

    proc.on('error', (err) => {
      this.emit('error', instance.tabId, err);
    });
  }

  /**
   * Handle incoming events from Claude CLI
   */
  private handleEvent(instance: ClaudeInstance, event: ClaudeEvent): void {
    // Handle control_response (response to our control_request, e.g., setPermissionMode)
    if (event.type === 'control_response') {
      const response = event.response as ControlResponsePayload;
      const pending = instance.pendingControlRequests.get(response.request_id);
      if (pending) {
        instance.pendingControlRequests.delete(response.request_id);
        if (response.subtype === 'success') {
          pending.resolve(response);
        } else {
          pending.reject(new Error(response.error ?? 'Control request failed'));
        }
      }
      // Don't emit this event to clients, it's internal
      return;
    }

    // Track pending permissions (permission requests FROM CLI)
    if (event.type === 'control_request') {
      const hadPending = instance.pendingPermissions.size > 0;
      instance.pendingPermissions.set(event.request_id, {
        requestId: event.request_id,
        toolName: event.request.tool_name,
        input: event.request.input,
        toolUseId: event.request.tool_use_id,
        timestamp: new Date().toISOString(),
      });
      // Emit event if pending permissions changed from none to some
      if (!hadPending) {
        this.emit('pendingPermissionsChanged', instance.sessionId, true);
      }
    }

    // Track processing state
    if (event.type === 'system' && event.subtype === 'init') {
      instance.isProcessing = true;

      // Emit processing state changed
      this.emit('processingStateChanged', instance.sessionId, this.getProcessingStatsForSession(instance.sessionId));

      // Start a new streaming message
      instance.currentStreamingMessage = {
        id: uuidv4(),
        role: 'assistant',
        content: '',
        timestamp: new Date().toISOString(),
        isStreaming: true,
      };
    }

    // Handle streaming content
    if (event.type === 'stream_event' && event.event.type === 'content_block_delta') {
      const delta = event.event.delta;
      if (delta?.text && instance.currentStreamingMessage) {
        instance.currentStreamingMessage.content += delta.text;
      }
    }

    // Handle assistant message completion
    if (event.type === 'assistant') {
      // Extract text content from the message
      const textContent = event.message.content
        .filter((c) => c.type === 'text')
        .map((c) => c.text ?? '')
        .join('');

      // Extract tool use (filter out TodoWrite as it's handled separately)
      const toolUse = event.message.content
        .filter((c) => c.type === 'tool_use' && c.name !== 'TodoWrite')
        .map((c) => ({
          id: c.id ?? '',
          name: c.name ?? '',
          input: c.input ?? {},
        }));

      // Finalize the streaming message or create a new one
      if (instance.currentStreamingMessage) {
        instance.currentStreamingMessage.content = textContent;
        instance.currentStreamingMessage.isStreaming = false;
        if (toolUse.length > 0) {
          instance.currentStreamingMessage.toolUse = toolUse;
        }
        instance.messages.push(instance.currentStreamingMessage);
        instance.currentStreamingMessage = null;
      } else {
        const message: ClaudeMessage = {
          id: uuidv4(),
          role: 'assistant',
          content: textContent,
          timestamp: new Date().toISOString(),
        };
        if (toolUse.length > 0) {
          message.toolUse = toolUse;
        }
        instance.messages.push(message);
      }
    }

    // Handle user messages (tool results)
    if (event.type === 'user') {
      // Check for TodoWrite tool_use_result
      const rawResult = event.tool_use_result as unknown;
      if (rawResult && typeof rawResult === 'object' && 'newTodos' in rawResult) {
        const todoResult = rawResult as { newTodos: TodoItem[] };
        instance.todos = todoResult.newTodos;
      }

      // Filter out TodoWrite tool results (they contain "Todos have been modified successfully")
      const toolResults = event.message.content
        .filter((c) => c.type === 'tool_result')
        .filter((c) => !c.content?.includes('Todos have been modified successfully'))
        .map((c) => ({
          toolUseId: c.tool_use_id ?? '',
          content: c.content ?? '',
          isError: c.is_error,
        }));

      if (toolResults.length > 0) {
        // Add tool results to the last assistant message
        const lastMessage = instance.messages[instance.messages.length - 1];
        if (lastMessage && lastMessage.role === 'assistant') {
          lastMessage.toolResults = toolResults;
        }
      }
    }

    // Handle result
    if (event.type === 'result') {
      instance.isProcessing = false;
      instance.currentStreamingMessage = null;

      // Emit processing state changed
      this.emit('processingStateChanged', instance.sessionId, this.getProcessingStatsForSession(instance.sessionId));
    }

    // Emit event to connection manager
    this.emit('event', instance.tabId, event);
  }

  /**
   * Send a user message to Claude
   * @returns The created message object, or null if sending failed
   */
  sendMessage(tabId: string, content: string): ClaudeMessage | null {
    const instance = this.instances.get(tabId);
    if (!instance?.process?.stdin?.writable) {
      return null;
    }

    const message = {
      type: 'user',
      message: { role: 'user', content },
    };

    instance.process.stdin.write(JSON.stringify(message) + '\n');

    // Add to messages history
    const userMessage: ClaudeMessage = {
      id: uuidv4(),
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
    };
    instance.messages.push(userMessage);

    return userMessage;
  }

  /**
   * Respond to a permission request
   * @param tabId - The tab ID
   * @param requestId - The permission request ID
   * @param permission - 'allow' or 'deny'
   * @param answers - For AskUserQuestion tool: map of question text to selected answer(s)
   */
  respondToPermission(
    tabId: string,
    requestId: string,
    permission: 'allow' | 'deny',
    answers?: Record<string, string>
  ): boolean {
    const instance = this.instances.get(tabId);
    if (!instance?.process?.stdin?.writable) {
      return false;
    }

    const pendingRequest = instance.pendingPermissions.get(requestId);

    // Build updatedInput for allow response
    let updatedInput: Record<string, unknown> = pendingRequest?.input ?? {};

    // For AskUserQuestion, include answers in updatedInput
    if (permission === 'allow' && answers && pendingRequest?.toolName === 'AskUserQuestion') {
      updatedInput = {
        ...updatedInput,
        answers,
      };
    }

    // Build response in the correct format for Claude CLI
    const response = {
      type: 'control_response',
      response: {
        subtype: 'success',
        request_id: requestId,
        response:
          permission === 'allow'
            ? {
                behavior: 'allow',
                updatedInput,
              }
            : {
                behavior: 'deny',
                message: 'User denied the operation',
              },
      },
    };

    instance.process.stdin.write(JSON.stringify(response) + '\n');
    instance.pendingPermissions.delete(requestId);

    // Check if any pending permissions remain for this session
    const hasPendingForSession = this.hasPendingPermissionsForSession(instance.sessionId);
    this.emit('pendingPermissionsChanged', instance.sessionId, hasPendingForSession);

    return true;
  }

  /**
   * Get all messages for a Claude instance
   */
  getMessages(tabId: string): ClaudeMessage[] {
    return this.instances.get(tabId)?.messages ?? [];
  }

  /**
   * Get pending permissions for a Claude instance
   */
  getPendingPermissions(tabId: string): ClaudePendingPermission[] {
    const instance = this.instances.get(tabId);
    return instance ? Array.from(instance.pendingPermissions.values()) : [];
  }

  /**
   * Get todos for a Claude instance
   */
  getTodos(tabId: string): TodoItem[] {
    return this.instances.get(tabId)?.todos ?? [];
  }

  /**
   * Get Claude instance by tabId
   */
  get(tabId: string): ClaudeInstance | undefined {
    return this.instances.get(tabId);
  }

  /**
   * Send a control_request to the CLI and wait for response
   */
  private sendControlRequest(
    instance: ClaudeInstance,
    request: Record<string, unknown>,
    timeoutMs = 10000
  ): Promise<ControlResponsePayload> {
    return new Promise((resolve, reject) => {
      if (!instance.process?.stdin?.writable) {
        reject(new Error('Process stdin not writable'));
        return;
      }

      const requestId = uuidv4();
      const controlRequest = {
        type: 'control_request',
        request_id: requestId,
        request,
      };

      // Set up timeout
      const timeout = setTimeout(() => {
        instance.pendingControlRequests.delete(requestId);
        reject(new Error('Control request timed out'));
      }, timeoutMs);

      // Register pending request
      instance.pendingControlRequests.set(requestId, {
        resolve: (response) => {
          clearTimeout(timeout);
          resolve(response);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        },
      });

      // Send request
      instance.process.stdin.write(JSON.stringify(controlRequest) + '\n');
    });
  }

  /**
   * Set permission mode dynamically without restarting the process
   * Uses control_request to change mode mid-session
   */
  async setPermissionMode(
    tabId: string,
    permissionMode: ClaudePermissionMode
  ): Promise<boolean> {
    const instance = this.instances.get(tabId);
    if (!instance) {
      return false;
    }

    // No change needed
    if (instance.permissionMode === permissionMode) {
      return true;
    }

    // If process is not running, just update the mode (will be used on next start)
    if (!instance.process?.stdin?.writable) {
      instance.permissionMode = permissionMode;
      return true;
    }

    try {
      // Send control_request to change permission mode
      await this.sendControlRequest(instance, {
        subtype: 'set_permission_mode',
        mode: permissionMode,
      });

      // Update local state
      instance.permissionMode = permissionMode;
      return true;
    } catch (error) {
      console.error(`Failed to set permission mode for ${tabId}:`, error);
      return false;
    }
  }

  /**
   * Get all Claude instances for a session
   */
  getBySession(sessionId: string): ClaudeInstance[] {
    return Array.from(this.instances.values()).filter(
      (i) => i.sessionId === sessionId
    );
  }

  /**
   * Check if any Claude instance for a session has pending permissions
   */
  hasPendingPermissionsForSession(sessionId: string): boolean {
    const instances = this.getBySession(sessionId);
    return instances.some((i) => i.pendingPermissions.size > 0);
  }

  /**
   * Get processing stats for a session's Claude instances
   */
  getProcessingStatsForSession(sessionId: string): ClaudeProcessingStats {
    const instances = this.getBySession(sessionId);
    const running = instances.filter((i) => i.isProcessing).length;
    return { running, total: instances.length };
  }

  /**
   * Kill a Claude instance
   */
  kill(tabId: string): boolean {
    const instance = this.instances.get(tabId);
    if (!instance) {
      return false;
    }

    const sessionId = instance.sessionId;

    if (instance.process) {
      instance.process.kill('SIGTERM');
    }
    this.instances.delete(tabId);

    // Emit processing state changed (total decreased)
    this.emit('processingStateChanged', sessionId, this.getProcessingStatsForSession(sessionId));

    return true;
  }

  /**
   * Kill all Claude instances for a session
   */
  killBySession(sessionId: string): void {
    const instances = this.getBySession(sessionId);
    for (const instance of instances) {
      this.kill(instance.tabId);
    }
  }

  /**
   * Kill all Claude instances
   */
  killAll(): void {
    for (const tabId of this.instances.keys()) {
      this.kill(tabId);
    }
  }

  /**
   * Get the number of active Claude instances
   */
  get size(): number {
    return this.instances.size;
  }
}

// Singleton instance
let claudeManager: ClaudeManager | null = null;

/**
 * Get the singleton ClaudeManager instance
 */
export function getClaudeManager(): ClaudeManager {
  if (!claudeManager) {
    claudeManager = new ClaudeManager();
  }
  return claudeManager;
}

/**
 * Reset the singleton instance (for testing)
 */
export function resetClaudeManager(): void {
  if (claudeManager) {
    claudeManager.killAll();
    claudeManager = null;
  }
}
