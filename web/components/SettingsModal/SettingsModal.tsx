import { useState, useEffect, useCallback } from 'react';
import type { ClientConfig, UpdateConfigRequest } from '@shared/index.js';
import { useUpdateConfig } from '../../hooks';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialConfig: ClientConfig | null;
  onConfigUpdated?: (config: ClientConfig) => void;
  requirePat?: boolean;
}

export function SettingsModal({
  isOpen,
  onClose,
  initialConfig,
  onConfigUpdated,
  requirePat = false,
}: SettingsModalProps) {
  const [pat, setPat] = useState('');
  const [apiBase, setApiBase] = useState('');
  const [dotfilesRepository, setDotfilesRepository] = useState('');
  const [dotfilesTargetPath, setDotfilesTargetPath] = useState('');
  const [dotfilesInstallCommand, setDotfilesInstallCommand] = useState('');
  const [defaultShell, setDefaultShell] = useState('bash');
  const [authPassword, setAuthPassword] = useState('');
  const [authPasswordConfirm, setAuthPasswordConfirm] = useState('');
  const [maxThinkingTokens, setMaxThinkingTokens] = useState('10000');

  const { updateConfig, loading, error } = useUpdateConfig();

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen && initialConfig) {
      // PAT is never returned from server, so we keep it empty
      setPat('');
      setApiBase(initialConfig.apiBase ?? '');
      setDotfilesRepository(initialConfig.dotfilesRepository ?? '');
      setDotfilesTargetPath(initialConfig.dotfilesTargetPath ?? '');
      setDotfilesInstallCommand(initialConfig.dotfilesInstallCommand ?? '');
      setDefaultShell(initialConfig.defaultShell ?? 'bash');
      setAuthPassword('');
      setAuthPasswordConfirm('');
      setMaxThinkingTokens(String(initialConfig.maxThinkingTokens ?? 10000));
    }
  }, [isOpen, initialConfig]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      // Build update request (only include non-empty values, or empty to clear)
      const request: UpdateConfigRequest = {};

      // PAT: only include if user entered a value
      if (pat) {
        request.pat = pat;
      }

      // apiBase: only include if changed
      if (apiBase && apiBase !== initialConfig?.apiBase) {
        request.apiBase = apiBase;
      }

      // Other fields: include current value (empty string clears the setting)
      request.dotfilesRepository = dotfilesRepository || undefined;
      request.dotfilesTargetPath = dotfilesTargetPath || undefined;
      request.dotfilesInstallCommand = dotfilesInstallCommand || undefined;
      request.defaultShell = defaultShell || undefined;

      // maxThinkingTokens: parse as number
      const parsedThinkingTokens = parseInt(maxThinkingTokens, 10);
      request.maxThinkingTokens = isNaN(parsedThinkingTokens) ? 0 : parsedThinkingTokens;

      // Password: only include if user entered a value (and it matches confirmation)
      if (authPassword || authPasswordConfirm) {
        if (authPassword !== authPasswordConfirm) {
          return; // Don't submit if passwords don't match
        }
        request.authPassword = authPassword;
      }

      const result = await updateConfig(request);
      if (result) {
        onConfigUpdated?.(result);
        // Only close if PAT requirement is satisfied
        if (!requirePat || result.hasPat) {
          onClose();
        }
      }
    },
    [
      pat,
      apiBase,
      initialConfig?.apiBase,
      dotfilesRepository,
      dotfilesTargetPath,
      dotfilesInstallCommand,
      defaultShell,
      maxThinkingTokens,
      authPassword,
      authPasswordConfirm,
      updateConfig,
      onConfigUpdated,
      onClose,
      requirePat,
    ]
  );

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      // Don't close on backdrop click if PAT is required and not set
      if (e.target === e.currentTarget && !loading && !requirePat) {
        onClose();
      }
    },
    [loading, onClose, requirePat]
  );

  const canClose = !requirePat || initialConfig?.hasPat;

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex justify-center items-center z-[1000]" onClick={handleBackdropClick}>
      <div className="bg-vscode-bg-secondary rounded-lg w-[520px] max-w-[90%] max-h-[90%] overflow-y-auto shadow-[0_4px_20px_rgba(0,0,0,0.4)] max-md:w-[95%] max-md:max-w-none">
        <div className="flex justify-between items-center py-4 px-5 border-b border-vscode-border max-md:py-3 max-md:px-4">
          <h2 className="m-0 text-lg font-semibold text-white max-md:text-base">Settings</h2>
          {canClose && (
            <button className="bg-transparent border-none text-2xl text-vscode-text-secondary cursor-pointer p-0 leading-none hover:text-white disabled:opacity-50" onClick={onClose} disabled={loading}>
              &times;
            </button>
          )}
        </div>

        <form className="p-5 max-md:p-4" onSubmit={handleSubmit}>
          {error && <div className="bg-vscode-error-bg text-[#ff6b6b] p-3 rounded mb-4 text-[13px]">{error}</div>}

          {/* GitHub Section */}
          <div className="mb-6 max-md:mb-5">
            <h3 className="text-sm font-semibold text-vscode-text-secondary uppercase tracking-wide m-0 mb-3 pb-2 border-b border-vscode-border max-md:text-[13px]">GitHub</h3>

            <div className="mb-4 max-md:mb-3.5">
              <label htmlFor="pat" className="block text-[13px] font-medium text-[#ccc] mb-1.5">Personal Access Token</label>
              <input
                id="pat"
                type="password"
                className="w-full py-2.5 px-3 bg-vscode-bg border border-[#444] rounded text-vscode-text text-sm focus:outline-none focus:border-vscode-accent disabled:opacity-60 disabled:cursor-not-allowed placeholder:text-vscode-text-muted max-md:py-3 max-md:text-base"
                value={pat}
                onChange={(e) => setPat(e.target.value)}
                placeholder={initialConfig?.hasPat ? '(configured - enter new value to change)' : 'ghp_xxxxxxxxxxxx'}
                autoComplete="off"
              />
              <div className="text-[11px] text-vscode-text-muted mt-1">
                Required permissions: Contents (Read/Write)
              </div>
            </div>

            <div className="mb-4 max-md:mb-3.5">
              <label htmlFor="apiBase" className="block text-[13px] font-medium text-[#ccc] mb-1.5">API Base URL</label>
              <input
                id="apiBase"
                type="text"
                className="w-full py-2.5 px-3 bg-vscode-bg border border-[#444] rounded text-vscode-text text-sm focus:outline-none focus:border-vscode-accent disabled:opacity-60 disabled:cursor-not-allowed placeholder:text-vscode-text-muted max-md:py-3 max-md:text-base"
                value={apiBase}
                onChange={(e) => setApiBase(e.target.value)}
                placeholder="https://api.github.com"
              />
              <div className="text-[11px] text-vscode-text-muted mt-1">
                For GitHub Enterprise, use https://your-ghe-host/api/v3
              </div>
            </div>
          </div>

          {/* Dotfiles Section */}
          <div className="mb-6 max-md:mb-5">
            <h3 className="text-sm font-semibold text-vscode-text-secondary uppercase tracking-wide m-0 mb-3 pb-2 border-b border-vscode-border max-md:text-[13px]">Dotfiles (Optional)</h3>

            <div className="mb-4 max-md:mb-3.5">
              <label htmlFor="dotfilesRepository" className="block text-[13px] font-medium text-[#ccc] mb-1.5">Repository (Optional)</label>
              <input
                id="dotfilesRepository"
                type="text"
                className="w-full py-2.5 px-3 bg-vscode-bg border border-[#444] rounded text-vscode-text text-sm focus:outline-none focus:border-vscode-accent disabled:opacity-60 disabled:cursor-not-allowed placeholder:text-vscode-text-muted max-md:py-3 max-md:text-base"
                value={dotfilesRepository}
                onChange={(e) => setDotfilesRepository(e.target.value)}
                placeholder="e.g., https://github.com/user/dotfiles"
              />
            </div>

            <div className="mb-4 max-md:mb-3.5">
              <label htmlFor="dotfilesTargetPath" className="block text-[13px] font-medium text-[#ccc] mb-1.5">Target Path (Optional)</label>
              <input
                id="dotfilesTargetPath"
                type="text"
                className="w-full py-2.5 px-3 bg-vscode-bg border border-[#444] rounded text-vscode-text text-sm focus:outline-none focus:border-vscode-accent disabled:opacity-60 disabled:cursor-not-allowed placeholder:text-vscode-text-muted max-md:py-3 max-md:text-base"
                value={dotfilesTargetPath}
                onChange={(e) => setDotfilesTargetPath(e.target.value)}
                placeholder="e.g., ~/dotfiles"
              />
            </div>

            <div className="mb-4 max-md:mb-3.5">
              <label htmlFor="dotfilesInstallCommand" className="block text-[13px] font-medium text-[#ccc] mb-1.5">Install Command (Optional)</label>
              <input
                id="dotfilesInstallCommand"
                type="text"
                className="w-full py-2.5 px-3 bg-vscode-bg border border-[#444] rounded text-vscode-text text-sm focus:outline-none focus:border-vscode-accent disabled:opacity-60 disabled:cursor-not-allowed placeholder:text-vscode-text-muted max-md:py-3 max-md:text-base"
                value={dotfilesInstallCommand}
                onChange={(e) => setDotfilesInstallCommand(e.target.value)}
                placeholder="e.g., ./install.sh"
              />
            </div>
          </div>

          {/* Terminal Section */}
          <div className="mb-6 max-md:mb-5">
            <h3 className="text-sm font-semibold text-vscode-text-secondary uppercase tracking-wide m-0 mb-3 pb-2 border-b border-vscode-border max-md:text-[13px]">Terminal</h3>

            <div className="mb-4 max-md:mb-3.5">
              <label htmlFor="defaultShell" className="block text-[13px] font-medium text-[#ccc] mb-1.5">Default Shell</label>
              <input
                id="defaultShell"
                type="text"
                className="w-full py-2.5 px-3 bg-vscode-bg border border-[#444] rounded text-vscode-text text-sm focus:outline-none focus:border-vscode-accent disabled:opacity-60 disabled:cursor-not-allowed placeholder:text-vscode-text-muted max-md:py-3 max-md:text-base"
                value={defaultShell}
                onChange={(e) => setDefaultShell(e.target.value)}
                placeholder="bash"
              />
            </div>
          </div>

          {/* Claude Section */}
          <div className="mb-6 max-md:mb-5">
            <h3 className="text-sm font-semibold text-vscode-text-secondary uppercase tracking-wide m-0 mb-3 pb-2 border-b border-vscode-border max-md:text-[13px]">Claude</h3>

            <div className="mb-4 max-md:mb-3.5">
              <label htmlFor="maxThinkingTokens" className="block text-[13px] font-medium text-[#ccc] mb-1.5">Max Thinking Tokens</label>
              <input
                id="maxThinkingTokens"
                type="number"
                min="0"
                step="1000"
                className="w-full py-2.5 px-3 bg-vscode-bg border border-[#444] rounded text-vscode-text text-sm focus:outline-none focus:border-vscode-accent disabled:opacity-60 disabled:cursor-not-allowed placeholder:text-vscode-text-muted max-md:py-3 max-md:text-base"
                value={maxThinkingTokens}
                onChange={(e) => setMaxThinkingTokens(e.target.value)}
                placeholder="10000"
              />
              <div className="text-[11px] text-vscode-text-muted mt-1">
                Extended thinking token budget (0 to disable, minimum 1024 when enabled). Changes apply to new Claude tabs.
              </div>
            </div>
          </div>

          {/* Security Section */}
          <div className="mb-0">
            <h3 className="text-sm font-semibold text-vscode-text-secondary uppercase tracking-wide m-0 mb-3 pb-2 border-b border-vscode-border max-md:text-[13px]">Security</h3>

            <div className="mb-4 max-md:mb-3.5">
              <label htmlFor="authPassword" className="block text-[13px] font-medium text-[#ccc] mb-1.5">
                Password {initialConfig?.hasAuthPassword ? '(configured)' : '(optional)'}
              </label>
              <input
                id="authPassword"
                type="password"
                className="w-full py-2.5 px-3 bg-vscode-bg border border-[#444] rounded text-vscode-text text-sm focus:outline-none focus:border-vscode-accent disabled:opacity-60 disabled:cursor-not-allowed placeholder:text-vscode-text-muted max-md:py-3 max-md:text-base"
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                placeholder={initialConfig?.hasAuthPassword ? 'Enter new password to change' : 'Set a password (optional)'}
                autoComplete="new-password"
              />
            </div>

            <div className="mb-4 max-md:mb-3.5">
              <label htmlFor="authPasswordConfirm" className="block text-[13px] font-medium text-[#ccc] mb-1.5">Confirm Password</label>
              <input
                id="authPasswordConfirm"
                type="password"
                className={`w-full py-2.5 px-3 bg-vscode-bg border rounded text-vscode-text text-sm focus:outline-none focus:border-vscode-accent disabled:opacity-60 disabled:cursor-not-allowed placeholder:text-vscode-text-muted max-md:py-3 max-md:text-base ${
                  authPasswordConfirm && authPassword !== authPasswordConfirm
                    ? 'border-red-500'
                    : 'border-[#444]'
                }`}
                value={authPasswordConfirm}
                onChange={(e) => setAuthPasswordConfirm(e.target.value)}
                placeholder="Confirm password"
                autoComplete="new-password"
              />
              {authPasswordConfirm && authPassword !== authPasswordConfirm && (
                <div className="text-[11px] text-red-500 mt-1">Passwords do not match</div>
              )}
            </div>

            <div className="text-[11px] text-vscode-text-muted mt-1">
              Setting a password allows you to authenticate with either the token or password.
              {initialConfig?.hasAuthPassword && ' Leave empty to keep current password.'}
            </div>
          </div>

          <div className="flex justify-end gap-3 mt-6 max-md:flex-col-reverse max-md:gap-2.5">
            {canClose && (
              <button
                type="button"
                className="py-2.5 px-5 rounded font-medium text-sm cursor-pointer border-none bg-vscode-border-light text-vscode-text hover:bg-[#4a4a4a] disabled:opacity-50 disabled:cursor-not-allowed max-md:w-full max-md:py-3"
                onClick={onClose}
                disabled={loading}
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              className="py-2.5 px-5 rounded font-medium text-sm cursor-pointer border-none bg-vscode-accent text-white hover:bg-vscode-accent-hover disabled:opacity-50 disabled:cursor-not-allowed max-md:w-full max-md:py-3"
              disabled={loading || (requirePat && !pat && !initialConfig?.hasPat)}
            >
              {loading ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
