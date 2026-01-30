import type { ClaudePermissionMode } from '@ccsandbox/shared';
import './PermissionModeSelector.css';

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

export function PermissionModeSelector({
  value,
  onChange,
  disabled = false,
}: PermissionModeSelectorProps) {
  return (
    <div className="permission-mode-selector">
      {modes.map((mode) => (
        <button
          key={mode.value}
          type="button"
          className={`permission-mode-chip mode-${mode.value} ${value === mode.value ? 'active' : ''}`}
          onClick={() => onChange(mode.value)}
          disabled={disabled}
        >
          {mode.label}
        </button>
      ))}
    </div>
  );
}
