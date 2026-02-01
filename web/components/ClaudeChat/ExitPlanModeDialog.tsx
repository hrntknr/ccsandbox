import { useCallback, useState } from 'react';
import type { ClaudePendingPermission, ClaudePermissionMode } from '@shared/index.js';

interface ExitPlanModeDialogProps {
  permission: ClaudePendingPermission;
  onResponse: (
    requestId: string,
    permission: 'allow' | 'deny',
    answers?: Record<string, string>
  ) => void;
  onChangePermissionMode: (mode: ClaudePermissionMode) => void;
}

interface PlanOption {
  id: string;
  label: string;
  description: string;
  mode: ClaudePermissionMode;
}

const options: PlanOption[] = [
  {
    id: 'bypass',
    label: 'Yes, and bypass permissions',
    description: 'Execute with all permissions auto-approved',
    mode: 'bypassPermissions',
  },
  {
    id: 'manual',
    label: 'Yes, and manually approve edits',
    description: 'Proceed with manual approval for each action',
    mode: 'default',
  },
  {
    id: 'accept-edits',
    label: 'Yes, and auto-accept edits',
    description: 'Auto-accept file edits only',
    mode: 'acceptEdits',
  },
];

export function ExitPlanModeDialog({
  permission,
  onResponse,
  onChangePermissionMode,
}: ExitPlanModeDialogProps) {
  const [selectedOption, setSelectedOption] = useState<string>(options[0]!.id);
  const [customMessage, setCustomMessage] = useState('');

  const handleConfirm = useCallback(() => {
    const option = options.find((o) => o.id === selectedOption);
    if (option) {
      onChangePermissionMode(option.mode);
      onResponse(permission.requestId, 'allow');
    }
  }, [selectedOption, permission.requestId, onResponse, onChangePermissionMode]);

  const handleDeny = useCallback(() => {
    // Deny and stay in plan mode
    onChangePermissionMode('plan');
    onResponse(permission.requestId, 'deny');
  }, [permission.requestId, onResponse, onChangePermissionMode]);

  const handleCustomSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (customMessage.trim()) {
        // Deny with feedback and stay in plan mode
        onChangePermissionMode('plan');
        onResponse(permission.requestId, 'deny', { feedback: customMessage.trim() });
      }
    },
    [permission.requestId, onResponse, customMessage, onChangePermissionMode]
  );

  // Extract allowedPrompts from input if available
  const allowedPrompts = permission.input['allowedPrompts'] as
    | Array<{ tool: string; prompt: string }>
    | undefined;

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      style={{ animation: 'overlay-in 0.2s ease-out' }}
    >
      <div
        className="bg-claude-bg-secondary rounded-2xl shadow-2xl shadow-black/40 max-w-lg w-[calc(100%-2rem)] mx-4 overflow-hidden border border-claude-border"
        style={{ animation: 'modal-in 0.2s ease-out' }}
      >
        {/* Header */}
        <div className="flex items-center gap-2.5 py-3.5 px-4 bg-claude-bg-tertiary border-b border-claude-border">
          <span className="text-claude-accent text-lg">📋</span>
          <h3 className="m-0 text-sm font-semibold text-claude-text-primary">
            Plan Ready for Execution
          </h3>
        </div>

        {/* Content */}
        <div className="p-4 max-h-[60vh] overflow-y-auto scrollbar-thin">
          {/* Allowed prompts info */}
          {allowedPrompts && allowedPrompts.length > 0 && (
            <div className="mb-4 p-3 bg-claude-bg-tertiary rounded-lg border border-claude-border">
              <div className="text-xs font-medium text-claude-text-tertiary mb-2">
                Permissions requested:
              </div>
              <div className="space-y-1">
                {allowedPrompts.map((prompt, index) => (
                  <div key={index} className="flex items-start gap-2 text-sm">
                    <span className="text-claude-text-muted">•</span>
                    <span className="text-claude-text-secondary">
                      <span className="font-mono text-xs bg-claude-bg-hover px-1 rounded">
                        {prompt.tool}
                      </span>{' '}
                      {prompt.prompt}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Options */}
          <div className="space-y-2">
            {options.map((option) => {
              const isSelected = selectedOption === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  className={`w-full text-left p-3 rounded-lg border transition-all ${
                    isSelected
                      ? 'border-claude-accent bg-claude-accent/10'
                      : 'border-claude-border bg-claude-bg-tertiary hover:border-claude-accent/50 hover:bg-claude-bg-hover'
                  }`}
                  onClick={() => setSelectedOption(option.id)}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                        isSelected ? 'border-claude-accent' : 'border-claude-text-tertiary'
                      }`}
                    >
                      {isSelected && <div className="w-2 h-2 rounded-full bg-claude-accent" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div
                        className={`font-medium text-sm ${
                          isSelected ? 'text-claude-text-primary' : 'text-claude-text-secondary'
                        }`}
                      >
                        {option.label}
                      </div>
                      <div className="text-xs text-claude-text-tertiary mt-0.5">
                        {option.description}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}

            {/* Custom message input */}
            <form
              onSubmit={handleCustomSubmit}
              className="w-full p-3 rounded-lg border border-claude-border bg-claude-bg-tertiary transition-all focus-within:border-claude-accent"
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5 w-4 h-4 rounded-full border-2 border-claude-text-tertiary flex items-center justify-center flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <input
                    type="text"
                    className="w-full bg-transparent text-claude-text-primary text-sm focus:outline-none placeholder:text-claude-text-tertiary"
                    placeholder="Type here to tell Claude what to change..."
                    value={customMessage}
                    onChange={(e) => setCustomMessage(e.target.value)}
                  />
                </div>
              </div>
            </form>
          </div>
        </div>

        {/* Footer */}
        <div className="py-3 px-4 bg-claude-bg-tertiary border-t border-claude-border">
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              className="py-2 px-4 bg-transparent text-claude-text-secondary border border-claude-border rounded-lg cursor-pointer text-[13px] font-medium transition-all hover:bg-claude-bg-hover hover:text-claude-text-primary"
              onClick={handleDeny}
            >
              Deny
            </button>
            <button
              type="button"
              className="py-2 px-4 bg-claude-accent text-white border-none rounded-lg cursor-pointer text-[13px] font-medium transition-all hover:bg-[#b04a2a]"
              onClick={handleConfirm}
            >
              OK
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
