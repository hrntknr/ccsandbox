import { useState, useRef, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type {
  AskUserQuestion,
  AskUserQuestionInput,
  ClaudeEvent,
  ClaudeMessage,
  ClaudePendingPermission,
  ClaudePermissionMode,
  TodoItem,
  TodoWriteResult,
} from '@shared/index.js';
import { MessageList } from './MessageList';
import { InputForm } from './InputForm';
import { PermissionDialog } from './PermissionDialog';
import { AskUserQuestionDialog } from './AskUserQuestionDialog';
import { TodoList } from './TodoList';

interface ClaudeChatProps {
  tabId: string;
  isActive: boolean;
  sendClaudeMessage: (content: string, permissionMode: ClaudePermissionMode) => void;
  respondToPermission: (
    requestId: string,
    permission: 'allow' | 'deny',
    answers?: Record<string, string>
  ) => void;
  changePermissionMode: (mode: ClaudePermissionMode) => void;
  onClaudeEvent: (
    tabId: string,
    callback: (event: ClaudeEvent) => void
  ) => () => void;
  onClaudeHistory: (
    tabId: string,
    callback: (messages: ClaudeMessage[], pendingPermissions: ClaudePendingPermission[], todos: TodoItem[]) => void
  ) => () => void;
  onClaudePermissionResolved: (
    tabId: string,
    callback: (requestId: string) => void
  ) => () => void;
  onClaudeUserMessage: (
    tabId: string,
    callback: (message: ClaudeMessage) => void
  ) => () => void;
}

export function ClaudeChat({
  tabId,
  isActive,
  sendClaudeMessage,
  respondToPermission,
  changePermissionMode,
  onClaudeEvent,
  onClaudeHistory,
  onClaudePermissionResolved,
  onClaudeUserMessage,
}: ClaudeChatProps) {
  const [messages, setMessages] = useState<ClaudeMessage[]>([]);
  const [pendingPermissions, setPendingPermissions] = useState<ClaudePendingPermission[]>([]);
  const [streamingContent, setStreamingContent] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [bottomAreaHeight, setBottomAreaHeight] = useState(128);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const bottomAreaRef = useRef<HTMLDivElement>(null);
  const historyLoadedRef = useRef(false);

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
              const lastMessage = newMessages[newMessages.length - 1];
              if (lastMessage && lastMessage.role === 'assistant') {
                lastMessage.toolResults = toolResults;
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
    return onClaudeHistory(tabId, (history, permissions, historyTodos) => {
      if (!historyLoadedRef.current) {
        setMessages(history);
        setPendingPermissions(permissions);
        setTodos(historyTodos);
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

  // Auto-scroll to bottom (including when todos change)
  useEffect(() => {
    if (isActive) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, streamingContent, isActive, todos]);

  const handleSubmit = useCallback(
    (content: string, permissionMode: ClaudePermissionMode) => {
      // Add user message to UI immediately
      const userMessage: ClaudeMessage = {
        id: uuidv4(),
        role: 'user',
        content,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMessage]);
      sendClaudeMessage(content, permissionMode);
    },
    [sendClaudeMessage]
  );

  const handlePermissionResponse = useCallback(
    (requestId: string, permission: 'allow' | 'deny', answers?: Record<string, string>) => {
      respondToPermission(requestId, permission, answers);
      setPendingPermissions((prev) => prev.filter((p) => p.requestId !== requestId));
    },
    [respondToPermission]
  );

  return (
    <div className={`relative h-full bg-claude-bg-primary text-claude-text-primary font-sans text-sm leading-normal ${isActive ? 'flex flex-col' : 'hidden'}`}>
      <div className="flex-1 overflow-y-auto py-4 scrollbar-thin">
        <MessageList
          messages={messages}
          streamingContent={streamingContent}
          isLoading={isLoading}
        />
        {/* Scroll spacer - matches bottom area height */}
        <div ref={messagesEndRef} style={{ height: bottomAreaHeight }} />
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
        // Default permission dialog for other tools
        return (
          <PermissionDialog
            permission={permission}
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
            disabled={isLoading || pendingPermissions.length > 0}
            isActive={isActive}
          />
        </div>
      </div>
    </div>
  );
}
