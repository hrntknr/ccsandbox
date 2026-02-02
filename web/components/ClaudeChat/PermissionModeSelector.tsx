import type { PermissionMode } from '@shared/index.js';

interface PermissionModeSelectorProps {
  value: PermissionMode;
  onChange: (mode: PermissionMode) => void;
  disabled?: boolean;
}

const modes: { value: PermissionMode; label: string; shortLabel: string }[] = [
  { value: 'default', label: 'Default', shortLabel: 'Default' },
  { value: 'acceptEdits', label: '⏵⏵ accept edits on', shortLabel: '⏵⏵ edits' },
  { value: 'plan', label: '⏸ plan mode on', shortLabel: '⏸ plan' },
  { value: 'bypassPermissions', label: '⏵⏵ bypass permissions on', shortLabel: '⏵⏵ bypass' },
];

function getModeActiveClasses(mode: PermissionMode): string {
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

function getModeSelectColor(mode: PermissionMode): string {
  switch (mode) {
    case 'acceptEdits':
      return '#a855f7';
    case 'plan':
      return '#059669';
    case 'bypassPermissions':
      return '#ef4444';
    default:
      return '';
  }
}

export function PermissionModeSelector({
  value,
  onChange,
  disabled = false,
}: PermissionModeSelectorProps) {
  const selectColor = getModeSelectColor(value);

  return (
    <>
      {/* Wide: Button group (screen width >= 1080px) */}
      <div className="hidden min-[1080px]:flex items-center gap-1.5">
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

      {/* Narrow: Dropdown (screen width < 1080px) */}
      <select
        className="min-[1080px]:hidden py-1 px-2 text-[11px] font-medium border rounded-[14px] bg-claude-bg-tertiary cursor-pointer transition-all disabled:opacity-50 disabled:cursor-not-allowed appearance-none pr-6 bg-no-repeat bg-[length:12px] bg-[right_6px_center]"
        style={{
          borderColor: selectColor || 'var(--color-claude-border)',
          color: selectColor || 'var(--color-claude-text-secondary)',
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
        }}
        value={value}
        onChange={(e) => onChange(e.target.value as PermissionMode)}
        disabled={disabled}
      >
        {modes.map((mode) => (
          <option key={mode.value} value={mode.value}>
            {mode.shortLabel}
          </option>
        ))}
      </select>
    </>
  );
}
