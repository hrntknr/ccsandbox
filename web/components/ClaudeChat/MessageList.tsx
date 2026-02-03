import { useState, useEffect, useRef } from 'react';
import { Streamdown } from 'streamdown';
import { createCodePlugin } from '@streamdown/code';
import type { ClaudeMessage, ImageAttachment } from '@shared/index.js';
import { AnsiOutput } from './AnsiOutput';
import { ThinkingBlock } from './ThinkingBlock';

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

function ToolBadge({ tool, result }: ToolItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [offsetX, setOffsetX] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const getStatus = () => {
    if (!result) return { icon: '●', className: 'bg-claude-accent/20 text-claude-accent border-claude-accent/30' };
    if (result.isError) return { icon: '✕', className: 'bg-claude-error/10 text-claude-error border-claude-error/30' };
    return { icon: '✓', className: 'bg-claude-success/10 text-claude-success border-claude-success/30' };
  };

  // Calculate offset when expanded to keep popover within viewport
  useEffect(() => {
    if (!isExpanded || !containerRef.current || !popoverRef.current) return;

    const containerRect = containerRef.current.getBoundingClientRect();
    const popoverRect = popoverRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const margin = 8;

    // Calculate how much the popover overflows on the right
    const rightEdge = containerRect.left + popoverRect.width;
    const overflow = rightEdge - (viewportWidth - margin);

    if (overflow > 0) {
      // Shift left, but don't go beyond the left edge of the viewport
      const maxOffset = containerRect.left - margin;
      setOffsetX(-Math.min(overflow, maxOffset));
    } else {
      setOffsetX(0);
    }
  }, [isExpanded]);

  // Close when clicking outside
  useEffect(() => {
    if (!isExpanded) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsExpanded(false);
      }
    };
    // Use setTimeout to avoid immediate close from the toggle button click
    const timer = setTimeout(() => {
      document.addEventListener('click', handleClickOutside);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('click', handleClickOutside);
    };
  }, [isExpanded]);

  // Close on ESC key
  useEffect(() => {
    if (!isExpanded) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsExpanded(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isExpanded]);

  const status = getStatus();

  return (
    <div className="relative" ref={containerRef}>
      <button
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border cursor-pointer select-none hover:opacity-80 transition-opacity ${status.className}`}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <span className="text-[9px]">{status.icon}</span>
        <span>{tool.name}</span>
      </button>
      {isExpanded && (
        <div
          ref={popoverRef}
          className="absolute left-0 top-full mt-1 z-10 min-w-[300px] max-w-[min(500px,calc(100vw-1rem))] bg-claude-bg-tertiary border border-claude-border rounded-lg shadow-lg overflow-hidden"
          style={{ transform: `translateX(${offsetX}px)` }}
        >
          <div className="flex items-center justify-between py-1.5 px-2.5 bg-claude-bg-hover text-claude-text-muted text-[11px] border-b border-claude-border/50">
            <span className="font-medium text-claude-text-primary">{tool.name}</span>
            <button
              className="text-claude-text-muted hover:text-claude-text-primary text-xs"
              onClick={(e) => { e.stopPropagation(); setIsExpanded(false); }}
            >
              ✕
            </button>
          </div>
          <div className="bg-claude-code-bg max-h-[50vh] overflow-auto">
            <pre className="font-mono text-xs m-0 p-2 text-claude-text-secondary whitespace-pre-wrap break-all">
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
    <div className="flex flex-wrap items-center gap-1.5 mt-2">
      {tools.map((item) => (
        <ToolBadge
          key={item.tool.id}
          tool={item.tool}
          result={item.result}
        />
      ))}
    </div>
  );
}

// Item type for preserving order
type ContentItem =
  | { type: 'text'; text: string }
  | { type: 'thinking'; thinking: string }
  | { type: 'tool'; tool: ToolInfo; result?: ToolResult }
  | { type: 'images'; images: ImageAttachment[] };

interface GroupedMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  items: ContentItem[];
  timestamp: string;
}

/**
 * Component to display image attachments
 */
function ImageGallery({ images }: { images: ImageAttachment[] }) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  return (
    <>
      <div className="flex flex-wrap gap-2 mt-2">
        {images.map((img, index) => (
          <button
            key={index}
            onClick={() => setExpandedIndex(index)}
            className="relative group cursor-pointer"
          >
            <img
              src={`data:${img.mediaType};base64,${img.data}`}
              alt={`Attachment ${index + 1}`}
              className="w-24 h-24 object-cover rounded-lg border border-claude-border hover:border-claude-accent transition-colors"
            />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 rounded-lg transition-colors flex items-center justify-center">
              <span className="opacity-0 group-hover:opacity-100 text-white text-xs">Click to expand</span>
            </div>
          </button>
        ))}
      </div>
      {/* Expanded image modal */}
      {expandedIndex !== null && images[expandedIndex] && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setExpandedIndex(null)}
        >
          <button
            className="absolute top-4 right-4 text-white text-2xl hover:text-gray-300"
            onClick={() => setExpandedIndex(null)}
          >
            ×
          </button>
          <img
            src={`data:${images[expandedIndex].mediaType};base64,${images[expandedIndex].data}`}
            alt={`Attachment ${expandedIndex + 1}`}
            className="max-w-full max-h-full object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}

function groupConsecutiveMessages(messages: ClaudeMessage[]): GroupedMessage[] {
  const grouped: GroupedMessage[] = [];

  for (const message of messages) {
    const last = grouped[grouped.length - 1];

    // Create items from message (preserving order)
    const items: ContentItem[] = [];

    // Thinking content (shown first, before text)
    if (message.thinking?.trim()) {
      items.push({ type: 'thinking', thinking: message.thinking });
    }

    // Images (for user messages, shown before text)
    if (message.images && message.images.length > 0) {
      items.push({ type: 'images', images: message.images });
    }

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

            {/* Display items in order, grouping consecutive tools and thinkings */}
            {(() => {
              const rendered: React.ReactElement[] = [];
              let toolBuffer: Array<{ tool: ToolInfo; result?: ToolResult }> = [];
              let thinkingBuffer: string[] = [];
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

              const flushThinkings = () => {
                if (thinkingBuffer.length > 0) {
                  rendered.push(
                    <ThinkingBlock key={`thinking-${keyIndex++}`} thinkings={thinkingBuffer} />
                  );
                  thinkingBuffer = [];
                }
              };

              message.items.forEach((item) => {
                if (item.type === 'thinking') {
                  // Flush tools before accumulating thinking
                  flushTools();
                  thinkingBuffer.push(item.thinking);
                } else if (item.type === 'images') {
                  // Flush both buffers before images
                  flushThinkings();
                  flushTools();
                  rendered.push(
                    <ImageGallery key={`images-${keyIndex++}`} images={item.images} />
                  );
                } else if (item.type === 'text') {
                  // Flush both buffers before text
                  flushThinkings();
                  flushTools();
                  const text = message.role === 'user' ? item.text.replace(/\n/g, '  \n') : item.text;
                  rendered.push(
                    <div key={`text-${keyIndex++}`} className={`break-words leading-relaxed text-claude-text-primary prose prose-invert max-w-none ${rendered.length > 0 ? 'mt-3' : ''}`}>
                      <Streamdown plugins={{ code: darkCodePlugin }}>{text}</Streamdown>
                    </div>
                  );
                } else {
                  // Tool item - flush thinkings first
                  flushThinkings();
                  toolBuffer.push({ tool: item.tool, result: item.result });
                }
              });

              // Flush remaining buffers
              flushThinkings();
              flushTools();
              return rendered;
            })()}

            {/* Streaming content */}
            {showStreamingHere && (
              <div className={`break-words leading-relaxed text-claude-text-primary prose prose-invert max-w-none ${message.items.length > 0 ? 'mt-3' : ''}`}>
                <Streamdown plugins={{ code: darkCodePlugin }} isAnimating>{streamingContent}</Streamdown>
              </div>
            )}
          </div>
        );
      })}

      {/* Thinking/Streaming state */}
      {isLoading && !streamingContent && (
        <div className="flex items-center gap-2 py-3 px-6">
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
