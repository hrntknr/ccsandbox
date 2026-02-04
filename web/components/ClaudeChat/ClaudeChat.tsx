import { useState, useRef, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type {
  AskUserQuestion,
  AskUserQuestionInput,
  ClaudeEvent,
  ClaudeMessage,
  ClaudePendingPermission,
  ImageAttachment,
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
  sessionId: string;
  isActive: boolean;
  isConnected: boolean;
  defaultPermissionMode?: PermissionMode;
  speechRecognitionLanguage?: string;
  sendClaudeMessage: (content: string, images?: ImageAttachment[], permissionMode?: PermissionMode) => void;
  respondToPermission: (
    requestId: string,
    permission: 'allow' | 'deny',
    answers?: Record<string, string>,
    permissionMode?: PermissionMode
  ) => void;
  changePermissionMode: (mode: PermissionMode) => void;
  interruptClaude: () => void;
  clearClaude: () => void;
  onClaudeEvent: (
    tabId: string,
    callback: (event: ClaudeEvent) => void
  ) => () => void;
  onClaudeHistory: (
    tabId: string,
    callback: (messages: ClaudeMessage[], pendingPermissions: ClaudePendingPermission[], todos: TodoItem[], permissionMode?: PermissionMode, isProcessing?: boolean, planFilePath?: string) => void
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
  onPlanFilePathChanged: (
    tabId: string,
    callback: (planFilePath: string) => void
  ) => () => void;
  onClaudeCleared: (
    tabId: string,
    callback: () => void
  ) => () => void;
  onOpenLoginShell?: () => void;
}

export function ClaudeChat({
  tabId,
  sessionId,
  isActive,
  isConnected,
  defaultPermissionMode,
  speechRecognitionLanguage,
  sendClaudeMessage,
  respondToPermission,
  changePermissionMode,
  interruptClaude,
  clearClaude,
  onClaudeEvent,
  onClaudeHistory,
  onClaudePermissionResolved,
  onClaudeUserMessage,
  onClaudeTodosUpdated,
  onPermissionModeChanged,
  onPlanFilePathChanged,
  onClaudeCleared,
  onOpenLoginShell,
}: ClaudeChatProps) {
  const [messages, setMessages] = useState<ClaudeMessage[]>([]);
  const [pendingPermissions, setPendingPermissions] = useState<ClaudePendingPermission[]>([]);
  const [streamingContent, setStreamingContent] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [bottomAreaHeight, setBottomAreaHeight] = useState(128);
  const [backendPermissionMode, setBackendPermissionMode] = useState<PermissionMode | null>(null);
  const [planFilePath, setPlanFilePath] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const messageListRef = useRef<HTMLDivElement>(null);
  const bottomAreaRef = useRef<HTMLDivElement>(null);
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
            // Use immutable update pattern to ensure React detects changes
            setMessages((prev) =>
              prev.map((msg) => {
                if (msg.role !== 'assistant' || !msg.toolUse) return msg;

                // Collect tool results that belong to this message
                const matchingResults = toolResults.filter((result) =>
                  msg.toolUse?.some((t) => t.id === result.toolUseId)
                );

                if (matchingResults.length === 0) return msg;

                // Merge with existing results (exclude duplicates)
                const existingResults = msg.toolResults ?? [];
                const newResults = matchingResults.filter(
                  (r) => !existingResults.some((e) => e.toolUseId === r.toolUseId)
                );

                if (newResults.length === 0) return msg;

                // Return new object (immutable)
                return {
                  ...msg,
                  toolResults: [...existingResults, ...newResults],
                };
              })
            );
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

  // Handle history on attach (always update to sync state after reconnection)
  useEffect(() => {
    return onClaudeHistory(tabId, (history, permissions, historyTodos, permissionMode, isProcessing, historyPlanFilePath) => {
      setMessages(history);
      setPendingPermissions(permissions);
      setTodos(historyTodos);
      if (permissionMode) {
        setBackendPermissionMode(permissionMode);
      }
      if (isProcessing !== undefined) {
        setIsLoading(isProcessing);
      }
      if (historyPlanFilePath) {
        setPlanFilePath(historyPlanFilePath);
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

  // Handle plan file path changed from server (EnterPlanMode result)
  useEffect(() => {
    return onPlanFilePathChanged(tabId, (path) => {
      setPlanFilePath(path);
    });
  }, [tabId, onPlanFilePathChanged]);

  // Handle context cleared (process restart)
  useEffect(() => {
    return onClaudeCleared(tabId, () => {
      setMessages([]);
      setPendingPermissions([]);
      setStreamingContent('');
      setIsLoading(false);
      setTodos([]);
      setBackendPermissionMode(null);
      setPlanFilePath(null);
    });
  }, [tabId, onClaudeCleared]);

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
    // Always set isAtBottom to true when programmatically scrolling to bottom
    // This prevents DOM height changes (e.g., markdown rendering) from breaking snap
    isAtBottomRef.current = true;

    if (behavior === 'smooth') {
      // Mark as scrolling to prevent scroll events from clearing isAtBottom
      isScrollingRef.current = true;
      // Clear after animation completes (smooth scroll typically takes ~300-500ms)
      setTimeout(() => {
        isScrollingRef.current = false;
      }, 500);
    }
    messagesEndRef.current?.scrollIntoView({ behavior, block: 'end' });
  }, []);

  // Adjust scroll position when bottom area height changes (e.g., TodoList appears)
  useEffect(() => {
    if (!isActive) return;

    // Skip when input is focused (keyboard opening on mobile)
    const activeElement = document.activeElement;
    if (activeElement?.tagName === 'TEXTAREA' || activeElement?.tagName === 'INPUT') {
      return;
    }

    if (isAtBottomRef.current) {
      scrollToBottom('instant');
    }
  }, [bottomAreaHeight, isActive, scrollToBottom]);

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

  // Auto-scroll when MessageList DOM height changes (e.g., Streamdown rendering)
  // This handles cases where content length changes dynamically after markdown parsing
  useEffect(() => {
    if (!isActive) return;

    const messageList = messageListRef.current;
    if (!messageList) return;

    const observer = new ResizeObserver(() => {
      // Skip auto-scroll when input is focused (e.g., keyboard opening on mobile)
      // This prevents unwanted scrolling when virtual keyboard appears
      const activeElement = document.activeElement;
      if (activeElement?.tagName === 'TEXTAREA' || activeElement?.tagName === 'INPUT') {
        return;
      }

      if (isAtBottomRef.current) {
        // Mark as scrolling to prevent scroll events from clearing isAtBottom
        // This is critical when large elements (e.g., headings) cause layout shifts
        isScrollingRef.current = true;
        // Use instant scroll during streaming to avoid jank from frequent updates
        messagesEndRef.current?.scrollIntoView({ behavior: 'instant', block: 'end' });
        // Clear after browser has processed the scroll (use rAF for instant scroll)
        requestAnimationFrame(() => {
          isScrollingRef.current = false;
        });
      }
    });

    observer.observe(messageList);
    return () => observer.disconnect();
  }, [isActive]);

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
    (content: string, permissionMode: PermissionMode, images?: ImageAttachment[]) => {
      // Skip if not connected - message won't be sent
      if (!isConnected) {
        return;
      }

      if (content.trim() === '/login' && onOpenLoginShell) {
        onOpenLoginShell();
        return;
      }

      if (content.trim() === '/clear') {
        clearClaude();
        return;
      }

      // Add user message to UI immediately
      const userMessage: ClaudeMessage = {
        id: uuidv4(),
        role: 'user',
        content,
        images,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMessage]);
      sendClaudeMessage(content, images, permissionMode);

      // When user sends a message, snap to bottom and follow new messages
      isAtBottomRef.current = true;
      scrollToBottom('smooth');
    },
    [isConnected, sendClaudeMessage, scrollToBottom, onOpenLoginShell, clearClaude]
  );

  const handlePermissionResponse = useCallback(
    (requestId: string, permission: 'allow' | 'deny', answers?: Record<string, string>, permissionMode?: PermissionMode) => {
      // Skip if not connected - response won't be sent
      if (!isConnected) {
        return;
      }

      respondToPermission(requestId, permission, answers, permissionMode);
      setPendingPermissions((prev) => prev.filter((p) => p.requestId !== requestId));
    },
    [isConnected, respondToPermission]
  );

  return (
    <div className={`relative h-full bg-claude-bg-primary text-claude-text-primary font-sans text-sm leading-normal ${isActive ? 'flex flex-col' : 'hidden'}`}>
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto py-4 scrollbar-thin">
        <div ref={messageListRef}>
          <MessageList
            messages={messages}
            streamingContent={streamingContent}
            isLoading={isLoading}
          />
        </div>
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
                disabled={!isConnected}
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
              sessionId={sessionId}
              planFilePath={planFilePath}
              disabled={!isConnected}
              onResponse={handlePermissionResponse}
            />
          );
        }
        // Default permission dialog for other tools
        return (
          <PermissionDialog
            permission={permission}
            currentPermissionMode={backendPermissionMode ?? undefined}
            disabled={!isConnected}
            onResponse={handlePermissionResponse}
            onChangePermissionMode={changePermissionMode}
          />
        );
      })()}

      <div className="absolute bottom-0 left-0 right-0 px-4 pb-4 pointer-events-none z-20">
        <div ref={bottomAreaRef} className="pointer-events-auto max-w-3xl mx-auto">
          {/* Todo List - above input form */}
          <TodoList todos={todos} />
          <InputForm
            onSubmit={handleSubmit}
            onInterrupt={interruptClaude}
            disabled={isLoading || pendingPermissions.length > 0 || !isConnected}
            isActive={isActive}
            backendPermissionMode={backendPermissionMode}
            defaultPermissionMode={defaultPermissionMode}
            speechRecognitionLanguage={speechRecognitionLanguage}
          />
        </div>
      </div>
    </div>
  );
}
