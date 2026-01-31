import type { ClaudePermissionMode } from '@ccsandbox/shared';

interface PermissionModeSelectorProps {
  value: ClaudePermissionMode;
  onChange: (mode: ClaudePermissionMode) => void;
  disabled?: boolean;
}

const modes: { value: ClaudePermissionMode; label: string }[] = [
  { value: 'default', label: 'Default' },
  { value: 'acceptEdits', label: '⏵⏵ accept edits on' },
  { value: 'plan', label: '⏸ plan mode on' },
  { value: 'bypassPermissions', label: '⏵⏵ bypass permissions on' },
];

function getModeActiveClasses(mode: ClaudePermissionMode): string {
  switch (mode) {
    case 'default':
      return 'border-claude-text-secondary text-claude-text-secondary bg-transparent hover:border-claude-text-secondary hover:text-claude-text-secondary hover:bg-claude-bg-hover';
    case 'acceptEdits':
      // Purple
      return 'border-[#a855f7] text-[#a855f7] bg-[rgba(168,85,247,0.1)] hover:border-[#a855f7] hover:text-[#a855f7] hover:bg-[rgba(168,85,247,0.2)]';
    case 'plan':
      // Deep green
      return 'border-[#059669] text-[#059669] bg-[rgba(5,150,105,0.1)] hover:border-[#059669] hover:text-[#059669] hover:bg-[rgba(5,150,105,0.2)]';
    case 'bypassPermissions':
      // Red
      return 'border-[#ef4444] text-[#ef4444] bg-[rgba(239,68,68,0.1)] hover:border-[#ef4444] hover:text-[#ef4444] hover:bg-[rgba(239,68,68,0.2)]';
    default:
      return '';
  }
}

export function PermissionModeSelector({
  value,
  onChange,
  disabled = false,
}: PermissionModeSelectorProps) {
  return (
    <div className="flex items-center gap-1.5">
      {modes.map((mode) => (
        <button
          key={mode.value}
          type="button"
          className={`py-1 px-2.5 text-[11px] font-medium border rounded-[14px] bg-transparent text-claude-text-muted cursor-pointer transition-all whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed ${value === mode.value ? getModeActiveClasses(mode.value) : 'border-claude-border hover:text-claude-text-secondary hover:bg-claude-bg-hover'}`}
          onClick={() => onChange(mode.value)}
          disabled={disabled}
        >
          {mode.label}
        </button>
      ))}
    </div>
  );
}
