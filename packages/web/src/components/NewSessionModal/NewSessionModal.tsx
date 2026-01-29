import { useState, useEffect, useCallback, useRef } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import type { Repository } from '@ccsandbox/shared';
import { useRepositories, useSessionCreate } from '../../hooks';
import '@xterm/xterm/css/xterm.css';
import './NewSessionModal.css';

interface NewSessionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSessionCreated: () => void;
}

type ModalState = 'form' | 'creating';

export function NewSessionModal({
  isOpen,
  onClose,
  onSessionCreated,
}: NewSessionModalProps) {
  const [modalState, setModalState] = useState<ModalState>('form');
  const [selectedRepo, setSelectedRepo] = useState<Repository | null>(null);
  const [baseBranch, setBaseBranch] = useState('');
  const [workBranch, setWorkBranch] = useState('');

  const terminalContainerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  const {
    data: repositories,
    loading: reposLoading,
    error: reposError,
    execute: fetchRepositories,
  } = useRepositories();

  const {
    create,
    cancel,
    logs,
    loading: createLoading,
    error: createError,
    session: createdSession,
    reset: resetCreate,
  } = useSessionCreate();

  // Reset modal state when opened
  useEffect(() => {
    if (isOpen) {
      fetchRepositories();
      setModalState('form');
      setSelectedRepo(null);
      setBaseBranch('');
      setWorkBranch('');
      resetCreate();
    }
  }, [isOpen, fetchRepositories, resetCreate]);

  // Initialize terminal when entering creating state
  useEffect(() => {
    if (modalState === 'creating' && terminalContainerRef.current && !terminalRef.current) {
      const terminal = new XTerm({
        cursorBlink: false,
        fontSize: 12,
        fontFamily: 'Menlo, Monaco, "Courier New", monospace',
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
        onSessionCreated();
        onClose();
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [createdSession, onSessionCreated, onClose]);

  const handleRepoChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const repoFullName = e.target.value;
      const repo = repositories?.find((r) => r.fullName === repoFullName) ?? null;
      setSelectedRepo(repo);
      if (repo) {
        setBaseBranch(repo.defaultBranch);
      } else {
        setBaseBranch('');
      }
    },
    [repositories]
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
      });
    },
    [selectedRepo, baseBranch, workBranch, create]
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

            <div className="form-field">
              <label htmlFor="repository">Repository</label>
              <select
                id="repository"
                value={selectedRepo?.fullName ?? ''}
                onChange={handleRepoChange}
                disabled={reposLoading}
                required
              >
                <option value="">
                  {reposLoading ? 'Loading repositories...' : 'Select a repository'}
                </option>
                {repositories?.map((repo) => (
                  <option key={repo.fullName} value={repo.fullName}>
                    {repo.fullName}
                  </option>
                ))}
              </select>
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
