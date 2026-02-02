import { useCallback, useState, useEffect } from 'react';
import { Streamdown } from 'streamdown';
import { createCodePlugin } from '@streamdown/code';
import type { ClaudePendingPermission, PermissionMode } from '@shared/index.js';

// Create code plugin with dark theme (vitesse-dark for better contrast)
const darkCodePlugin = createCodePlugin({
  themes: ['vitesse-dark', 'vitesse-dark'],
});

interface ExitPlanModeDialogProps {
  permission: ClaudePendingPermission;
  sessionId: string;
  planFilePath?: string | null;
  onResponse: (
    requestId: string,
    permission: 'allow' | 'deny',
    answers?: Record<string, string>,
    permissionMode?: PermissionMode
  ) => void;
}

interface PlanOption {
  id: string;
  label: string;
  description: string;
  mode: PermissionMode;
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
  sessionId,
  planFilePath,
  onResponse,
}: ExitPlanModeDialogProps) {
  const [selectedOption, setSelectedOption] = useState<string | null>(options[0]!.id);
  const [customMessage, setCustomMessage] = useState('');
  const [planContent, setPlanContent] = useState<string | null>(null);
  const [planLoading, setPlanLoading] = useState(true);

  // Fetch plan content from .claude/plans directory
  useEffect(() => {
    async function fetchPlan() {
      try {
        const url = planFilePath
          ? `/api/sessions/${sessionId}/plan?path=${encodeURIComponent(planFilePath)}`
          : `/api/sessions/${sessionId}/plan`;
        const response = await fetch(url);
        if (response.ok) {
          const data = await response.json() as { success: boolean; data?: { content: string } };
          if (data.success && data.data?.content) {
            setPlanContent(data.data.content);
          }
        }
      } catch {
        // Ignore errors - plan display is optional
      } finally {
        setPlanLoading(false);
      }
    }
    fetchPlan();
  }, [sessionId, planFilePath]);

  const handleConfirm = useCallback(() => {
    // Use selected option, or fall back to first option if custom input is focused
    const option = selectedOption
      ? options.find((o) => o.id === selectedOption)
      : options[0];
    if (option) {
      // Pass the selected mode with the response so backend sets it before allowing
      onResponse(permission.requestId, 'allow', undefined, option.mode);
    }
  }, [selectedOption, permission.requestId, onResponse]);

  const handleDeny = useCallback(() => {
    // Deny and stay in plan mode
    onResponse(permission.requestId, 'deny', undefined, 'plan');
  }, [permission.requestId, onResponse]);

  const handleCustomSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (customMessage.trim()) {
        // Deny with feedback and stay in plan mode
        onResponse(permission.requestId, 'deny', { feedback: customMessage.trim() }, 'plan');
      }
    },
    [permission.requestId, onResponse, customMessage]
  );

  // Extract allowedPrompts from input if available
  const allowedPrompts = permission.input['allowedPrompts'] as
    | Array<{ tool: string; prompt: string }>
    | undefined;

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      style={{ animation: 'overlay-in 0.2s ease-out' }}
    >
      <div
        className="bg-claude-bg-secondary rounded-2xl shadow-2xl shadow-black/40 max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden border border-claude-border"
        style={{ animation: 'modal-in 0.2s ease-out' }}
      >
        {/* Header */}
        <div className="flex items-center gap-2.5 py-3.5 px-5 bg-claude-bg-tertiary border-b border-claude-border flex-shrink-0">
          <span className="text-claude-accent text-lg">📋</span>
          <h3 className="m-0 text-base font-semibold text-claude-text-primary">
            Plan Ready for Execution
          </h3>
        </div>

        {/* Content - single scrollable area */}
        <div className="flex-1 overflow-y-auto p-5 scrollbar-thin">
          {/* Plan content */}
          {planLoading ? (
            <div className="mb-5 p-4 bg-claude-bg-tertiary rounded-lg border border-claude-border">
              <div className="text-xs font-medium text-claude-text-tertiary mb-2">
                Plan:
              </div>
              <div className="text-sm text-claude-text-muted animate-pulse">
                Loading plan...
              </div>
            </div>
          ) : planContent ? (
            <div className="mb-5 p-4 bg-claude-bg-tertiary rounded-lg border border-claude-border">
              <div className="text-xs font-medium text-claude-text-tertiary mb-3">
                Plan:
              </div>
              <div className="prose prose-invert prose-sm max-w-none text-claude-text-secondary">
                <Streamdown plugins={{ code: darkCodePlugin }}>{planContent}</Streamdown>
              </div>
            </div>
          ) : null}

          {/* Allowed prompts info */}
          {allowedPrompts && allowedPrompts.length > 0 && (
            <div className="mb-5 p-4 bg-claude-bg-tertiary rounded-lg border border-claude-border">
              <div className="text-xs font-medium text-claude-text-tertiary mb-2">
                Permissions requested:
              </div>
              <div className="space-y-1.5">
                {allowedPrompts.map((prompt, index) => (
                  <div key={index} className="flex items-start gap-2 text-sm">
                    <span className="text-claude-text-muted">•</span>
                    <span className="text-claude-text-secondary">
                      <span className="font-mono text-xs bg-claude-bg-hover px-1.5 py-0.5 rounded">
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
          <div className="space-y-2.5">
            {options.map((option) => {
              const isSelected = selectedOption === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  className={`w-full text-left p-3.5 rounded-lg border transition-all ${
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
              className={`w-full p-3.5 rounded-lg border transition-all ${
                selectedOption === null
                  ? 'border-claude-accent bg-claude-accent/10'
                  : 'border-claude-border bg-claude-bg-tertiary focus-within:border-claude-accent'
              }`}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                    selectedOption === null ? 'border-claude-accent' : 'border-claude-text-tertiary'
                  }`}
                >
                  {selectedOption === null && (
                    <div className="w-2 h-2 rounded-full bg-claude-accent" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <input
                    type="text"
                    className="w-full bg-transparent text-claude-text-primary text-sm focus:outline-none placeholder:text-claude-text-tertiary"
                    placeholder="Type here to tell Claude what to change..."
                    value={customMessage}
                    onChange={(e) => setCustomMessage(e.target.value)}
                    onFocus={() => setSelectedOption(null)}
                  />
                </div>
              </div>
            </form>
          </div>
        </div>

        {/* Footer */}
        <div className="py-4 px-5 bg-claude-bg-tertiary border-t border-claude-border flex-shrink-0">
          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              className="py-2.5 px-5 bg-transparent text-claude-text-secondary border border-claude-border rounded-lg cursor-pointer text-sm font-medium transition-all hover:bg-claude-bg-hover hover:text-claude-text-primary"
              onClick={handleDeny}
            >
              Deny
            </button>
            <button
              type="button"
              className="py-2.5 px-5 bg-claude-accent text-white border-none rounded-lg cursor-pointer text-sm font-medium transition-all hover:bg-[#b04a2a]"
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
