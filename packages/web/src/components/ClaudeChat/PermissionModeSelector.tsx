import type { ClaudePermissionMode } from '@ccsandbox/shared';

interface PermissionModeSelectorProps {
  value: ClaudePermissionMode;
  onChange: (mode: ClaudePermissionMode) => void;
  disabled?: boolean;
}

const modes: { value: ClaudePermissionMode; label: string }[] = [
  { value: 'default', label: 'Default' },
  { value: 'plan', label: 'Plan' },
  { value: 'bypassPermissions', label: 'Auto' },
];

function getModeActiveClasses(mode: ClaudePermissionMode): string {
  switch (mode) {
    case 'default':
      return 'border-claude-accent text-claude-accent bg-[rgba(217,119,6,0.1)]';
    case 'plan':
      return 'border-[#3b82f6] text-[#3b82f6] bg-[rgba(59,130,246,0.1)]';
    case 'bypassPermissions':
      return 'border-claude-success text-claude-success bg-[rgba(34,197,94,0.1)]';
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
          className={`py-1 px-2.5 text-[11px] font-medium border rounded-[14px] bg-transparent text-claude-text-muted cursor-pointer transition-all whitespace-nowrap hover:border-claude-text-secondary hover:text-claude-text-secondary hover:bg-claude-bg-hover disabled:opacity-50 disabled:cursor-not-allowed ${value === mode.value ? getModeActiveClasses(mode.value) : 'border-claude-border'}`}
          onClick={() => onChange(mode.value)}
          disabled={disabled}
        >
          {mode.label}
        </button>
      ))}
    </div>
  );
}
