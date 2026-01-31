import type { ClaudePendingPermission } from '@shared/index.js';

interface PermissionDialogProps {
  permission: ClaudePendingPermission;
  onResponse: (
    requestId: string,
    permission: 'allow' | 'deny',
    answers?: Record<string, string>
  ) => void;
}

export function PermissionDialog({ permission, onResponse }: PermissionDialogProps) {
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" style={{ animation: 'overlay-in 0.2s ease-out' }}>
      <div className="bg-claude-bg-secondary rounded-2xl shadow-2xl shadow-black/40 max-w-md w-[calc(100%-2rem)] mx-4 overflow-hidden border border-claude-border" style={{ animation: 'modal-in 0.2s ease-out' }}>
        <div className="flex items-center gap-2.5 py-3.5 px-4 bg-claude-bg-tertiary border-b border-claude-border">
          <span className="text-claude-warning text-lg">⚠</span>
          <h3 className="m-0 text-sm font-semibold text-claude-text-primary">Permission Required</h3>
        </div>
        <div className="p-4">
          <p className="m-0 mb-3 text-claude-text-secondary text-[13px]">
            Claude wants to use: <strong className="text-claude-accent font-semibold">{permission.toolName}</strong>
          </p>
          <pre className="bg-claude-code-bg rounded-lg p-3 font-mono text-xs overflow-x-auto max-h-[200px] overflow-y-auto text-claude-text-secondary scrollbar-thin">
            {JSON.stringify(permission.input, null, 2)}
          </pre>
        </div>
        <div className="flex gap-2 justify-end py-3 px-4 bg-claude-bg-tertiary border-t border-claude-border">
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
  );
}
