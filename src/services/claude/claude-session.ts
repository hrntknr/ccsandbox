/**
 * Claude session implementation using Agent SDK
 */

import { EventEmitter } from 'node:events';
import { v4 as uuidv4 } from 'uuid';
import { query, type Query, type SDKMessage, type SDKUserMessage, type PermissionResult } from '@anthropic-ai/claude-agent-sdk';
import { createWrapper, removeWrapper } from './devcontainer-wrapper.js';
import type {
  CreateSessionOptions,
  PermissionResolver,
  PermissionMode,
  ClaudeMessage,
  ClaudePendingPermission,
  TodoItem,
} from './types.js';

/**
 * Represents a single Claude session running inside a devcontainer
 */
export class ClaudeSession extends EventEmitter {
  readonly tabId: string;
  readonly sessionId: string;
  private readonly workspacePath: string;
  private readonly wrapperPath: string;
  private readonly options: CreateSessionOptions;

  private queryInstance: Query | null = null;
  private claudeSessionId: string = uuidv4();
  private messages: ClaudeMessage[] = [];
  private pendingPermissions = new Map<string, ClaudePendingPermission>();
  private permissionResolvers = new Map<string, PermissionResolver>();
  private _isProcessing = false;
  private _permissionMode: PermissionMode;
  private currentStreamingMessage: ClaudeMessage | null = null;
  private todos: TodoItem[] = [];
  private closed = false;

  // For streaming input mode
  private resolveNextMessage: ((msg: SDKUserMessage) => void) | null = null;
  private messageQueue: SDKUserMessage[] = [];

  constructor(options: CreateSessionOptions) {
    super();
    this.tabId = options.tabId;
    this.sessionId = options.sessionId;
    this.workspacePath = options.workspacePath;
    this.options = options;
    this._permissionMode = options.permissionMode ?? 'default';

    // Create wrapper script
    this.wrapperPath = createWrapper(options.scratchDir, options.tabId, {
      workspacePath: options.workspacePath,
      devcontainerCliPath: options.devcontainerCliPath,
      configPath: options.configPath,
      remoteEnv: options.remoteEnv,
    });
  }

  get isProcessing(): boolean {
    return this._isProcessing;
  }

  get permissionMode(): PermissionMode {
    return this._permissionMode;
  }

  /**
   * Start the Claude session
   */
  async start(): Promise<void> {
    // Create async generator for streaming input
    const messageGenerator = this.createMessageGenerator();

    // Build query options
    const queryOptions: Parameters<typeof query>[0]['options'] = {
      pathToClaudeCodeExecutable: this.wrapperPath,
      permissionMode: this._permissionMode,
      canUseTool: this.handlePermissionRequest.bind(this),
      includePartialMessages: true,
      preset: 'claude_code',
      settingSources: ['user', 'project'],
    };

    // Add maxThinkingTokens if configured (0 or undefined means disabled)
    if (this.options.maxThinkingTokens && this.options.maxThinkingTokens > 0) {
      queryOptions.maxThinkingTokens = this.options.maxThinkingTokens;
    }

    // Start query with streaming input mode
    this.queryInstance = query({
      prompt: messageGenerator,
      options: queryOptions,
    });

    // Process events in background
    this.processEvents().catch((error) => {
      this.emit('error', error);
    });
  }

  /**
   * Create async generator for streaming user messages to the SDK
   */
  private async *createMessageGenerator(): AsyncGenerator<SDKUserMessage, void, unknown> {
    while (!this.closed) {
      // Check if there are queued messages
      if (this.messageQueue.length > 0) {
        yield this.messageQueue.shift()!;
        continue;
      }

      // Wait for next message
      const message = await new Promise<SDKUserMessage | null>((resolve) => {
        this.resolveNextMessage = (msg) => {
          this.resolveNextMessage = null;
          resolve(msg);
        };
        // Check for close
        if (this.closed) {
          resolve(null);
        }
      });

      if (message === null) {
        break;
      }

      yield message;
    }
  }

  /**
   * Process events from the query
   */
  private async processEvents(): Promise<void> {
    if (!this.queryInstance) {
      return;
    }

    try {
      for await (const event of this.queryInstance) {
        if (this.closed) {
          break;
        }
        this.handleEvent(event);
      }
    } catch (error) {
      if (!this.closed) {
        this.emit('error', error instanceof Error ? error : new Error(String(error)));
      }
    } finally {
      this.cleanup();
      this.emit('exit', 0);
    }
  }

  /**
   * Handle SDK permission request via canUseTool callback
   */
  private async handlePermissionRequest(
    toolName: string,
    input: Record<string, unknown>,
    options: { toolUseID: string; signal: AbortSignal }
  ): Promise<PermissionResult> {
    const requestId = uuidv4();

    // Store pending permission
    const pendingPermission: ClaudePendingPermission = {
      requestId,
      toolName,
      input,
      toolUseId: options.toolUseID,
      timestamp: new Date().toISOString(),
    };
    this.pendingPermissions.set(requestId, pendingPermission);

    // Emit permission request event (for WebSocket broadcast)
    this.emit('permissionRequest', pendingPermission);

    // Check if pending permissions changed from none to some
    if (this.pendingPermissions.size === 1) {
      this.emit('pendingPermissionsChanged', true);
    }

    // Wait for user response
    return new Promise<PermissionResult>((resolve) => {
      const resolver: PermissionResolver = {
        resolve: (permission, answers) => {
          this.permissionResolvers.delete(requestId);
          this.pendingPermissions.delete(requestId);

          // Check if any pending permissions remain
          if (this.pendingPermissions.size === 0) {
            this.emit('pendingPermissionsChanged', false);
          }

          if (permission === 'allow') {
            const updatedInput = answers ? { ...input, answers } : input;
            resolve({ behavior: 'allow', updatedInput });
          } else {
            resolve({ behavior: 'deny', message: 'User denied the operation' });
          }
        },
      };

      this.permissionResolvers.set(requestId, resolver);

      // Handle abort signal
      options.signal.addEventListener('abort', () => {
        if (this.permissionResolvers.has(requestId)) {
          this.permissionResolvers.delete(requestId);
          this.pendingPermissions.delete(requestId);
          resolve({ behavior: 'deny', message: 'Request aborted' });
        }
      });
    });
  }

  /**
   * Handle events from SDK
   */
  private handleEvent(event: SDKMessage): void {
    // Track processing state
    if (event.type === 'system' && 'subtype' in event && event.subtype === 'init') {
      this._isProcessing = true;
      this.claudeSessionId = event.session_id;
      this.emit('processingStateChanged', true);

      // Start new streaming message
      this.currentStreamingMessage = {
        id: uuidv4(),
        role: 'assistant',
        content: '',
        timestamp: new Date().toISOString(),
        isStreaming: true,
      };
    }

    // Handle streaming content
    if (event.type === 'stream_event') {
      const streamEvent = event.event;
      if (streamEvent.type === 'content_block_delta') {
        const delta = streamEvent.delta as { text?: string } | undefined;
        if (delta?.text && this.currentStreamingMessage) {
          this.currentStreamingMessage.content += delta.text;
        }
      }
    }

    // Handle assistant message
    if (event.type === 'assistant') {
      const message = event.message;

      // Content block type from SDK
      type ContentBlock = (typeof message.content)[number];

      // Extract text content
      const textContent = message.content
        .filter((c: ContentBlock): c is ContentBlock & { type: 'text'; text: string } => c.type === 'text')
        .map((c: ContentBlock & { type: 'text'; text: string }) => c.text)
        .join('');

      // Extract thinking content
      // SDK's thinking blocks have 'thinking' property (Anthropic API format)
      const thinkingContent = message.content
        .filter((c: ContentBlock) => c.type === 'thinking')
        .map((c) => {
          // Handle both 'thinking' property and potential 'text' property
          const block = c as { thinking?: string; text?: string };
          return block.thinking ?? block.text ?? '';
        })
        .join('');

      // Extract tool use (filter out TodoWrite)
      const toolUse = message.content
        .filter((c: ContentBlock): c is ContentBlock & { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> } =>
          c.type === 'tool_use' && 'name' in c && c.name !== 'TodoWrite'
        )
        .map((c: ContentBlock & { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }) => ({
          id: c.id,
          name: c.name,
          input: c.input,
        }));

      // Detect EnterPlanMode
      for (const content of message.content) {
        if (content.type === 'tool_use' && content.name === 'EnterPlanMode') {
          this._permissionMode = 'plan';
          this.emit('permissionModeChanged', 'plan');
        }
      }

      // Finalize streaming message or create new one
      if (this.currentStreamingMessage) {
        this.currentStreamingMessage.content = textContent;
        this.currentStreamingMessage.isStreaming = false;
        if (thinkingContent) {
          this.currentStreamingMessage.thinking = thinkingContent;
        }
        if (toolUse.length > 0) {
          this.currentStreamingMessage.toolUse = toolUse;
        }
        this.messages.push(this.currentStreamingMessage);
        this.currentStreamingMessage = null;
      } else {
        const newMessage: ClaudeMessage = {
          id: uuidv4(),
          role: 'assistant',
          content: textContent,
          timestamp: new Date().toISOString(),
        };
        if (thinkingContent) {
          newMessage.thinking = thinkingContent;
        }
        if (toolUse.length > 0) {
          newMessage.toolUse = toolUse;
        }
        this.messages.push(newMessage);
      }
    }

    // Handle user message (tool results)
    if (event.type === 'user' && !('isReplay' in event)) {
      // Check for TodoWrite results
      const toolResult = event.tool_use_result as unknown;
      if (toolResult && typeof toolResult === 'object' && 'newTodos' in toolResult) {
        const todoResult = toolResult as { newTodos: TodoItem[] };
        this.todos = todoResult.newTodos;
        this.emit('todosChanged', this.todos);
      }

      // Extract tool results
      const message = event.message;
      if ('content' in message && Array.isArray(message.content)) {
        // Type for tool result content block
        type ToolResultBlock = { type: 'tool_result'; tool_use_id: string; content?: unknown; is_error?: boolean };

        const toolResults = (message.content as unknown[])
          .filter((c): c is ToolResultBlock =>
            typeof c === 'object' && c !== null && 'type' in c && (c as { type: string }).type === 'tool_result'
          )
          .filter((c: ToolResultBlock) => {
            const content = c.content;
            return !(typeof content === 'string' && content.includes('Todos have been modified successfully'));
          })
          .map((c: ToolResultBlock) => ({
            toolUseId: c.tool_use_id,
            content: typeof c.content === 'string' ? c.content : '',
            isError: c.is_error,
          }));

        if (toolResults.length > 0) {
          const lastMessage = this.messages[this.messages.length - 1];
          if (lastMessage && lastMessage.role === 'assistant') {
            lastMessage.toolResults = toolResults;
          }
        }
      }
    }

    // Handle result
    if (event.type === 'result') {
      this._isProcessing = false;
      this.currentStreamingMessage = null;
      this.emit('processingStateChanged', false);
    }

    // Emit event for WebSocket broadcast
    this.emit('event', event);
  }

  /**
   * Send a user message
   */
  send(content: string): ClaudeMessage | null {
    if (this.closed || !this.queryInstance) {
      return null;
    }

    const userMessage: SDKUserMessage = {
      type: 'user',
      message: { role: 'user', content },
      parent_tool_use_id: null,
      session_id: this.claudeSessionId,
    };

    // Either resolve waiting promise or queue the message
    if (this.resolveNextMessage) {
      this.resolveNextMessage(userMessage);
    } else {
      this.messageQueue.push(userMessage);
    }

    // Create message for history
    const message: ClaudeMessage = {
      id: uuidv4(),
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
    };
    this.messages.push(message);

    return message;
  }

  /**
   * Respond to a permission request
   */
  respondToPermission(
    requestId: string,
    permission: 'allow' | 'deny',
    answers?: Record<string, string>
  ): boolean {
    const resolver = this.permissionResolvers.get(requestId);
    if (!resolver) {
      return false;
    }

    resolver.resolve(permission, answers);
    return true;
  }

  /**
   * Set permission mode dynamically
   */
  async setPermissionMode(mode: PermissionMode): Promise<boolean> {
    if (this._permissionMode === mode) {
      return true;
    }

    if (this.queryInstance) {
      try {
        await this.queryInstance.setPermissionMode(mode);
      } catch (error) {
        console.error(`Failed to set permission mode:`, error);
        return false;
      }
    }

    // Update local state and emit event
    this._permissionMode = mode;
    this.emit('permissionModeChanged', mode);
    return true;
  }

  /**
   * Get message history
   */
  getMessages(): ClaudeMessage[] {
    return this.messages;
  }

  /**
   * Get pending permissions
   */
  getPendingPermissions(): ClaudePendingPermission[] {
    return Array.from(this.pendingPermissions.values());
  }

  /**
   * Get todos
   */
  getTodos(): TodoItem[] {
    return this.todos;
  }

  /**
   * Close the session
   */
  close(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;

    // Resolve any waiting message promise
    if (this.resolveNextMessage) {
      // Signal to stop the generator
      this.resolveNextMessage = null;
    }

    // Close the query
    if (this.queryInstance) {
      this.queryInstance.close();
      this.queryInstance = null;
    }

    this.cleanup();
  }

  /**
   * Clean up resources
   */
  private cleanup(): void {
    // Remove wrapper script
    removeWrapper(this.wrapperPath);

    // Clear pending permissions
    for (const resolver of this.permissionResolvers.values()) {
      resolver.resolve('deny');
    }
    this.permissionResolvers.clear();
    this.pendingPermissions.clear();
  }
}
