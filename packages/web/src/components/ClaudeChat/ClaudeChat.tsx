import { useState, useRef, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type {
  ClaudeEvent,
  ClaudeMessage,
  ClaudePendingPermission,
  ClaudePermissionMode,
} from '@ccsandbox/shared';
import { MessageList } from './MessageList';
import { InputForm } from './InputForm';
import { PermissionDialog } from './PermissionDialog';
import './ClaudeChat.css';

interface ClaudeChatProps {
  tabId: string;
  isActive: boolean;
  sendClaudeMessage: (content: string, permissionMode: ClaudePermissionMode) => void;
  respondToPermission: (requestId: string, permission: 'allow' | 'deny') => void;
  onClaudeEvent: (
    tabId: string,
    callback: (event: ClaudeEvent) => void
  ) => () => void;
  onClaudeHistory: (
    tabId: string,
    callback: (messages: ClaudeMessage[], pendingPermissions: ClaudePendingPermission[]) => void
  ) => () => void;
}

export function ClaudeChat({
  tabId,
  isActive,
  sendClaudeMessage,
  respondToPermission,
  onClaudeEvent,
  onClaudeHistory,
}: ClaudeChatProps) {
  const [messages, setMessages] = useState<ClaudeMessage[]>([]);
  const [pendingPermissions, setPendingPermissions] = useState<ClaudePendingPermission[]>([]);
  const [streamingContent, setStreamingContent] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
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

          const toolUse = event.message.content
            .filter((c) => c.type === 'tool_use')
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
          // Tool results - update the last assistant message
          const toolResults = event.message.content
            .filter((c) => c.type === 'tool_result')
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
    return onClaudeHistory(tabId, (history, permissions) => {
      if (!historyLoadedRef.current) {
        setMessages(history);
        setPendingPermissions(permissions);
        historyLoadedRef.current = true;
      }
    });
  }, [tabId, onClaudeHistory]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (isActive) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, streamingContent, isActive]);

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
    (requestId: string, permission: 'allow' | 'deny') => {
      respondToPermission(requestId, permission);
      setPendingPermissions((prev) => prev.filter((p) => p.requestId !== requestId));
    },
    [respondToPermission]
  );

  return (
    <div className={`claude-chat ${isActive ? 'claude-chat-active' : 'claude-chat-hidden'}`}>
      <div className="claude-chat-messages">
        <MessageList
          messages={messages}
          streamingContent={streamingContent}
          isLoading={isLoading}
        />
        <div ref={messagesEndRef} />
      </div>

      {pendingPermissions.length > 0 && (
        <PermissionDialog
          permission={pendingPermissions[0]!}
          onResponse={handlePermissionResponse}
        />
      )}

      <InputForm
        onSubmit={handleSubmit}
        disabled={isLoading || pendingPermissions.length > 0}
      />
    </div>
  );
}
