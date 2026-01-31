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
} from '@ccsandbox/shared';

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
  isProcessing: boolean;
  currentStreamingMessage: ClaudeMessage | null;
  permissionMode: ClaudePermissionMode;
}

/**
 * Events emitted by ClaudeManager
 */
export interface ClaudeManagerEvents {
  event: (tabId: string, event: ClaudeEvent) => void;
  exit: (tabId: string, code: number) => void;
  error: (tabId: string, error: Error) => void;
  pendingPermissionsChanged: (sessionId: string, hasPending: boolean) => void;
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
      isProcessing: false,
      currentStreamingMessage: null,
      permissionMode,
    };

    this.instances.set(tabId, instance);

    // Start persistent Claude process
    await this.startClaudeProcess(instance, devcontainerCliPath);

    return tabId;
  }

  /**
   * Start the Claude CLI process
   */
  private async startClaudeProcess(
    instance: ClaudeInstance,
    cliPath: string
  ): Promise<void> {
    const args = [
      'exec',
      '--workspace-folder',
      instance.workspacePath,
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
    ];

    // Add permission mode option
    if (instance.permissionMode !== 'default') {
      args.push('--permission-mode', instance.permissionMode);
    }

    const proc = spawn(cliPath, args, {
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
      instance.process = null;
      instance.isProcessing = false;
      this.emit('exit', instance.tabId, code ?? 0);
    });

    proc.on('error', (err) => {
      this.emit('error', instance.tabId, err);
    });
  }

  /**
   * Handle incoming events from Claude CLI
   */
  private handleEvent(instance: ClaudeInstance, event: ClaudeEvent): void {
    // Track pending permissions
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

      // Extract tool use
      const toolUse = event.message.content
        .filter((c) => c.type === 'tool_use')
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
      const toolResults = event.message.content
        .filter((c) => c.type === 'tool_result')
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
    }

    // Emit event to connection manager
    this.emit('event', instance.tabId, event);
  }

  /**
   * Send a user message to Claude
   */
  sendMessage(tabId: string, content: string): boolean {
    const instance = this.instances.get(tabId);
    if (!instance?.process?.stdin?.writable) {
      return false;
    }

    const message = {
      type: 'user',
      message: { role: 'user', content },
    };

    instance.process.stdin.write(JSON.stringify(message) + '\n');

    // Add to messages history
    instance.messages.push({
      id: uuidv4(),
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
    });

    return true;
  }

  /**
   * Respond to a permission request
   */
  respondToPermission(
    tabId: string,
    requestId: string,
    permission: 'allow' | 'deny'
  ): boolean {
    const instance = this.instances.get(tabId);
    if (!instance?.process?.stdin?.writable) {
      return false;
    }

    const pendingRequest = instance.pendingPermissions.get(requestId);

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
                updatedInput: pendingRequest?.input ?? {},
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
   * Get Claude instance by tabId
   */
  get(tabId: string): ClaudeInstance | undefined {
    return this.instances.get(tabId);
  }

  /**
   * Set permission mode and restart Claude process if changed
   */
  async setPermissionMode(
    tabId: string,
    permissionMode: ClaudePermissionMode,
    devcontainerCliPath = 'devcontainer'
  ): Promise<boolean> {
    const instance = this.instances.get(tabId);
    if (!instance) {
      return false;
    }

    // No change needed
    if (instance.permissionMode === permissionMode) {
      return true;
    }

    // Kill existing process
    if (instance.process) {
      instance.process.kill('SIGTERM');
      instance.process = null;
    }

    // Update mode
    instance.permissionMode = permissionMode;

    // Restart process with new mode
    await this.startClaudeProcess(instance, devcontainerCliPath);

    return true;
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
   * Kill a Claude instance
   */
  kill(tabId: string): boolean {
    const instance = this.instances.get(tabId);
    if (!instance) {
      return false;
    }

    if (instance.process) {
      instance.process.kill('SIGTERM');
    }
    this.instances.delete(tabId);
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
