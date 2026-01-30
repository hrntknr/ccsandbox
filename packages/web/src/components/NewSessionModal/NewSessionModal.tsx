import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import type { Repository } from '@ccsandbox/shared';
import { useRepositories, useSessionCreate, useClientConfig } from '../../hooks';
import '@xterm/xterm/css/xterm.css';
import './NewSessionModal.css';

function generateRandomBranchName(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let random = '';
  for (let i = 0; i < 6; i++) {
    random += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `sandbox-${random}`;
}

interface NewSessionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSessionCreated?: () => void;
}

type ModalState = 'form' | 'creating';

export function NewSessionModal({
  isOpen,
  onClose,
  onSessionCreated,
}: NewSessionModalProps) {
  const [modalState, setModalState] = useState<ModalState>('form');
  const [selectedRepo, setSelectedRepo] = useState<Repository | null>(null);
  const [repoFilter, setRepoFilter] = useState('');
  const [baseBranch, setBaseBranch] = useState('');
  const [workBranch, setWorkBranch] = useState('');
  const [shell, setShell] = useState('');

  const terminalContainerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  const {
    data: repositories,
    loading: reposLoading,
    error: reposError,
    execute: fetchRepositories,
    refresh: refreshRepositories,
    refreshing: reposRefreshing,
  } = useRepositories();

  const {
    data: clientConfig,
    execute: fetchClientConfig,
  } = useClientConfig();

  const {
    create,
    cancel,
    logs,
    loading: createLoading,
    error: createError,
    session: createdSession,
    reset: resetCreate,
  } = useSessionCreate();

  // Filtered repositories based on search input
  const filteredRepositories = useMemo(() => {
    if (!repositories) return [];
    if (!repoFilter.trim()) return repositories;
    const lowerFilter = repoFilter.toLowerCase();
    return repositories.filter((repo) =>
      repo.fullName.toLowerCase().includes(lowerFilter)
    );
  }, [repositories, repoFilter]);

  // Reset modal state when opened
  useEffect(() => {
    if (isOpen) {
      fetchRepositories();
      fetchClientConfig();
      setModalState('form');
      setSelectedRepo(null);
      setRepoFilter('');
      setBaseBranch('');
      setWorkBranch(generateRandomBranchName());
      setShell('');
      resetCreate();
    }
  }, [isOpen, fetchRepositories, fetchClientConfig, resetCreate]);

  // Set default shell from config when loaded
  useEffect(() => {
    if (clientConfig?.defaultShell && !shell) {
      setShell(clientConfig.defaultShell);
    }
  }, [clientConfig, shell]);

  // Initialize terminal when entering creating state
  useEffect(() => {
    if (modalState === 'creating' && terminalContainerRef.current && !terminalRef.current) {
      const terminal = new XTerm({
        cursorBlink: false,
        fontSize: 12,
        fontFamily: '"JetBrainsMono Nerd Font", "FiraCode Nerd Font", "MesloLGS NF", "Hack Nerd Font", Menlo, Monaco, "Courier New", monospace',
        theme: {
          background: '#1e1e1e',
          foreground: '#d4d4d4',
          cursor: '#d4d4d4',
        },
        disableStdin: true,
        convertEol: true,
      });

      const fitAddon = new FitAddon();
      terminal.loadAddon(fitAddon);

      terminal.open(terminalContainerRef.current);
      fitAddon.fit();

      terminalRef.current = terminal;
      fitAddonRef.current = fitAddon;
    }

    return () => {
      if (modalState !== 'creating' && terminalRef.current) {
        terminalRef.current.dispose();
        terminalRef.current = null;
        fitAddonRef.current = null;
      }
    };
  }, [modalState]);

  // Write logs to terminal
  useEffect(() => {
    if (terminalRef.current && logs) {
      // Clear and rewrite to handle partial updates cleanly
      terminalRef.current.clear();
      terminalRef.current.write(logs);
    }
  }, [logs]);

  // Handle resize
  useEffect(() => {
    const handleResize = () => {
      if (fitAddonRef.current && modalState === 'creating') {
        fitAddonRef.current.fit();
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [modalState]);

  // Handle session created
  useEffect(() => {
    if (createdSession) {
      // Short delay to let user see the success message
      const timer = setTimeout(() => {
        onSessionCreated?.();
        onClose();
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [createdSession, onSessionCreated, onClose]);

  const handleRepoSelect = useCallback(
    (repo: Repository) => {
      setSelectedRepo(repo);
      setRepoFilter(repo.fullName);
      setBaseBranch(repo.defaultBranch);
    },
    []
  );

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();

      if (!selectedRepo || !baseBranch || !workBranch) {
        return;
      }

      // Switch to creating state
      setModalState('creating');

      // Start creation via WebSocket
      create({
        repo: selectedRepo.fullName,
        baseBranch,
        workBranch,
        shell: shell || undefined,
      });
    },
    [selectedRepo, baseBranch, workBranch, shell, create]
  );

  const handleClose = useCallback(() => {
    if (modalState === 'creating') {
      cancel();
    }
    onClose();
  }, [modalState, cancel, onClose]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget && !createLoading) {
        handleClose();
      }
    },
    [createLoading, handleClose]
  );

  const handleBackToForm = useCallback(() => {
    cancel();
    resetCreate();
    setModalState('form');
  }, [cancel, resetCreate]);

  if (!isOpen) {
    return null;
  }

  const isFormValid = selectedRepo && baseBranch && workBranch;

  // Form view
  if (modalState === 'form') {
    return (
      <div className="modal-backdrop" onClick={handleBackdropClick}>
        <div className="modal">
          <div className="modal-header">
            <h2>New Session</h2>
            <button className="modal-close-button" onClick={handleClose}>
              &times;
            </button>
          </div>

          <form className="modal-form" onSubmit={handleSubmit}>
            {reposError && (
              <div className="modal-error">
                {reposError}
              </div>
            )}

            <div className="form-field form-field-repo">
              <div className="form-field-header">
                <label htmlFor="repository">Repository</label>
                <button
                  type="button"
                  className="refresh-button"
                  onClick={refreshRepositories}
                  disabled={reposLoading || reposRefreshing}
                  title="Refresh repository list"
                >
                  <svg
                    className={`refresh-icon ${reposRefreshing ? 'spinning' : ''}`}
                    viewBox="0 0 16 16"
                    fill="currentColor"
                  >
                    <path d="M1.705 8.005a.75.75 0 0 1 .834.656 5.5 5.5 0 0 0 9.592 2.97l-1.204-1.204a.25.25 0 0 1 .177-.427h3.646a.25.25 0 0 1 .25.25v3.646a.25.25 0 0 1-.427.177l-1.38-1.38A7.002 7.002 0 0 1 1.05 8.84a.75.75 0 0 1 .656-.834ZM8 2.5a5.487 5.487 0 0 0-4.131 1.869l1.204 1.204A.25.25 0 0 1 4.896 6H1.25A.25.25 0 0 1 1 5.75V2.104a.25.25 0 0 1 .427-.177l1.38 1.38A7.002 7.002 0 0 1 14.95 7.16a.75.75 0 0 1-1.49.178A5.5 5.5 0 0 0 8 2.5Z" />
                  </svg>
                </button>
              </div>
              <div className="repo-picker">
                <div className="repo-search-container">
                  <svg className="repo-search-icon" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M11.5 7a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0Zm-.82 4.74a6 6 0 1 1 1.06-1.06l3.04 3.04a.75.75 0 1 1-1.06 1.06l-3.04-3.04Z" />
                  </svg>
                  <input
                    id="repository"
                    type="text"
                    className="repo-search-input"
                    value={repoFilter}
                    onChange={(e) => {
                      setRepoFilter(e.target.value);
                      if (selectedRepo && !selectedRepo.fullName.toLowerCase().includes(e.target.value.toLowerCase())) {
                        setSelectedRepo(null);
                        setBaseBranch('');
                      }
                    }}
                    placeholder={reposLoading ? 'Loading...' : 'Search repositories...'}
                    disabled={reposLoading}
                    autoComplete="off"
                  />
                  {repoFilter && (
                    <button
                      type="button"
                      className="repo-search-clear"
                      onClick={() => {
                        setRepoFilter('');
                        setSelectedRepo(null);
                        setBaseBranch('');
                      }}
                    >
                      <svg viewBox="0 0 16 16" fill="currentColor">
                        <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z" />
                      </svg>
                    </button>
                  )}
                </div>
                <div className="repo-list">
                {reposLoading ? (
                  <div className="repo-list-status">
                    <div className="repo-list-spinner" />
                    <span>Loading repositories...</span>
                  </div>
                ) : filteredRepositories.length === 0 ? (
                  <div className="repo-list-status">
                    <svg viewBox="0 0 16 16" fill="currentColor" className="repo-list-empty-icon">
                      <path d="M2 1.75C2 .784 2.784 0 3.75 0h6.586c.464 0 .909.184 1.237.513l2.914 2.914c.329.328.513.773.513 1.237v9.586A1.75 1.75 0 0 1 13.25 16h-9.5A1.75 1.75 0 0 1 2 14.25Zm1.75-.25a.25.25 0 0 0-.25.25v12.5c0 .138.112.25.25.25h9.5a.25.25 0 0 0 .25-.25V6h-2.75A1.75 1.75 0 0 1 9 4.25V1.5Zm6.75.062V4.25c0 .138.112.25.25.25h2.688l-.011-.013-2.914-2.914-.013-.011Z" />
                    </svg>
                    <span>{repoFilter ? 'No matching repositories' : 'No repositories found'}</span>
                  </div>
                ) : (
                  filteredRepositories.map((repo) => {
                    const isSelected = selectedRepo?.fullName === repo.fullName;
                    const [owner, name] = repo.fullName.split('/');
                    return (
                      <div
                        key={repo.fullName}
                        className={`repo-list-item ${isSelected ? 'selected' : ''}`}
                        onClick={() => handleRepoSelect(repo)}
                      >
                        <svg className="repo-list-item-icon" viewBox="0 0 16 16" fill="currentColor">
                          <path d="M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5Zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8ZM5 12.25a.25.25 0 0 1 .25-.25h3.5a.25.25 0 0 1 .25.25v3.25a.25.25 0 0 1-.4.2l-1.45-1.087a.249.249 0 0 0-.3 0L5.4 15.7a.25.25 0 0 1-.4-.2Z" />
                        </svg>
                        <div className="repo-list-item-text">
                          <span className="repo-owner">{owner}</span>
                          <span className="repo-separator">/</span>
                          <span className="repo-name">{name}</span>
                        </div>
                        {isSelected && (
                          <svg className="repo-list-item-check" viewBox="0 0 16 16" fill="currentColor">
                            <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z" />
                          </svg>
                        )}
                      </div>
                    );
                  })
                )}
                </div>
              </div>
            </div>

            <div className="form-field">
              <label htmlFor="baseBranch">Base Branch</label>
              <input
                id="baseBranch"
                type="text"
                value={baseBranch}
                onChange={(e) => setBaseBranch(e.target.value)}
                placeholder="e.g., main"
                required
              />
            </div>

            <div className="form-field">
              <label htmlFor="workBranch">Work Branch</label>
              <input
                id="workBranch"
                type="text"
                value={workBranch}
                onChange={(e) => setWorkBranch(e.target.value)}
                placeholder="e.g., feature/new-feature"
                required
              />
            </div>

            <div className="form-field">
              <label htmlFor="shell">Shell</label>
              <input
                id="shell"
                type="text"
                value={shell}
                onChange={(e) => setShell(e.target.value)}
                placeholder="e.g., /bin/bash, /bin/zsh"
              />
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="button button-secondary"
                onClick={handleClose}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="button button-primary"
                disabled={!isFormValid}
              >
                Create
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // Creating view with terminal
  return (
    <div className="modal-backdrop" onClick={handleBackdropClick}>
      <div className="modal modal-creating">
        <div className="modal-header">
          <h2>Creating Session</h2>
          <button className="modal-close-button" onClick={handleClose}>
            &times;
          </button>
        </div>

        <div className="modal-creating-content">
          {createError && (
            <div className="modal-error">
              {createError}
            </div>
          )}

          <div className="session-log-terminal" ref={terminalContainerRef} />

          <div className="modal-actions">
            {createError ? (
              <>
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={handleBackToForm}
                >
                  Back
                </button>
                <button
                  type="button"
                  className="button button-primary"
                  onClick={handleClose}
                >
                  Close
                </button>
              </>
            ) : createLoading ? (
              <>
                <span className="creating-status">Creating session...</span>
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={handleClose}
                >
                  Cancel
                </button>
              </>
            ) : createdSession ? (
              <span className="creating-status creating-success">Session created successfully!</span>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
