import { useState } from 'react';
import type { ClaudeMessage } from '@ccsandbox/shared';

interface MessageListProps {
  messages: ClaudeMessage[];
  streamingContent: string;
  isLoading: boolean;
}

interface ToolInfo {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

interface ToolResult {
  toolUseId: string;
  content: string;
  isError?: boolean;
}

interface ToolItemProps {
  tool: ToolInfo;
  result?: ToolResult;
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

// 順序を保持するためのアイテム型
type ContentItem =
  | { type: 'text'; text: string }
  | { type: 'tool'; tool: ToolInfo; result?: ToolResult };

interface GroupedMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  items: ContentItem[];
  timestamp: string;
}

function groupConsecutiveMessages(messages: ClaudeMessage[]): GroupedMessage[] {
  const grouped: GroupedMessage[] = [];

  for (const message of messages) {
    const last = grouped[grouped.length - 1];

    // メッセージからアイテムを作成（順序を保持）
    const items: ContentItem[] = [];

    // テキストコンテンツ
    if (message.content.trim()) {
      items.push({ type: 'text', text: message.content });
    }

    // ツール使用（テキストの後に追加）
    if (message.toolUse) {
      for (const tool of message.toolUse) {
        const result = message.toolResults?.find((r) => r.toolUseId === tool.id);
        items.push({ type: 'tool', tool, result });
      }
    }

    if (last && last.role === message.role) {
      // 連続した同じロールのメッセージを結合
      last.items.push(...items);
      last.timestamp = message.timestamp;
    } else {
      grouped.push({
        id: message.id,
        role: message.role,
        items,
        timestamp: message.timestamp,
      });
    }
  }

  return grouped;
}

export function MessageList({ messages, streamingContent, isLoading }: MessageListProps) {
  const groupedMessages = groupConsecutiveMessages(messages);

  // ストリーミング中のコンテンツを最後のアシスタントメッセージに結合するかどうか
  const lastGroup = groupedMessages[groupedMessages.length - 1];
  const shouldAppendStreaming = streamingContent && lastGroup?.role === 'assistant';

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
      {groupedMessages.map((message, groupIndex) => {
        const isLastGroup = groupIndex === groupedMessages.length - 1;
        const showStreamingHere = isLastGroup && shouldAppendStreaming;

        return (
          <div
            key={message.id}
            className={`claude-message claude-message-${message.role}${showStreamingHere ? ' claude-message-streaming' : ''}`}
          >
            <div className="claude-message-header">
              <div className="claude-message-avatar">
                {message.role === 'user' ? 'U' : '✦'}
              </div>
              <span className="claude-message-role">
                {message.role === 'user' ? 'You' : 'Claude'}
              </span>
              {showStreamingHere ? (
                <span className="claude-message-loading">
                  <span className="claude-spinner" />
                  typing
                </span>
              ) : (
                <span className="claude-message-time">
                  {new Date(message.timestamp).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              )}
            </div>

            {/* アイテムを順序通りに表示 */}
            {message.items.map((item, index) => {
              if (item.type === 'text') {
                return (
                  <div key={index} className="claude-message-content">
                    <p className="claude-message-paragraph">{item.text}</p>
                  </div>
                );
              } else {
                return (
                  <div key={index} className="claude-tool-use">
                    <ToolItem tool={item.tool} result={item.result} />
                  </div>
                );
              }
            })}

            {/* ストリーミング中のコンテンツ */}
            {showStreamingHere && (
              <div className="claude-message-content">
                <p className="claude-message-paragraph">{streamingContent}</p>
              </div>
            )}
          </div>
        );
      })}

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

      {/* Streaming message - 最後がアシスタントでない場合のみ別ブロックとして表示 */}
      {streamingContent && !shouldAppendStreaming && (
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
