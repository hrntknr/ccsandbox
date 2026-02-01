import type { ClaudePendingPermission, ClaudePermissionMode } from '@shared/index.js';
import { ToolInputDisplay } from './ToolInputDisplay';

interface PermissionDialogProps {
  permission: ClaudePendingPermission;
  onResponse: (
    requestId: string,
    permission: 'allow' | 'deny',
    answers?: Record<string, string>,
    permissionMode?: ClaudePermissionMode
  ) => void;
  onChangePermissionMode: (mode: ClaudePermissionMode) => void;
}

const modes: { value: ClaudePermissionMode; label: string; description: string }[] = [
  { value: 'default', label: 'Default', description: 'Manual approval for each action' },
  { value: 'acceptEdits', label: 'Accept Edits', description: 'Auto-accept file edits' },
  { value: 'plan', label: 'Plan Mode', description: 'Read-only, no code changes' },
  { value: 'bypassPermissions', label: 'Bypass All', description: 'Auto-accept all actions' },
];

function getModeColor(mode: ClaudePermissionMode): string {
  switch (mode) {
    case 'acceptEdits':
      return '#a855f7';
    case 'plan':
      return '#059669';
    case 'bypassPermissions':
      return '#ef4444';
    default:
      return 'var(--color-claude-text-secondary)';
  }
}

export function PermissionDialog({ permission, onResponse, onChangePermissionMode }: PermissionDialogProps) {
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" style={{ animation: 'overlay-in 0.2s ease-out' }}>
      <div className="bg-claude-bg-secondary rounded-2xl shadow-2xl shadow-black/40 max-w-lg w-[calc(100%-2rem)] mx-4 overflow-hidden border border-claude-border" style={{ animation: 'modal-in 0.2s ease-out' }}>
        <div className="flex items-center gap-2.5 py-3.5 px-4 bg-claude-bg-tertiary border-b border-claude-border">
          <span className="text-claude-warning text-lg">⚠</span>
          <h3 className="m-0 text-sm font-semibold text-claude-text-primary">Permission Required</h3>
        </div>
        <div className="p-4 max-h-[60vh] overflow-y-auto scrollbar-thin">
          <ToolInputDisplay toolName={permission.toolName} input={permission.input} />
        </div>
        <div className="py-3 px-4 bg-claude-bg-tertiary border-t border-claude-border">
          <div className="flex items-center justify-between gap-3">
            {/* Permission mode dropdown */}
            <div className="flex items-center gap-2 flex-shrink min-w-0">
              <span className="text-[11px] text-claude-text-muted whitespace-nowrap hidden sm:inline">Mode:</span>
              <select
                className="py-1.5 px-2 text-[11px] font-medium border rounded-lg bg-claude-bg-secondary cursor-pointer transition-all appearance-none pr-6 bg-no-repeat bg-[length:12px] bg-[right_6px_center] min-w-0"
                style={{
                  borderColor: 'var(--color-claude-border)',
                  color: 'var(--color-claude-text-secondary)',
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
                }}
                onChange={(e) => onChangePermissionMode(e.target.value as ClaudePermissionMode)}
                title="Change permission mode for subsequent actions"
              >
                {modes.map((mode) => (
                  <option key={mode.value} value={mode.value} style={{ color: getModeColor(mode.value) }}>
                    {mode.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Action buttons */}
            <div className="flex gap-2 flex-shrink-0">
              <button
                className="py-2 px-4 bg-transparent text-claude-text-secondary border border-claude-border rounded-lg cursor-pointer text-[13px] font-medium transition-all hover:bg-claude-bg-hover hover:text-claude-text-primary"
                onClick={() => onResponse(permission.requestId, 'deny')}
              >
                Deny
              </button>
              <button
                className="py-2 px-4 bg-claude-success text-white border-none rounded-lg cursor-pointer text-[13px] font-medium transition-all hover:bg-[#16a34a]"
                onClick={() => onResponse(permission.requestId, 'allow')}
              >
                Allow
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
