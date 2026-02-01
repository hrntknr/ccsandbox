import { useState, useMemo } from 'react';
import { Streamdown } from 'streamdown';
import { createCodePlugin } from '@streamdown/code';
import type { ClaudeMessage } from '@shared/index.js';
import { AnsiOutput } from './AnsiOutput';

// Create code plugin with dark theme (vitesse-dark for better contrast)
const darkCodePlugin = createCodePlugin({
  themes: ['vitesse-dark', 'vitesse-dark'],
});

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

function ToolItem({ tool, result, isFirst, isLast }: ToolItemProps & { isFirst: boolean; isLast: boolean }) {
  const [isExpanded, setIsExpanded] = useState(false);

  const getStatus = () => {
    if (!result) return { label: 'Running', icon: '●', className: 'text-claude-accent' };
    if (result.isError) return { label: 'Error', icon: '✕', className: 'text-claude-error' };
    return { label: 'Done', icon: '✓', className: 'text-claude-success' };
  };

  const status = getStatus();

  return (
    <div className={`${!isFirst ? 'border-t border-claude-border/50' : ''}`}>
      <div
        className="flex items-center gap-1.5 py-1.5 px-2.5 cursor-pointer select-none hover:bg-claude-bg-hover/50"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <span className={`text-[10px] ${status.className}`}>{status.icon}</span>
        <span className="font-medium text-[12px] text-claude-text-primary">{tool.name}</span>
        <span className={`ml-auto text-claude-text-muted transition-transform duration-200 text-[10px] ${isExpanded ? 'rotate-90' : ''}`}>
          ▶
        </span>
      </div>
      {isExpanded && (
        <div className="border-t border-claude-border/30 bg-claude-code-bg">
          <pre className="font-mono text-xs m-0 p-2 overflow-x-auto text-claude-text-secondary max-h-[150px] overflow-y-auto">
            {JSON.stringify(tool.input, null, 2)}
          </pre>
          {result && (
            <div className="border-t border-claude-border/30">
              <div className={`flex items-center gap-1 py-1 px-2 text-[11px] ${result.isError ? 'text-claude-error' : 'text-claude-success'}`}>
                <span>{result.isError ? '✕' : '✓'}</span>
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

interface ToolGroupProps {
  tools: Array<{ tool: ToolInfo; result?: ToolResult }>;
}

function ToolGroup({ tools }: ToolGroupProps) {
  if (tools.length === 0) return null;

  return (
    <div className="bg-claude-bg-tertiary border border-claude-border rounded-lg mt-2 overflow-hidden">
      <div className="flex items-center gap-1.5 py-1 px-2.5 bg-claude-bg-hover text-claude-text-muted text-[11px]">
        <span className="text-claude-accent text-[10px]">⚡</span>
        <span>Tools ({tools.length})</span>
      </div>
      <div>
        {tools.map((item, index) => (
          <ToolItem
            key={item.tool.id}
            tool={item.tool}
            result={item.result}
            isFirst={index === 0}
            isLast={index === tools.length - 1}
          />
        ))}
      </div>
    </div>
  );
}

// Item type for preserving order
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

    // Create items from message (preserving order)
    const items: ContentItem[] = [];

    // Text content
    if (message.content.trim()) {
      items.push({ type: 'text', text: message.content });
    }

    // Tool use (added after text, excluding EnterPlanMode/ExitPlanMode)
    if (message.toolUse) {
      for (const tool of message.toolUse) {
        if (tool.name === 'EnterPlanMode' || tool.name === 'ExitPlanMode') {
          continue;
        }
        const result = message.toolResults?.find((r) => r.toolUseId === tool.id);
        items.push({ type: 'tool', tool, result });
      }
    }

    if (last && last.role === message.role) {
      // Merge consecutive messages with the same role
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

  // Whether to append streaming content to the last assistant message
  const lastGroup = groupedMessages[groupedMessages.length - 1];
  const shouldAppendStreaming = streamingContent && lastGroup?.role === 'assistant';
  // Whether a new streaming block is shown (when last message is not assistant)
  const hasNewStreamingBlock = streamingContent && !shouldAppendStreaming;
  // Whether thinking block is shown
  const hasThinkingBlock = isLoading && !streamingContent;

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

        // If there's a streaming or thinking block, the last block has no bottom border
        const showBottomBorder = !(isLastGroup && (hasNewStreamingBlock || hasThinkingBlock));

        return (
          <div
            key={message.id}
            className={`py-4 px-6 ${showBottomBorder ? 'border-b border-claude-border last:border-b-0' : ''} ${message.role === 'user' ? 'bg-transparent' : 'bg-claude-bg-secondary'}`}
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

            {/* Display items in order, grouping consecutive tools */}
            {(() => {
              const rendered: JSX.Element[] = [];
              let toolBuffer: Array<{ tool: ToolInfo; result?: ToolResult }> = [];
              let keyIndex = 0;

              const flushTools = () => {
                if (toolBuffer.length > 0) {
                  rendered.push(
                    <div key={`tools-${keyIndex++}`} className="my-2">
                      <ToolGroup tools={toolBuffer} />
                    </div>
                  );
                  toolBuffer = [];
                }
              };

              message.items.forEach((item, index) => {
                if (item.type === 'text') {
                  flushTools();
                  const text = message.role === 'user' ? item.text.replace(/\n/g, '  \n') : item.text;
                  rendered.push(
                    <div key={`text-${keyIndex++}`} className={`break-words leading-relaxed text-claude-text-primary prose prose-invert max-w-none ${rendered.length > 0 ? 'mt-3 pt-3 border-t border-dashed border-claude-border' : ''}`}>
                      <Streamdown plugins={{ code: darkCodePlugin }}>{text}</Streamdown>
                    </div>
                  );
                } else {
                  toolBuffer.push({ tool: item.tool, result: item.result });
                }
              });

              flushTools();
              return rendered;
            })()}

            {/* Streaming content */}
            {showStreamingHere && (
              <div className={`break-words leading-relaxed text-claude-text-primary prose prose-invert max-w-none ${message.items.length > 0 ? 'mt-3 pt-3 border-t border-dashed border-claude-border' : ''}`}>
                <Streamdown plugins={{ code: darkCodePlugin }} isAnimating>{streamingContent}</Streamdown>
              </div>
            )}
          </div>
        );
      })}

      {/* Thinking/Streaming state */}
      {isLoading && !streamingContent && (
        <div className="flex items-center gap-2 py-3 px-6 bg-claude-bg-secondary border-t border-claude-border">
          <div className="flex gap-1">
            <div className="w-1.5 h-1.5 bg-claude-accent rounded-full animate-bounce-dot" style={{ animationDelay: '-0.32s' }} />
            <div className="w-1.5 h-1.5 bg-claude-accent rounded-full animate-bounce-dot" style={{ animationDelay: '-0.16s' }} />
            <div className="w-1.5 h-1.5 bg-claude-accent rounded-full animate-bounce-dot" />
          </div>
          <span className="text-claude-text-muted text-[13px]">Claude is thinking...</span>
        </div>
      )}

      {/* Streaming message - shown as separate block only when last message is not assistant */}
      {streamingContent && !shouldAppendStreaming && (
        <div className="py-4 px-6 border-t border-claude-border bg-claude-bg-secondary">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-6 h-6 rounded flex items-center justify-center text-xs font-semibold bg-claude-accent text-white">✦</div>
            <span className="font-semibold text-[13px] text-claude-text-primary">Claude</span>
            <span className="inline-flex items-center gap-1.5 text-claude-accent text-xs font-medium ml-auto">
              <span className="inline-block animate-spinner-char">·</span>
              typing
            </span>
          </div>
          <div className="break-words leading-relaxed text-claude-text-primary prose prose-invert max-w-none">
            <Streamdown plugins={{ code: darkCodePlugin }} isAnimating>{streamingContent}</Streamdown>
          </div>
        </div>
      )}
    </div>
  );
}
