import type { ClaudePermissionMode } from '@shared/index.js';

interface ToolInputDisplayProps {
  toolName: string;
  input: Record<string, unknown>;
}

/**
 * Format file path for display with optional line number
 */
function formatFilePath(path: string, lineNumber?: number): string {
  // Truncate long paths
  const maxLen = 60;
  const displayPath = path.length > maxLen ? '...' + path.slice(-maxLen + 3) : path;
  return lineNumber ? `${displayPath}:${lineNumber}` : displayPath;
}

/**
 * Code block component for displaying code/text content
 */
function CodeBlock({ content, maxHeight = '200px' }: { content: string; maxHeight?: string }) {
  return (
    <pre
      className="bg-claude-code-bg rounded-lg p-3 font-mono text-xs overflow-x-auto overflow-y-auto text-claude-text-secondary scrollbar-thin whitespace-pre-wrap break-all"
      style={{ maxHeight }}
    >
      {content}
    </pre>
  );
}

/**
 * Label-value row component
 */
function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex gap-2 text-[13px]">
      <span className="text-claude-text-muted flex-shrink-0">{label}:</span>
      <span className={`text-claude-text-primary ${mono ? 'font-mono' : ''} break-all`}>{value}</span>
    </div>
  );
}

/**
 * Display Bash tool input
 */
function BashDisplay({ input }: { input: Record<string, unknown> }) {
  const command = String(input['command'] ?? '');
  const description = input['description'] ? String(input['description']) : undefined;
  const timeout = input['timeout'] ? Number(input['timeout']) : undefined;

  return (
    <div className="space-y-2">
      {description && (
        <div className="text-[13px] text-claude-text-secondary italic">{description}</div>
      )}
      <CodeBlock content={command} maxHeight="300px" />
      {timeout && (
        <Row label="Timeout" value={`${Math.round(timeout / 1000)}s`} />
      )}
    </div>
  );
}

/**
 * Display Read tool input
 */
function ReadDisplay({ input }: { input: Record<string, unknown> }) {
  const filePath = String(input['file_path'] ?? '');
  const offset = input['offset'] ? Number(input['offset']) : undefined;
  const limit = input['limit'] ? Number(input['limit']) : undefined;

  return (
    <div className="space-y-1">
      <Row label="File" value={formatFilePath(filePath)} mono />
      {offset && <Row label="From line" value={String(offset)} />}
      {limit && <Row label="Lines" value={String(limit)} />}
    </div>
  );
}

/**
 * Display Write tool input
 */
function WriteDisplay({ input }: { input: Record<string, unknown> }) {
  const filePath = String(input['file_path'] ?? '');
  const content = String(input['content'] ?? '');

  return (
    <div className="space-y-2">
      <Row label="File" value={formatFilePath(filePath)} mono />
      <div className="text-[13px] text-claude-text-muted">Content:</div>
      <CodeBlock content={content} maxHeight="250px" />
    </div>
  );
}

/**
 * Display Edit tool input
 */
function EditDisplay({ input }: { input: Record<string, unknown> }) {
  const filePath = String(input['file_path'] ?? '');
  const oldString = String(input['old_string'] ?? '');
  const newString = String(input['new_string'] ?? '');
  const replaceAll = Boolean(input['replace_all']);

  return (
    <div className="space-y-2">
      <Row label="File" value={formatFilePath(filePath)} mono />
      {replaceAll && (
        <div className="text-[11px] text-claude-warning bg-claude-warning/10 px-2 py-0.5 rounded inline-block">
          Replace all occurrences
        </div>
      )}
      <div className="space-y-1">
        <div className="text-[13px] text-claude-text-muted">Old:</div>
        <div className="bg-[rgba(239,68,68,0.1)] rounded-lg p-2 border-l-2 border-[#ef4444]">
          <pre className="font-mono text-xs text-claude-text-secondary whitespace-pre-wrap break-all m-0">
            {oldString}
          </pre>
        </div>
      </div>
      <div className="space-y-1">
        <div className="text-[13px] text-claude-text-muted">New:</div>
        <div className="bg-[rgba(34,197,94,0.1)] rounded-lg p-2 border-l-2 border-[#22c55e]">
          <pre className="font-mono text-xs text-claude-text-secondary whitespace-pre-wrap break-all m-0">
            {newString}
          </pre>
        </div>
      </div>
    </div>
  );
}

/**
 * Display MultiEdit tool input
 */
function MultiEditDisplay({ input }: { input: Record<string, unknown> }) {
  const filePath = String(input['file_path'] ?? '');
  const edits = Array.isArray(input['edits']) ? input['edits'] as Array<{ old_string?: string; new_string?: string }> : [];

  return (
    <div className="space-y-2">
      <Row label="File" value={formatFilePath(filePath)} mono />
      <div className="text-[13px] text-claude-text-muted">{edits.length} edit(s):</div>
      <div className="space-y-3 max-h-[300px] overflow-y-auto scrollbar-thin">
        {edits.map((edit, i) => (
          <div key={i} className="border border-claude-border rounded-lg p-2 space-y-2">
            <div className="text-[11px] text-claude-text-muted">Edit {i + 1}</div>
            <div className="bg-[rgba(239,68,68,0.1)] rounded p-1.5 border-l-2 border-[#ef4444]">
              <pre className="font-mono text-[11px] text-claude-text-secondary whitespace-pre-wrap break-all m-0">
                {String(edit.old_string ?? '')}
              </pre>
            </div>
            <div className="bg-[rgba(34,197,94,0.1)] rounded p-1.5 border-l-2 border-[#22c55e]">
              <pre className="font-mono text-[11px] text-claude-text-secondary whitespace-pre-wrap break-all m-0">
                {String(edit.new_string ?? '')}
              </pre>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Display Glob tool input
 */
function GlobDisplay({ input }: { input: Record<string, unknown> }) {
  const pattern = String(input['pattern'] ?? '');
  const path = input['path'] ? String(input['path']) : undefined;

  return (
    <div className="space-y-1">
      <Row label="Pattern" value={pattern} mono />
      {path && <Row label="Path" value={formatFilePath(path)} mono />}
    </div>
  );
}

/**
 * Display Grep tool input
 */
function GrepDisplay({ input }: { input: Record<string, unknown> }) {
  const pattern = String(input['pattern'] ?? '');
  const path = input['path'] ? String(input['path']) : undefined;
  const glob = input['glob'] ? String(input['glob']) : undefined;
  const type = input['type'] ? String(input['type']) : undefined;

  return (
    <div className="space-y-1">
      <Row label="Pattern" value={pattern} mono />
      {path && <Row label="Path" value={formatFilePath(path)} mono />}
      {glob && <Row label="Glob" value={glob} mono />}
      {type && <Row label="Type" value={type} />}
    </div>
  );
}

/**
 * Display Task tool input
 */
function TaskDisplay({ input }: { input: Record<string, unknown> }) {
  const description = input['description'] ? String(input['description']) : undefined;
  const prompt = String(input['prompt'] ?? '');
  const subagentType = String(input['subagent_type'] ?? '');

  return (
    <div className="space-y-2">
      <Row label="Agent" value={subagentType} />
      {description && <Row label="Description" value={description} />}
      <div className="text-[13px] text-claude-text-muted">Prompt:</div>
      <CodeBlock content={prompt} maxHeight="200px" />
    </div>
  );
}

/**
 * Display WebFetch tool input
 */
function WebFetchDisplay({ input }: { input: Record<string, unknown> }) {
  const url = String(input['url'] ?? '');
  const prompt = String(input['prompt'] ?? '');

  return (
    <div className="space-y-2">
      <Row label="URL" value={url} mono />
      <div className="text-[13px] text-claude-text-muted">Prompt:</div>
      <CodeBlock content={prompt} />
    </div>
  );
}

/**
 * Display WebSearch tool input
 */
function WebSearchDisplay({ input }: { input: Record<string, unknown> }) {
  const query = String(input['query'] ?? '');

  return (
    <div className="space-y-1">
      <Row label="Query" value={query} />
    </div>
  );
}

/**
 * Display TodoWrite tool input
 */
function TodoWriteDisplay({ input }: { input: Record<string, unknown> }) {
  const todos = Array.isArray(input['todos']) ? input['todos'] as Array<{ content?: string; status?: string }> : [];

  return (
    <div className="space-y-2">
      <div className="text-[13px] text-claude-text-muted">{todos.length} todo(s):</div>
      <div className="space-y-1 max-h-[200px] overflow-y-auto scrollbar-thin">
        {todos.map((todo, i) => (
          <div key={i} className="flex items-center gap-2 text-[13px]">
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
              todo.status === 'completed' ? 'bg-claude-success' :
              todo.status === 'in_progress' ? 'bg-claude-warning' :
              'bg-claude-text-muted'
            }`} />
            <span className="text-claude-text-primary">{todo.content}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Display EnterPlanMode / ExitPlanMode tool input
 */
function PlanModeDisplay({ toolName }: { toolName: string }) {
  const isEnter = toolName === 'EnterPlanMode';
  return (
    <div className="text-[13px] text-claude-text-secondary">
      {isEnter
        ? 'Claude wants to enter plan mode to design an implementation approach.'
        : 'Claude has completed the plan and is ready for approval.'}
    </div>
  );
}

/**
 * Display Skill tool input
 */
function SkillDisplay({ input }: { input: Record<string, unknown> }) {
  const skill = String(input['skill'] ?? '');
  const args = input['args'] ? String(input['args']) : undefined;

  return (
    <div className="space-y-1">
      <Row label="Skill" value={skill} />
      {args && <Row label="Args" value={args} />}
    </div>
  );
}

/**
 * Default display for unknown tools
 */
function DefaultDisplay({ input }: { input: Record<string, unknown> }) {
  return (
    <CodeBlock content={JSON.stringify(input, null, 2)} />
  );
}

/**
 * Get human-readable tool name
 */
function getToolDisplayName(toolName: string): string {
  const names: Record<string, string> = {
    Bash: 'Run Command',
    Read: 'Read File',
    Write: 'Write File',
    Edit: 'Edit File',
    MultiEdit: 'Multi Edit',
    Glob: 'Search Files',
    Grep: 'Search Content',
    Task: 'Launch Agent',
    WebFetch: 'Fetch URL',
    WebSearch: 'Web Search',
    TodoWrite: 'Update Todos',
    EnterPlanMode: 'Enter Plan Mode',
    ExitPlanMode: 'Exit Plan Mode',
    Skill: 'Run Skill',
    NotebookEdit: 'Edit Notebook',
    KillShell: 'Kill Shell',
    TaskOutput: 'Get Task Output',
  };
  return names[toolName] ?? toolName;
}

/**
 * Get tool icon
 */
function getToolIcon(toolName: string): string {
  const icons: Record<string, string> = {
    Bash: '⌘',
    Read: '📄',
    Write: '✏️',
    Edit: '✂️',
    MultiEdit: '📝',
    Glob: '🔍',
    Grep: '🔎',
    Task: '🤖',
    WebFetch: '🌐',
    WebSearch: '🔎',
    TodoWrite: '📋',
    EnterPlanMode: '📐',
    ExitPlanMode: '✅',
    Skill: '⚡',
    NotebookEdit: '📓',
    KillShell: '⛔',
    TaskOutput: '📤',
  };
  return icons[toolName] ?? '🔧';
}

/**
 * Get permission mode display info
 */
export function getPermissionModeInfo(mode: ClaudePermissionMode): {
  label: string;
  color: string;
  bgColor: string;
} {
  switch (mode) {
    case 'acceptEdits':
      return { label: '⏵⏵ Accept Edits', color: '#a855f7', bgColor: 'rgba(168,85,247,0.15)' };
    case 'plan':
      return { label: '⏸ Plan Mode', color: '#059669', bgColor: 'rgba(5,150,105,0.15)' };
    case 'bypassPermissions':
      return { label: '⏵⏵ Bypass', color: '#ef4444', bgColor: 'rgba(239,68,68,0.15)' };
    default:
      return { label: 'Default', color: 'var(--color-claude-text-secondary)', bgColor: 'transparent' };
  }
}

/**
 * Main component for displaying tool input in a human-readable format
 */
export function ToolInputDisplay({ toolName, input }: ToolInputDisplayProps) {
  const displayName = getToolDisplayName(toolName);
  const icon = getToolIcon(toolName);

  const renderContent = () => {
    switch (toolName) {
      case 'Bash':
        return <BashDisplay input={input} />;
      case 'Read':
        return <ReadDisplay input={input} />;
      case 'Write':
        return <WriteDisplay input={input} />;
      case 'Edit':
        return <EditDisplay input={input} />;
      case 'MultiEdit':
        return <MultiEditDisplay input={input} />;
      case 'Glob':
        return <GlobDisplay input={input} />;
      case 'Grep':
        return <GrepDisplay input={input} />;
      case 'Task':
        return <TaskDisplay input={input} />;
      case 'WebFetch':
        return <WebFetchDisplay input={input} />;
      case 'WebSearch':
        return <WebSearchDisplay input={input} />;
      case 'TodoWrite':
        return <TodoWriteDisplay input={input} />;
      case 'EnterPlanMode':
      case 'ExitPlanMode':
        return <PlanModeDisplay toolName={toolName} />;
      case 'Skill':
        return <SkillDisplay input={input} />;
      default:
        return <DefaultDisplay input={input} />;
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-lg">{icon}</span>
        <span className="text-sm font-semibold text-claude-accent">{displayName}</span>
        <span className="text-xs text-claude-text-muted">({toolName})</span>
      </div>
      <div className="pl-7">
        {renderContent()}
      </div>
    </div>
  );
}
