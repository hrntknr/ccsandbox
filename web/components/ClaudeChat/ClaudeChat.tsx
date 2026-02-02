import { useState, useRef, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type {
  AskUserQuestion,
  AskUserQuestionInput,
  ClaudeEvent,
  ClaudeMessage,
  ClaudePendingPermission,
  PermissionMode,
  TodoItem,
  TodoWriteResult,
} from '@shared/index.js';
import { MessageList } from './MessageList';
import { InputForm } from './InputForm';
import { PermissionDialog } from './PermissionDialog';
import { AskUserQuestionDialog } from './AskUserQuestionDialog';
import { ExitPlanModeDialog } from './ExitPlanModeDialog';
import { TodoList } from './TodoList';

interface ClaudeChatProps {
  tabId: string;
  isActive: boolean;
  defaultPermissionMode?: PermissionMode;
  sendClaudeMessage: (content: string, permissionMode: PermissionMode) => void;
  respondToPermission: (
    requestId: string,
    permission: 'allow' | 'deny',
    answers?: Record<string, string>,
    permissionMode?: PermissionMode
  ) => void;
  changePermissionMode: (mode: PermissionMode) => void;
  interruptClaude: () => void;
  onClaudeEvent: (
    tabId: string,
    callback: (event: ClaudeEvent) => void
  ) => () => void;
  onClaudeHistory: (
    tabId: string,
    callback: (messages: ClaudeMessage[], pendingPermissions: ClaudePendingPermission[], todos: TodoItem[], permissionMode?: PermissionMode, isProcessing?: boolean) => void
  ) => () => void;
  onClaudePermissionResolved: (
    tabId: string,
    callback: (requestId: string) => void
  ) => () => void;
  onClaudeUserMessage: (
    tabId: string,
    callback: (message: ClaudeMessage) => void
  ) => () => void;
  onClaudeTodosUpdated: (
    tabId: string,
    callback: (todos: TodoItem[]) => void
  ) => () => void;
  onPermissionModeChanged: (
    tabId: string,
    callback: (mode: PermissionMode) => void
  ) => () => void;
}

export function ClaudeChat({
  tabId,
  isActive,
  defaultPermissionMode,
  sendClaudeMessage,
  respondToPermission,
  changePermissionMode,
  interruptClaude,
  onClaudeEvent,
  onClaudeHistory,
  onClaudePermissionResolved,
  onClaudeUserMessage,
  onClaudeTodosUpdated,
  onPermissionModeChanged,
}: ClaudeChatProps) {
  const [messages, setMessages] = useState<ClaudeMessage[]>([]);
  const [pendingPermissions, setPendingPermissions] = useState<ClaudePendingPermission[]>([]);
  const [streamingContent, setStreamingContent] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [bottomAreaHeight, setBottomAreaHeight] = useState(128);
  const [backendPermissionMode, setBackendPermissionMode] = useState<PermissionMode | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const bottomAreaRef = useRef<HTMLDivElement>(null);
  const historyLoadedRef = useRef(false);
  const isAtBottomRef = useRef(true);
  const isScrollingRef = useRef(false);

  // Handle incoming events
  useEffect(() => {
    return onClaudeEvent(tabId, (event) => {
      switch (event.type) {
        case 'system':
          if (event.subtype === 'init') {
            setIsLoading(true);
            setStreamingContent('');
          }
          break;

        case 'stream_event':
          if (event.event.type === 'content_block_delta' && event.event.delta?.text) {
            setStreamingContent((prev) => prev + event.event.delta!.text);
          }
          break;

        case 'assistant': {
          // Full message received - add to messages
          const textContent = event.message.content
            .filter((c) => c.type === 'text')
            .map((c) => c.text ?? '')
            .join('');

          // Extract thinking content
          // SDK's thinking blocks may have 'thinking' or 'text' property
          const thinkingContent = event.message.content
            .filter((c) => c.type === 'thinking')
            .map((c) => c.thinking ?? c.text ?? '')
            .join('');

          // Filter out TodoWrite from tool use display
          const toolUse = event.message.content
            .filter((c) => c.type === 'tool_use' && c.name !== 'TodoWrite')
            .map((c) => ({
              id: c.id ?? '',
              name: c.name ?? '',
              input: c.input ?? {},
            }));

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

          setMessages((prev) => [...prev, newMessage]);
          setStreamingContent('');
          break;
        }

        case 'user': {
          // Check for TodoWrite tool_use_result first
          const rawResult = event.tool_use_result as unknown;
          const isTodoWriteResult = rawResult && typeof rawResult === 'object' && 'newTodos' in rawResult;

          if (isTodoWriteResult) {
            const todoResult = rawResult as TodoWriteResult;
            setTodos(todoResult.newTodos);
          }

          // Tool results - update the last assistant message (exclude TodoWrite)
          const toolResults = event.message.content
            .filter((c) => c.type === 'tool_result')
            .filter((c) => !c.content?.includes('Todos have been modified successfully'))
            .map((c) => ({
              toolUseId: c.tool_use_id ?? '',
              content: c.content ?? '',
              isError: c.is_error,
            }));

          if (toolResults.length > 0) {
            setMessages((prev) => {
              const newMessages = [...prev];
              // Find the assistant message that contains the corresponding toolUse
              // (not just the last one, to handle parallel tool execution correctly)
              for (const result of toolResults) {
                // Search from the end to find the message with matching toolUse
                for (let i = newMessages.length - 1; i >= 0; i--) {
                  const msg = newMessages[i];
                  if (msg && msg.role === 'assistant' && msg.toolUse?.some((t) => t.id === result.toolUseId)) {
                    // Merge with existing toolResults
                    const existingResults = msg.toolResults ?? [];
                    if (!existingResults.some((r) => r.toolUseId === result.toolUseId)) {
                      msg.toolResults = [...existingResults, result];
                    }
                    break;
                  }
                }
              }
              return newMessages;
            });
          }
          break;
        }

        case 'control_request':
          setPendingPermissions((prev) => [
            ...prev,
            {
              requestId: event.request_id,
              toolName: event.request.tool_name,
              input: event.request.input,
              toolUseId: event.request.tool_use_id,
              timestamp: new Date().toISOString(),
            },
          ]);
          break;

        case 'result':
          setIsLoading(false);
          setStreamingContent('');
          break;
      }
    });
  }, [tabId, onClaudeEvent]);

  // Handle history on attach
  useEffect(() => {
    return onClaudeHistory(tabId, (history, permissions, historyTodos, permissionMode, isProcessing) => {
      if (!historyLoadedRef.current) {
        setMessages(history);
        setPendingPermissions(permissions);
        setTodos(historyTodos);
        if (permissionMode) {
          setBackendPermissionMode(permissionMode);
        }
        if (isProcessing !== undefined) {
          setIsLoading(isProcessing);
        }
        historyLoadedRef.current = true;
      }
    });
  }, [tabId, onClaudeHistory]);

  // Handle permission resolved from other clients (multi-tab sync)
  useEffect(() => {
    return onClaudePermissionResolved(tabId, (requestId) => {
      setPendingPermissions((prev) => prev.filter((p) => p.requestId !== requestId));
    });
  }, [tabId, onClaudePermissionResolved]);

  // Handle user messages from other clients (multi-tab sync)
  useEffect(() => {
    return onClaudeUserMessage(tabId, (message) => {
      setMessages((prev) => [...prev, message]);
    });
  }, [tabId, onClaudeUserMessage]);

  // Handle todos updated from server (multi-tab sync)
  useEffect(() => {
    return onClaudeTodosUpdated(tabId, (updatedTodos) => {
      setTodos(updatedTodos);
    });
  }, [tabId, onClaudeTodosUpdated]);

  // Handle permission mode changed from server (EnterPlanMode/ExitPlanMode)
  useEffect(() => {
    return onPermissionModeChanged(tabId, (mode) => {
      setBackendPermissionMode(mode);
    });
  }, [tabId, onPermissionModeChanged]);

  // Track bottom area height for scroll spacer
  useEffect(() => {
    const bottomArea = bottomAreaRef.current;
    if (!bottomArea) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setBottomAreaHeight(entry.contentRect.height + 16); // +16 for padding
      }
    });

    observer.observe(bottomArea);
    return () => observer.disconnect();
  }, []);

  // Check if scroll is at bottom (with threshold for floating point errors)
  const checkIsAtBottom = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return true;
    const threshold = 50; // pixels from bottom to consider "at bottom"
    const { scrollTop, scrollHeight, clientHeight } = container;
    return scrollHeight - scrollTop - clientHeight < threshold;
  }, []);

  // Scroll to bottom helper - use scrollIntoView on the dummy element
  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    if (behavior === 'smooth') {
      // Mark as scrolling to prevent scroll events from clearing isAtBottom
      isScrollingRef.current = true;
      // Clear after animation completes (smooth scroll typically takes ~300-500ms)
      setTimeout(() => {
        isScrollingRef.current = false;
        // Re-check position after scroll completes
        isAtBottomRef.current = checkIsAtBottom();
      }, 500);
    }
    messagesEndRef.current?.scrollIntoView({ behavior, block: 'end' });
  }, [checkIsAtBottom]);

  // Track scroll position to detect if user is at bottom
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      // Skip updating during programmatic smooth scroll
      if (isScrollingRef.current) return;
      isAtBottomRef.current = checkIsAtBottom();
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [checkIsAtBottom]);

  // Auto-scroll on streaming content only if at bottom
  useEffect(() => {
    if (!isActive) return;

    if (isAtBottomRef.current) {
      scrollToBottom('smooth');
    }
  }, [streamingContent, isActive, scrollToBottom]);

  // Auto-scroll on new messages only if at bottom
  useEffect(() => {
    if (!isActive) return;

    if (isAtBottomRef.current) {
      scrollToBottom('smooth');
    }
  }, [messages, isActive, scrollToBottom]);

  // Auto-scroll when todos change only if at bottom
  useEffect(() => {
    if (!isActive) return;

    if (isAtBottomRef.current) {
      scrollToBottom('smooth');
    }
  }, [todos, isActive, scrollToBottom]);

  // Auto-scroll when loading starts (e.g., "Claude is thinking...")
  useEffect(() => {
    if (!isActive) return;

    if (isLoading && isAtBottomRef.current) {
      scrollToBottom('smooth');
    }
  }, [isLoading, isActive, scrollToBottom]);

  // Scroll to bottom when tab becomes active (handles tab switch only)
  const prevIsActiveRef = useRef(isActive);
  useEffect(() => {
    // Only scroll when tab becomes active (false -> true), not on every message
    const wasInactive = !prevIsActiveRef.current;
    prevIsActiveRef.current = isActive;

    if (isActive && wasInactive && messages.length > 0) {
      scrollToBottom('instant');
      isAtBottomRef.current = true;
    }
  }, [isActive, scrollToBottom, messages.length]);

  const handleSubmit = useCallback(
    (content: string, permissionMode: PermissionMode) => {
      // Add user message to UI immediately
      const userMessage: ClaudeMessage = {
        id: uuidv4(),
        role: 'user',
        content,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMessage]);
      sendClaudeMessage(content, permissionMode);

      // When user sends a message, snap to bottom and follow new messages
      isAtBottomRef.current = true;
      scrollToBottom('smooth');
    },
    [sendClaudeMessage, scrollToBottom]
  );

  const handlePermissionResponse = useCallback(
    (requestId: string, permission: 'allow' | 'deny', answers?: Record<string, string>, permissionMode?: PermissionMode) => {
      respondToPermission(requestId, permission, answers, permissionMode);
      setPendingPermissions((prev) => prev.filter((p) => p.requestId !== requestId));
    },
    [respondToPermission]
  );

  return (
    <div className={`relative h-full bg-claude-bg-primary text-claude-text-primary font-sans text-sm leading-normal ${isActive ? 'flex flex-col' : 'hidden'}`}>
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto py-4 scrollbar-thin">
        <MessageList
          messages={messages}
          streamingContent={streamingContent}
          isLoading={isLoading}
        />
        {/* Scroll spacer - matches bottom area height (only when there are messages) */}
        {(messages.length > 0 || isLoading || streamingContent) && (
          <div style={{ height: bottomAreaHeight }} />
        )}
        {/* Dummy element for scrollIntoView */}
        <div ref={messagesEndRef} />
      </div>

      {pendingPermissions.length > 0 && (() => {
        const permission = pendingPermissions[0]!;
        // Check if this is an AskUserQuestion tool request
        if (permission.toolName === 'AskUserQuestion') {
          const input = permission.input as unknown as AskUserQuestionInput;
          if (input.questions && Array.isArray(input.questions)) {
            return (
              <AskUserQuestionDialog
                permission={permission}
                questions={input.questions}
                onResponse={handlePermissionResponse}
              />
            );
          }
        }
        // Check if this is an ExitPlanMode tool request
        if (permission.toolName === 'ExitPlanMode') {
          return (
            <ExitPlanModeDialog
              permission={permission}
              onResponse={handlePermissionResponse}
            />
          );
        }
        // Default permission dialog for other tools
        return (
          <PermissionDialog
            permission={permission}
            currentPermissionMode={backendPermissionMode ?? undefined}
            onResponse={handlePermissionResponse}
            onChangePermissionMode={changePermissionMode}
          />
        );
      })()}

      <div className="absolute bottom-0 left-0 right-0 px-4 pb-4 pointer-events-none">
        <div ref={bottomAreaRef} className="pointer-events-auto max-w-3xl mx-auto">
          {/* Todo List - above input form */}
          <TodoList todos={todos} />
          <InputForm
            onSubmit={handleSubmit}
            onInterrupt={interruptClaude}
            disabled={isLoading || pendingPermissions.length > 0}
            isActive={isActive}
            backendPermissionMode={backendPermissionMode}
            defaultPermissionMode={defaultPermissionMode}
          />
        </div>
      </div>
    </div>
  );
}
