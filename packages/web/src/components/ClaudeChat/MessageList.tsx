import { useState } from 'react';
import { Streamdown } from 'streamdown';
import { code } from '@streamdown/code';
import type { ClaudeMessage } from '@ccsandbox/shared';
import { AnsiOutput } from './AnsiOutput';

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
    if (!result) return { label: 'Running', className: 'bg-claude-accent text-white' };
    if (result.isError) return { label: 'Error', className: 'bg-claude-error text-white' };
    return { label: 'Done', className: 'bg-claude-success text-white' };
  };

  const status = getStatus();

  return (
    <div className="bg-claude-bg-tertiary border border-claude-border rounded-lg mt-2 overflow-hidden">
      <div
        className="flex items-center gap-2 py-2.5 px-3 bg-claude-bg-hover cursor-pointer select-none hover:bg-claude-border"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <span className="text-claude-accent text-sm">⚡</span>
        <span className="font-semibold text-[13px] text-claude-text-primary">{tool.name}</span>
        <span className={`ml-auto text-[11px] py-0.5 px-2 rounded-[10px] font-medium ${status.className}`}>
          {status.label}
        </span>
        <span className={`text-claude-text-muted transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}>
          ▶
        </span>
      </div>
      {isExpanded && (
        <div className="border-t border-claude-border">
          <pre className="font-mono text-xs m-0 p-3 overflow-x-auto text-claude-text-secondary bg-claude-code-bg max-h-[200px] overflow-y-auto">
            {JSON.stringify(tool.input, null, 2)}
          </pre>
          {result && (
            <div className={`bg-claude-code-bg border border-claude-border rounded-md overflow-hidden mt-2 ${result.isError ? '' : ''}`}>
              <div className={`flex items-center gap-1.5 py-2 px-3 bg-claude-bg-tertiary text-xs text-claude-text-secondary ${result.isError ? 'text-claude-error' : 'text-claude-success'}`}>
                <span className="text-xs">
                  {result.isError ? '✕' : '✓'}
                </span>
                <span>Output</span>
              </div>
              <AnsiOutput content={result.content} />
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
      <div className="flex flex-col items-center justify-center h-full p-10 text-center">
        <div className="text-5xl mb-4 opacity-50">✦</div>
        <div className="text-lg font-semibold text-claude-text-primary mb-2">Start a conversation</div>
        <div className="text-claude-text-muted text-sm max-w-[300px]">
          Ask Claude to help you with coding tasks, answer questions, or explore ideas.
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0">
      {groupedMessages.map((message, groupIndex) => {
        const isLastGroup = groupIndex === groupedMessages.length - 1;
        const showStreamingHere = isLastGroup && shouldAppendStreaming;

        return (
          <div
            key={message.id}
            className={`py-4 px-6 border-b border-claude-border last:border-b-0 ${message.role === 'user' ? 'bg-transparent' : 'bg-claude-bg-secondary'}`}
          >
            <div className="flex items-center gap-2 mb-2">
              <div className={`w-6 h-6 rounded flex items-center justify-center text-xs font-semibold ${message.role === 'user' ? 'bg-claude-user-bg text-[#60a5fa]' : 'bg-claude-accent text-white'}`}>
                {message.role === 'user' ? 'U' : '✦'}
              </div>
              <span className="font-semibold text-[13px] text-claude-text-primary">
                {message.role === 'user' ? 'You' : 'Claude'}
              </span>
              {showStreamingHere ? (
                <span className="inline-flex items-center gap-1.5 text-claude-accent text-xs font-medium ml-auto">
                  <span className="inline-block animate-spinner-char">·</span>
                  typing
                </span>
              ) : (
                <span className="text-claude-text-muted text-xs ml-auto">
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
                  <div key={index} className={`break-words leading-relaxed text-claude-text-primary prose prose-invert max-w-none ${index > 0 ? 'mt-3 pt-3 border-t border-dashed border-claude-border' : ''}`}>
                    <Streamdown plugins={{ code }}>{item.text}</Streamdown>
                  </div>
                );
              } else {
                return (
                  <div key={index} className="my-3">
                    <ToolItem tool={item.tool} result={item.result} />
                  </div>
                );
              }
            })}

            {/* ストリーミング中のコンテンツ */}
            {showStreamingHere && (
              <div className="break-words leading-relaxed text-claude-text-primary prose prose-invert max-w-none">
                <Streamdown plugins={{ code }} isAnimating>{streamingContent}</Streamdown>
              </div>
            )}
          </div>
        );
      })}

      {/* Thinking/Streaming state */}
      {isLoading && !streamingContent && (
        <div className="flex items-center gap-2 py-3 px-6 bg-claude-bg-secondary border-b border-claude-border">
          <div className="flex gap-1">
            <div className="w-1.5 h-1.5 bg-claude-accent rounded-full animate-bounce-dot" style={{ animationDelay: '-0.32s' }} />
            <div className="w-1.5 h-1.5 bg-claude-accent rounded-full animate-bounce-dot" style={{ animationDelay: '-0.16s' }} />
            <div className="w-1.5 h-1.5 bg-claude-accent rounded-full animate-bounce-dot" />
          </div>
          <span className="text-claude-text-muted text-[13px]">Claude is thinking...</span>
        </div>
      )}

      {/* Streaming message - 最後がアシスタントでない場合のみ別ブロックとして表示 */}
      {streamingContent && !shouldAppendStreaming && (
        <div className="py-4 px-6 border-b border-claude-border bg-claude-bg-secondary">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-6 h-6 rounded flex items-center justify-center text-xs font-semibold bg-claude-accent text-white">✦</div>
            <span className="font-semibold text-[13px] text-claude-text-primary">Claude</span>
            <span className="inline-flex items-center gap-1.5 text-claude-accent text-xs font-medium ml-auto">
              <span className="inline-block animate-spinner-char">·</span>
              typing
            </span>
          </div>
          <div className="break-words leading-relaxed text-claude-text-primary prose prose-invert max-w-none">
            <Streamdown plugins={{ code }} isAnimating>{streamingContent}</Streamdown>
          </div>
        </div>
      )}
    </div>
  );
}
