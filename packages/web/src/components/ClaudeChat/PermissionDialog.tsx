import type { ClaudePendingPermission } from '@ccsandbox/shared';

interface PermissionDialogProps {
  permission: ClaudePendingPermission;
  onResponse: (requestId: string, permission: 'allow' | 'deny') => void;
}

export function PermissionDialog({ permission, onResponse }: PermissionDialogProps) {
  return (
    <div className="bg-claude-bg-secondary border-t border-claude-border p-0">
      <div className="max-w-full m-0">
        <div className="flex items-center gap-2.5 py-3 px-4 bg-claude-bg-tertiary border-b border-claude-border">
          <span className="text-claude-warning text-lg">⚠</span>
          <h3 className="m-0 text-sm font-semibold text-claude-text-primary">Permission Required</h3>
        </div>
        <p className="m-0 py-3 px-4 text-claude-text-secondary text-[13px] border-b border-claude-border">
          Claude wants to use: <strong className="text-claude-accent font-semibold">{permission.toolName}</strong>
        </p>
        <pre className="bg-claude-code-bg m-0 py-3 px-4 font-mono text-xs overflow-x-auto max-h-[200px] overflow-y-auto text-claude-text-secondary border-b border-claude-border">
          {JSON.stringify(permission.input, null, 2)}
        </pre>
        <div className="flex gap-2 justify-end py-3 px-4 bg-claude-bg-tertiary">
          <button
            className="py-2 px-4 bg-transparent text-claude-text-secondary border border-claude-border rounded-md cursor-pointer text-[13px] font-medium transition-all hover:bg-claude-bg-hover hover:text-claude-text-primary"
            onClick={() => onResponse(permission.requestId, 'deny')}
          >
            Deny
          </button>
          <button
            className="py-2 px-4 bg-claude-success text-white border-none rounded-md cursor-pointer text-[13px] font-medium transition-all hover:bg-[#16a34a]"
            onClick={() => onResponse(permission.requestId, 'allow')}
          >
            Allow
          </button>
        </div>
      </div>
    </div>
  );
}
