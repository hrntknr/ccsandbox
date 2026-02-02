import { useState } from 'react';

interface ThinkingBlockProps {
  /** Single thinking content or array of thinking contents to display */
  thinkings: string[];
  previewLines?: number;
}

/**
 * Collapsible thinking block component (Claude Code style)
 * - Collapsed by default
 * - Shows first N lines as preview when collapsed
 * - Expands to show full thinking content on click
 * - Supports multiple thinking blocks merged into one collapsible group
 */
export function ThinkingBlock({ thinkings, previewLines = 3 }: ThinkingBlockProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Merge all thinking contents with separator
  const fullContent = thinkings.join('\n\n---\n\n');
  const lines = fullContent.split('\n');
  const totalLines = lines.length;
  const previewText = lines.slice(0, previewLines).join('\n');
  const hasMoreContent = totalLines > previewLines;
  const blockCount = thinkings.length;

  return (
    <div className="bg-claude-bg-tertiary border border-claude-border rounded-lg overflow-hidden my-2">
      {/* Header */}
      <div
        className="flex items-center gap-2 py-1.5 px-3 bg-claude-bg-hover cursor-pointer select-none hover:bg-claude-bg-hover/80"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <span className="text-claude-text-muted text-[10px]">💭</span>
        <span className="text-claude-text-muted text-[11px] font-medium">
          Thinking{blockCount > 1 ? ` (${blockCount})` : ''}
        </span>
        {!isExpanded && hasMoreContent && (
          <span className="text-claude-text-muted/60 text-[10px]">
            ({totalLines} lines)
          </span>
        )}
        <span
          className={`ml-auto text-claude-text-muted transition-transform duration-200 text-[10px] ${
            isExpanded ? 'rotate-90' : ''
          }`}
        >
          ▶
        </span>
      </div>

      {/* Content */}
      <div className="border-t border-claude-border/30">
        {isExpanded ? (
          // Full content when expanded
          <pre className="font-mono text-xs m-0 p-3 overflow-x-auto text-claude-text-secondary whitespace-pre-wrap max-h-[400px] overflow-y-auto">
            {fullContent}
          </pre>
        ) : (
          // Preview (first N lines) when collapsed - click to expand
          <div className="relative cursor-pointer" onClick={() => setIsExpanded(true)}>
            {hasMoreContent && (
              <div className="absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-claude-bg-tertiary to-transparent pointer-events-none z-[1]" />
            )}
            <pre className="font-mono text-xs m-0 p-3 overflow-x-auto text-claude-text-secondary/70 whitespace-pre-wrap">
              {previewText}
              {hasMoreContent && (
                <span className="text-claude-text-muted/50 italic"> ...</span>
              )}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
