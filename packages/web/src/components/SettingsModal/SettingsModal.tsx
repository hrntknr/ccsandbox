import { useState, useEffect, useCallback } from 'react';
import type { ClientConfig, UpdateConfigRequest } from '@ccsandbox/shared';
import { useUpdateConfig } from '../../hooks';
import './SettingsModal.css';

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
    <div className="modal-backdrop" onClick={handleBackdropClick}>
      <div className="modal settings-modal">
        <div className="modal-header">
          <h2>Settings</h2>
          {canClose && (
            <button className="modal-close-button" onClick={onClose} disabled={loading}>
              &times;
            </button>
          )}
        </div>

        <form className="modal-form" onSubmit={handleSubmit}>
          {error && <div className="modal-error">{error}</div>}

          {/* GitHub Section */}
          <div className="settings-section">
            <h3 className="settings-section-title">GitHub</h3>

            <div className="form-field">
              <label htmlFor="pat">Personal Access Token</label>
              <input
                id="pat"
                type="password"
                value={pat}
                onChange={(e) => setPat(e.target.value)}
                placeholder={initialConfig?.hasPat ? '(configured - enter new value to change)' : 'ghp_xxxxxxxxxxxx'}
                autoComplete="off"
              />
              <div className="form-field-hint">
                Required permissions: Contents (Read/Write)
              </div>
            </div>

            <div className="form-field">
              <label htmlFor="apiBase">API Base URL</label>
              <input
                id="apiBase"
                type="text"
                value={apiBase}
                onChange={(e) => setApiBase(e.target.value)}
                placeholder="https://api.github.com"
              />
              <div className="form-field-hint">
                For GitHub Enterprise, use https://your-ghe-host/api/v3
              </div>
            </div>
          </div>

          {/* Dotfiles Section */}
          <div className="settings-section">
            <h3 className="settings-section-title">Dotfiles (Optional)</h3>

            <div className="form-field">
              <label htmlFor="dotfilesRepository">Repository (Optional)</label>
              <input
                id="dotfilesRepository"
                type="text"
                value={dotfilesRepository}
                onChange={(e) => setDotfilesRepository(e.target.value)}
                placeholder="e.g., https://github.com/user/dotfiles"
              />
            </div>

            <div className="form-field">
              <label htmlFor="dotfilesTargetPath">Target Path (Optional)</label>
              <input
                id="dotfilesTargetPath"
                type="text"
                value={dotfilesTargetPath}
                onChange={(e) => setDotfilesTargetPath(e.target.value)}
                placeholder="e.g., ~/dotfiles"
              />
            </div>

            <div className="form-field">
              <label htmlFor="dotfilesInstallCommand">Install Command (Optional)</label>
              <input
                id="dotfilesInstallCommand"
                type="text"
                value={dotfilesInstallCommand}
                onChange={(e) => setDotfilesInstallCommand(e.target.value)}
                placeholder="e.g., ./install.sh"
              />
            </div>
          </div>

          {/* Terminal Section */}
          <div className="settings-section">
            <h3 className="settings-section-title">Terminal</h3>

            <div className="form-field">
              <label htmlFor="defaultShell">Default Shell</label>
              <input
                id="defaultShell"
                type="text"
                value={defaultShell}
                onChange={(e) => setDefaultShell(e.target.value)}
                placeholder="bash"
              />
            </div>
          </div>

          <div className="modal-actions">
            {canClose && (
              <button
                type="button"
                className="button button-secondary"
                onClick={onClose}
                disabled={loading}
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              className="button button-primary"
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
