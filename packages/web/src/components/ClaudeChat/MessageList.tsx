import { useState } from 'react';
import type { ClaudeMessage } from '@ccsandbox/shared';

interface MessageListProps {
  messages: ClaudeMessage[];
  streamingContent: string;
  isLoading: boolean;
}

interface ToolItemProps {
  tool: {
    id: string;
    name: string;
    input: Record<string, unknown>;
  };
  result?: {
    toolUseId: string;
    content: string;
    isError?: boolean;
  };
}

function ToolItem({ tool, result }: ToolItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const getStatus = () => {
    if (!result) return { label: 'Running', className: 'claude-tool-status-running' };
    if (result.isError) return { label: 'Error', className: 'claude-tool-status-error' };
    return { label: 'Done', className: 'claude-tool-status-success' };
  };

  const status = getStatus();

  return (
    <div className="claude-tool-item">
      <div
        className="claude-tool-header"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <span className="claude-tool-icon">⚡</span>
        <span className="claude-tool-name">{tool.name}</span>
        <span className={`claude-tool-status ${status.className}`}>
          {status.label}
        </span>
        <span className={`claude-tool-chevron ${isExpanded ? 'expanded' : ''}`}>
          ▶
        </span>
      </div>
      {isExpanded && (
        <div className="claude-tool-content">
          <pre className="claude-tool-input">
            {JSON.stringify(tool.input, null, 2)}
          </pre>
          {result && (
            <div className={`claude-tool-result ${result.isError ? 'claude-tool-result-error' : 'claude-tool-result-success'}`}>
              <div className="claude-tool-result-header">
                <span className="claude-tool-result-icon">
                  {result.isError ? '✕' : '✓'}
                </span>
                <span>Output</span>
              </div>
              <pre>{result.content}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function MessageList({ messages, streamingContent, isLoading }: MessageListProps) {
  if (messages.length === 0 && !isLoading && !streamingContent) {
    return (
      <div className="claude-empty-state">
        <div className="claude-empty-icon">✦</div>
        <div className="claude-empty-title">Start a conversation</div>
        <div className="claude-empty-description">
          Ask Claude to help you with coding tasks, answer questions, or explore ideas.
        </div>
      </div>
    );
  }

  return (
    <div className="claude-message-list">
      {messages.map((message) => (
        <div
          key={message.id}
          className={`claude-message claude-message-${message.role}`}
        >
          <div className="claude-message-header">
            <div className="claude-message-avatar">
              {message.role === 'user' ? 'U' : '✦'}
            </div>
            <span className="claude-message-role">
              {message.role === 'user' ? 'You' : 'Claude'}
            </span>
            <span className="claude-message-time">
              {new Date(message.timestamp).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </div>
          <div className="claude-message-content">{message.content}</div>
          {message.toolUse && message.toolUse.length > 0 && (
            <div className="claude-tool-use">
              {message.toolUse.map((tool) => {
                const result = message.toolResults?.find(
                  (r) => r.toolUseId === tool.id
                );
                return <ToolItem key={tool.id} tool={tool} result={result} />;
              })}
            </div>
          )}
        </div>
      ))}

      {/* Thinking/Streaming state */}
      {isLoading && !streamingContent && (
        <div className="claude-thinking">
          <div className="claude-thinking-dots">
            <div className="claude-thinking-dot" />
            <div className="claude-thinking-dot" />
            <div className="claude-thinking-dot" />
          </div>
          <span className="claude-thinking-text">Claude is thinking...</span>
        </div>
      )}

      {/* Streaming message */}
      {streamingContent && (
        <div className="claude-message claude-message-assistant claude-message-streaming">
          <div className="claude-message-header">
            <div className="claude-message-avatar">✦</div>
            <span className="claude-message-role">Claude</span>
            <span className="claude-message-loading">
              <span className="claude-spinner" />
              typing
            </span>
          </div>
          <div className="claude-message-content">{streamingContent}</div>
        </div>
      )}
    </div>
  );
}
