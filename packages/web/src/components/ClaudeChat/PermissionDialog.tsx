import type { ClaudePendingPermission } from '@ccsandbox/shared';

interface PermissionDialogProps {
  permission: ClaudePendingPermission;
  onResponse: (requestId: string, permission: 'allow' | 'deny') => void;
}

export function PermissionDialog({ permission, onResponse }: PermissionDialogProps) {
  return (
    <div className="claude-permission-dialog">
      <div className="claude-permission-content">
        <div className="claude-permission-header">
          <span className="claude-permission-icon">⚠</span>
          <h3 className="claude-permission-title">Permission Required</h3>
        </div>
        <p className="claude-permission-tool">
          Claude wants to use: <strong>{permission.toolName}</strong>
        </p>
        <pre className="claude-permission-input">
          {JSON.stringify(permission.input, null, 2)}
        </pre>
        <div className="claude-permission-actions">
          <button
            className="claude-permission-deny"
            onClick={() => onResponse(permission.requestId, 'deny')}
          >
            Deny
          </button>
          <button
            className="claude-permission-allow"
            onClick={() => onResponse(permission.requestId, 'allow')}
          >
            Allow
          </button>
        </div>
      </div>
    </div>
  );
}
