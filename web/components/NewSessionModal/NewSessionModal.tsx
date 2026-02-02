import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import type { Repository, DevcontainerSource } from '@shared/index.js';
import { useRepositories, useSessionCreate, useClientConfig, useBranches } from '../../hooks';
import '@xterm/xterm/css/xterm.css';

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
  const [branchStrategy, setBranchStrategy] = useState<'create-new' | 'use-existing'>('create-new');
  const [baseBranch, setBaseBranch] = useState('');
  const [workBranch, setWorkBranch] = useState('');
  const [existingBranch, setExistingBranch] = useState('');
  const [shell, setShell] = useState('');
  const [devcontainerSource, setDevcontainerSource] = useState<DevcontainerSource>({ type: 'project' });
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  const [mountClaudeSettings, setMountClaudeSettings] = useState(true);

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
    branches,
    loading: branchesLoading,
    fetchBranches,
    reset: resetBranches,
  } = useBranches();

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
      setBranchStrategy('create-new');
      setBaseBranch('');
      setWorkBranch(generateRandomBranchName());
      setExistingBranch('');
      setShell('');
      setDevcontainerSource({ type: 'project' });
      setSelectedTemplateId('');
      setShowAdvancedOptions(false);
      setMountClaudeSettings(true);
      resetBranches();
      resetCreate();
    }
  }, [isOpen, fetchRepositories, fetchClientConfig, resetBranches, resetCreate]);

  // Set default shell from config when loaded
  useEffect(() => {
    if (clientConfig?.defaultShell && !shell) {
      setShell(clientConfig.defaultShell);
    }
  }, [clientConfig, shell]);

  // Set default template when templates are loaded
  useEffect(() => {
    if (clientConfig?.templates && clientConfig.templates.length > 0 && !selectedTemplateId) {
      setSelectedTemplateId(clientConfig.templates[0]!.id);
    }
  }, [clientConfig, selectedTemplateId]);

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

  // Notify parent when session is created (but don't auto-close)
  useEffect(() => {
    if (createdSession) {
      onSessionCreated?.();
    }
  }, [createdSession, onSessionCreated]);

  const handleRepoSelect = useCallback(
    (repo: Repository) => {
      const defaultBranch = repo.defaultBranch || 'main';
      setSelectedRepo(repo);
      setRepoFilter(repo.fullName);
      setBaseBranch(defaultBranch);
      setExistingBranch(defaultBranch);
      // Fetch branches for the selected repo
      fetchBranches(repo.owner, repo.name);
    },
    [fetchBranches]
  );

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();

      // Determine effective branch values based on strategy
      const effectiveBaseBranch = branchStrategy === 'create-new' ? baseBranch : existingBranch;
      const effectiveWorkBranch = branchStrategy === 'create-new' ? workBranch : existingBranch;

      if (!selectedRepo || !effectiveBaseBranch || !effectiveWorkBranch) {
        return;
      }

      // Determine effective devcontainer source
      const effectiveDevcontainerSource: DevcontainerSource =
        devcontainerSource.type === 'template' && selectedTemplateId
          ? { type: 'template', templateId: selectedTemplateId }
          : { type: 'project' };

      // Switch to creating state
      setModalState('creating');

      // Start creation via WebSocket
      create({
        repo: selectedRepo.fullName,
        baseBranch: effectiveBaseBranch,
        workBranch: effectiveWorkBranch,
        shell: shell || undefined,
        devcontainerSource: effectiveDevcontainerSource,
        mountClaudeSettings,
      });
    },
    [selectedRepo, branchStrategy, baseBranch, workBranch, existingBranch, shell, devcontainerSource, selectedTemplateId, mountClaudeSettings, create]
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

  const isFormValid = selectedRepo && (
    branchStrategy === 'create-new'
      ? baseBranch && workBranch
      : existingBranch
  );

  // Form view
  if (modalState === 'form') {
    return (
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex justify-center items-center z-[1000]" onClick={handleBackdropClick}>
        <div className="bg-[#1e1e1e] rounded-xl w-[520px] max-w-[90%] max-h-[90%] overflow-auto shadow-2xl border border-[#333] max-md:w-[95%] max-md:max-w-none max-md:mx-4 max-md:max-h-[calc(100%-32px)]">
          {/* Header */}
          <div className="flex justify-between items-center py-5 px-6 border-b border-[#333]">
            <div>
              <h2 className="m-0 text-xl font-semibold text-white">New Session</h2>
              <p className="m-0 mt-1 text-sm text-[#888]">Create a new development environment</p>
            </div>
            <button
              className="flex items-center justify-center w-8 h-8 bg-transparent border-none rounded-lg text-[#888] cursor-pointer transition-all hover:text-white hover:bg-[#333]"
              onClick={handleClose}
            >
              <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                <path d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" />
              </svg>
            </button>
          </div>

          <form className="p-6 space-y-5" onSubmit={handleSubmit}>
            {reposError && (
              <div className="flex items-center gap-3 bg-[#3d1f1f] text-[#ff8080] p-4 rounded-lg text-sm border border-[#5c2b2b]">
                <svg className="w-5 h-5 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                {reposError}
              </div>
            )}

            {/* Repository Selection */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm font-medium text-[#e0e0e0]">
                  <svg className="w-4 h-4 text-[#888]" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5Zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8ZM5 12.25a.25.25 0 0 1 .25-.25h3.5a.25.25 0 0 1 .25.25v3.25a.25.25 0 0 1-.4.2l-1.45-1.087a.249.249 0 0 0-.3 0L5.4 15.7a.25.25 0 0 1-.4-.2Z" />
                  </svg>
                  Repository
                </label>
                <button
                  type="button"
                  className="flex items-center justify-center w-7 h-7 p-0 bg-transparent border border-[#444] rounded-md text-[#888] cursor-pointer transition-all hover:text-white hover:border-[#666] hover:bg-[#333] disabled:opacity-50 disabled:cursor-not-allowed"
                  onClick={refreshRepositories}
                  disabled={reposLoading || reposRefreshing}
                  title="Refresh repository list"
                >
                  <svg
                    className={`w-3.5 h-3.5 ${reposRefreshing ? 'animate-spin' : ''}`}
                    viewBox="0 0 16 16"
                    fill="currentColor"
                  >
                    <path d="M1.705 8.005a.75.75 0 0 1 .834.656 5.5 5.5 0 0 0 9.592 2.97l-1.204-1.204a.25.25 0 0 1 .177-.427h3.646a.25.25 0 0 1 .25.25v3.646a.25.25 0 0 1-.427.177l-1.38-1.38A7.002 7.002 0 0 1 1.05 8.84a.75.75 0 0 1 .656-.834ZM8 2.5a5.487 5.487 0 0 0-4.131 1.869l1.204 1.204A.25.25 0 0 1 4.896 6H1.25A.25.25 0 0 1 1 5.75V2.104a.25.25 0 0 1 .427-.177l1.38 1.38A7.002 7.002 0 0 1 14.95 7.16a.75.75 0 0 1-1.49.178A5.5 5.5 0 0 0 8 2.5Z" />
                  </svg>
                </button>
              </div>
              <div className="border border-[#3d3d3d] rounded-lg bg-[#252525] overflow-hidden transition-all focus-within:border-[#0078d4] focus-within:ring-2 focus-within:ring-[#0078d4]/20">
                <div className="relative flex items-center border-b border-[#3d3d3d]">
                  <svg className="absolute left-3 w-4 h-4 text-[#666] pointer-events-none" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M11.5 7a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0Zm-.82 4.74a6 6 0 1 1 1.06-1.06l3.04 3.04a.75.75 0 1 1-1.06 1.06l-3.04-3.04Z" />
                  </svg>
                  <input
                    id="repository"
                    type="text"
                    className="w-full py-3 pl-10 pr-10 bg-transparent border-none text-white text-sm focus:outline-none placeholder:text-[#666]"
                    value={repoFilter}
                    onChange={(e) => {
                      setRepoFilter(e.target.value);
                      if (selectedRepo && !selectedRepo.fullName.toLowerCase().includes(e.target.value.toLowerCase())) {
                        setSelectedRepo(null);
                        setBaseBranch('');
                        resetBranches();
                      }
                    }}
                    placeholder={reposLoading ? 'Loading repositories...' : 'Search repositories...'}
                    disabled={reposLoading}
                    autoComplete="off"
                  />
                  {repoFilter && (
                    <button
                      type="button"
                      className="absolute right-2 flex items-center justify-center w-6 h-6 p-0 bg-transparent border-none rounded text-[#666] cursor-pointer transition-colors hover:text-white"
                      onClick={() => {
                        setRepoFilter('');
                        setSelectedRepo(null);
                        setBaseBranch('');
                        resetBranches();
                      }}
                    >
                      <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
                        <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z" />
                      </svg>
                    </button>
                  )}
                </div>
                <div className="max-h-[160px] overflow-y-auto scrollbar-thin">
                  {reposLoading ? (
                    <div className="flex flex-col items-center justify-center gap-2 py-8 text-[#666] text-sm">
                      <div className="w-6 h-6 border-2 border-[#444] border-t-[#0078d4] rounded-full animate-spin" />
                      <span>Loading repositories...</span>
                    </div>
                  ) : filteredRepositories.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-2 py-8 text-[#666] text-sm">
                      <svg viewBox="0 0 16 16" fill="currentColor" className="w-8 h-8 text-[#444]">
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
                          className={`flex items-center gap-3 py-3 px-4 cursor-pointer transition-all ${isSelected ? 'bg-[#0078d4]/15' : 'hover:bg-[#2d2d2d]'}`}
                          onClick={() => handleRepoSelect(repo)}
                        >
                          <svg className={`shrink-0 w-4 h-4 ${isSelected ? 'text-[#0078d4]' : 'text-[#666]'}`} viewBox="0 0 16 16" fill="currentColor">
                            <path d="M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5Zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8ZM5 12.25a.25.25 0 0 1 .25-.25h3.5a.25.25 0 0 1 .25.25v3.25a.25.25 0 0 1-.4.2l-1.45-1.087a.249.249 0 0 0-.3 0L5.4 15.7a.25.25 0 0 1-.4-.2Z" />
                          </svg>
                          <div className="flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-sm">
                            <span className="text-[#888]">{owner}</span>
                            <span className="text-[#555] mx-0.5">/</span>
                            <span className={`font-medium ${isSelected ? 'text-[#58a6ff]' : 'text-white'}`}>{name}</span>
                          </div>
                          {isSelected && (
                            <svg className="shrink-0 w-4 h-4 text-[#0078d4]" viewBox="0 0 16 16" fill="currentColor">
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

            {/* Branch Strategy */}
            <div className="space-y-3">
              <label className="flex items-center gap-2 text-sm font-medium text-[#e0e0e0]">
                <svg className="w-4 h-4 text-[#888]" viewBox="0 0 16 16" fill="currentColor">
                  <path fillRule="evenodd" d="M11.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5zm-2.25.75a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6a1 1 0 0 0-1 1v1.128a2.251 2.251 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.5 0v1.836A2.492 2.492 0 0 1 6 7h4a1 1 0 0 0 1-1v-.628A2.25 2.25 0 0 1 9.5 3.25zM4.25 12a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5zM3.5 3.25a.75.75 0 1 1 1.5 0 .75.75 0 0 1-1.5 0z" />
                </svg>
                Branch
              </label>
              <div className="grid grid-cols-2 gap-2 p-1 bg-[#252525] rounded-lg border border-[#3d3d3d]">
                <button
                  type="button"
                  onClick={() => setBranchStrategy('create-new')}
                  className={`py-2.5 px-4 rounded-md text-sm font-medium transition-all border-none cursor-pointer ${
                    branchStrategy === 'create-new'
                      ? 'bg-[#0078d4] text-white shadow-lg'
                      : 'bg-transparent text-[#888] hover:text-white hover:bg-[#333]'
                  }`}
                >
                  Create new branch
                </button>
                <button
                  type="button"
                  onClick={() => setBranchStrategy('use-existing')}
                  className={`py-2.5 px-4 rounded-md text-sm font-medium transition-all border-none cursor-pointer ${
                    branchStrategy === 'use-existing'
                      ? 'bg-[#0078d4] text-white shadow-lg'
                      : 'bg-transparent text-[#888] hover:text-white hover:bg-[#333]'
                  }`}
                >
                  Use existing
                </button>
              </div>

              {branchStrategy === 'create-new' ? (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label htmlFor="baseBranch" className="block text-xs text-[#888]">Base branch</label>
                    <div className="relative">
                      <select
                        id="baseBranch"
                        className="w-full py-2.5 px-3 bg-[#252525] border border-[#3d3d3d] rounded-lg text-white text-sm focus:outline-none focus:border-[#0078d4] focus:ring-2 focus:ring-[#0078d4]/20 appearance-none cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                        value={baseBranch || selectedRepo?.defaultBranch || ''}
                        onChange={(e) => setBaseBranch(e.target.value)}
                        disabled={!selectedRepo}
                      >
                        {!selectedRepo && (
                          <option value="">Select a repository first</option>
                        )}
                        {selectedRepo && (
                          <option value={selectedRepo.defaultBranch || 'main'}>
                            {selectedRepo.defaultBranch || 'main'}
                          </option>
                        )}
                        {selectedRepo && branchesLoading && (
                          <option value="" disabled>Loading branches...</option>
                        )}
                        {selectedRepo && !branchesLoading && branches
                          .filter(b => b.name !== (selectedRepo.defaultBranch || 'main'))
                          .map((branch) => (
                            <option key={branch.name} value={branch.name}>
                              {branch.name}{branch.isProtected ? ' (protected)' : ''}
                            </option>
                          ))
                        }
                      </select>
                      <svg className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#666] pointer-events-none" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="workBranch" className="block text-xs text-[#888]">Work branch</label>
                    <input
                      id="workBranch"
                      type="text"
                      className="w-full py-2.5 px-3 bg-[#252525] border border-[#3d3d3d] rounded-lg text-white text-sm focus:outline-none focus:border-[#0078d4] focus:ring-2 focus:ring-[#0078d4]/20 placeholder:text-[#555]"
                      value={workBranch}
                      onChange={(e) => setWorkBranch(e.target.value)}
                      placeholder="sandbox-abc123"
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <label htmlFor="existingBranch" className="block text-xs text-[#888]">Select branch</label>
                  <div className="relative">
                    <select
                      id="existingBranch"
                      className="w-full py-2.5 px-3 bg-[#252525] border border-[#3d3d3d] rounded-lg text-white text-sm focus:outline-none focus:border-[#0078d4] focus:ring-2 focus:ring-[#0078d4]/20 appearance-none cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                      value={existingBranch || selectedRepo?.defaultBranch || ''}
                      onChange={(e) => setExistingBranch(e.target.value)}
                      disabled={!selectedRepo}
                    >
                      {/* Placeholder when no repo selected */}
                      {!selectedRepo && (
                        <option value="">Select a repository first</option>
                      )}
                      {/* Default branch always shown */}
                      {selectedRepo && (
                        <option value={selectedRepo.defaultBranch || 'main'}>
                          {selectedRepo.defaultBranch || 'main'}
                        </option>
                      )}
                      {/* Loading indicator */}
                      {selectedRepo && branchesLoading && (
                        <option value="" disabled>Loading branches...</option>
                      )}
                      {/* Other branches (excluding default) */}
                      {selectedRepo && !branchesLoading && branches
                        .filter(b => b.name !== (selectedRepo.defaultBranch || 'main'))
                        .map((branch) => (
                          <option key={branch.name} value={branch.name}>
                            {branch.name}{branch.isProtected ? ' (protected)' : ''}
                          </option>
                        ))
                      }
                    </select>
                    <svg className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#666] pointer-events-none" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </div>
                </div>
              )}
            </div>

            {/* Development Container */}
            <div className="space-y-3">
              <label className="flex items-center gap-2 text-sm font-medium text-[#e0e0e0]">
                <svg className="w-4 h-4 text-[#888]" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M10.68 1.342a1.003 1.003 0 0 0-1.36 0l-8 7.5a1 1 0 0 0 1.36 1.459l.32-.3V14a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-2h2v2a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1V9.999l.32.3a1 1 0 0 0 1.36-1.458l-8-7.5Z" />
                </svg>
                Development Container
              </label>
              <div className="space-y-2">
                <label className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${devcontainerSource.type === 'project' ? 'border-[#0078d4] bg-[#0078d4]/10' : 'border-[#3d3d3d] bg-[#252525] hover:border-[#555]'}`}>
                  <input
                    type="radio"
                    name="devcontainerSource"
                    checked={devcontainerSource.type === 'project'}
                    onChange={() => setDevcontainerSource({ type: 'project' })}
                    className="sr-only"
                  />
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all ${devcontainerSource.type === 'project' ? 'border-[#0078d4]' : 'border-[#555]'}`}>
                    {devcontainerSource.type === 'project' && <div className="w-2 h-2 rounded-full bg-[#0078d4]" />}
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-medium text-white">Use project's .devcontainer</div>
                    <div className="text-xs text-[#888] mt-0.5">Use the devcontainer configuration from the repository</div>
                  </div>
                </label>
                {clientConfig?.templates && clientConfig.templates.length > 0 && (
                  <>
                    <label className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${devcontainerSource.type === 'template' ? 'border-[#0078d4] bg-[#0078d4]/10' : 'border-[#3d3d3d] bg-[#252525] hover:border-[#555]'}`}>
                      <input
                        type="radio"
                        name="devcontainerSource"
                        checked={devcontainerSource.type === 'template'}
                        onChange={() => setDevcontainerSource({ type: 'template', templateId: selectedTemplateId })}
                        className="sr-only"
                      />
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all ${devcontainerSource.type === 'template' ? 'border-[#0078d4]' : 'border-[#555]'}`}>
                        {devcontainerSource.type === 'template' && <div className="w-2 h-2 rounded-full bg-[#0078d4]" />}
                      </div>
                      <div className="flex-1">
                        <div className="text-sm font-medium text-white">Use template</div>
                        <div className="text-xs text-[#888] mt-0.5">Use a predefined devcontainer template</div>
                      </div>
                    </label>
                    {devcontainerSource.type === 'template' && (
                      <div className="ml-7 relative">
                        <select
                          id="templateSelect"
                          className="w-full py-2.5 px-3 bg-[#252525] border border-[#3d3d3d] rounded-lg text-white text-sm focus:outline-none focus:border-[#0078d4] focus:ring-2 focus:ring-[#0078d4]/20 appearance-none cursor-pointer"
                          value={selectedTemplateId}
                          onChange={(e) => setSelectedTemplateId(e.target.value)}
                        >
                          {clientConfig.templates.map((template) => (
                            <option key={template.id} value={template.id}>
                              {template.name}{template.description ? ` - ${template.description}` : ''}
                            </option>
                          ))}
                        </select>
                        <svg className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#666] pointer-events-none" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Advanced Options (collapsible) */}
            <div className="space-y-3">
              <button
                type="button"
                className="flex items-center gap-2 text-sm font-medium text-[#e0e0e0] w-full hover:text-white transition-colors"
                onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
              >
                <svg
                  className={`w-3 h-3 text-[#888] transition-transform ${showAdvancedOptions ? 'rotate-90' : ''}`}
                  viewBox="0 0 16 16"
                  fill="currentColor"
                >
                  <path d="M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06Z" />
                </svg>
                Advanced Options
              </button>

              {showAdvancedOptions && (
                <div className="space-y-4 pl-5 border-l border-[#3d3d3d]">
                  {/* Shell */}
                  <div className="space-y-1.5">
                    <label htmlFor="shell" className="flex items-center gap-2 text-sm font-medium text-[#e0e0e0]">
                      <svg className="w-4 h-4 text-[#888]" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M0 2.75C0 1.784.784 1 1.75 1h12.5c.966 0 1.75.784 1.75 1.75v10.5A1.75 1.75 0 0 1 14.25 15H1.75A1.75 1.75 0 0 1 0 13.25Zm1.75-.25a.25.25 0 0 0-.25.25v10.5c0 .138.112.25.25.25h12.5a.25.25 0 0 0 .25-.25V2.75a.25.25 0 0 0-.25-.25ZM7.25 8a.75.75 0 0 1-.22.53l-2.25 2.25a.75.75 0 1 1-1.06-1.06L5.44 8 3.72 6.28a.75.75 0 0 1 1.06-1.06l2.25 2.25c.141.14.22.331.22.53Zm1.5 1.5h3a.75.75 0 0 1 0 1.5h-3a.75.75 0 0 1 0-1.5Z" />
                      </svg>
                      Shell
                      <span className="text-xs text-[#666] font-normal">(optional)</span>
                    </label>
                    <input
                      id="shell"
                      type="text"
                      className="w-full py-2.5 px-3 bg-[#252525] border border-[#3d3d3d] rounded-lg text-white text-sm focus:outline-none focus:border-[#0078d4] focus:ring-2 focus:ring-[#0078d4]/20 placeholder:text-[#555]"
                      value={shell}
                      onChange={(e) => setShell(e.target.value)}
                      placeholder="/bin/bash"
                    />
                  </div>

                  {/* Mount Claude Settings */}
                  <label className="flex items-start gap-3 cursor-pointer group">
                    <div className="relative flex items-center justify-center mt-0.5">
                      <input
                        type="checkbox"
                        checked={mountClaudeSettings}
                        onChange={(e) => setMountClaudeSettings(e.target.checked)}
                        className="sr-only"
                      />
                      <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-all ${
                        mountClaudeSettings ? 'border-[#0078d4] bg-[#0078d4]' : 'border-[#555] group-hover:border-[#777]'
                      }`}>
                        {mountClaudeSettings && (
                          <svg className="w-3 h-3 text-white" viewBox="0 0 16 16" fill="currentColor">
                            <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z" />
                          </svg>
                        )}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-white group-hover:text-[#58a6ff] transition-colors">Mount Claude settings from host</div>
                      <div className="text-xs text-[#888] mt-0.5">Mounts ~/.claude.json and ~/.claude/ into the container</div>
                    </div>
                  </label>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                className="py-2.5 px-5 rounded-lg font-medium text-sm cursor-pointer border border-[#444] bg-transparent text-[#ccc] transition-all hover:bg-[#333] hover:border-[#555] hover:text-white"
                onClick={handleClose}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="py-2.5 px-6 rounded-lg font-medium text-sm cursor-pointer border-none bg-[#0078d4] text-white transition-all hover:bg-[#1084d8] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-[#0078d4]"
                disabled={!isFormValid}
              >
                Create Session
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // Creating view with terminal
  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex justify-center items-center z-[1000]" onClick={handleBackdropClick}>
      <div className="bg-[#1e1e1e] rounded-xl w-[900px] max-w-[90%] h-[700px] max-h-[90%] flex flex-col overflow-hidden shadow-2xl border border-[#333] max-md:w-[95%] max-md:max-w-none max-md:h-[calc(100%-32px)] max-md:max-h-none">
        <div className="flex justify-between items-center py-4 px-5 border-b border-[#333]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#0078d4]/20 flex items-center justify-center">
              {createLoading ? (
                <div className="w-4 h-4 border-2 border-[#0078d4]/30 border-t-[#0078d4] rounded-full animate-spin" />
              ) : createError ? (
                <svg className="w-4 h-4 text-[#ff6b6b]" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              ) : createdSession ? (
                <svg className="w-4 h-4 text-[#4ec9b0]" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              ) : (
                <svg className="w-4 h-4 text-[#0078d4]" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                </svg>
              )}
            </div>
            <div>
              <h2 className="m-0 text-lg font-semibold text-white">
                {createError ? 'Creation Failed' : createdSession ? 'Session Created' : 'Creating Session'}
              </h2>
              <p className="m-0 text-xs text-[#888]">
                {createError ? 'An error occurred' : createdSession ? 'Ready to use' : 'Setting up your environment...'}
              </p>
            </div>
          </div>
          <button
            className="flex items-center justify-center w-8 h-8 bg-transparent border-none rounded-lg text-[#888] cursor-pointer transition-all hover:text-white hover:bg-[#333]"
            onClick={handleClose}
          >
            <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
              <path d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" />
            </svg>
          </button>
        </div>

        <div className="flex-1 flex flex-col p-4 min-h-0">
          {createError && (
            <div className="flex items-center gap-3 bg-[#3d1f1f] text-[#ff8080] p-3 rounded-lg text-sm border border-[#5c2b2b] mb-3">
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <span className="flex-1">{createError}</span>
            </div>
          )}

          <div className="flex-1 bg-[#0d0d0d] border border-[#333] rounded-lg overflow-hidden min-h-0" ref={terminalContainerRef} />

          <div className="flex justify-between items-center gap-3 mt-3">
            {createError ? (
              <>
                <button
                  type="button"
                  className="py-2 px-4 rounded-lg font-medium text-sm cursor-pointer border border-[#444] bg-transparent text-[#ccc] transition-all hover:bg-[#333] hover:border-[#555] hover:text-white"
                  onClick={handleBackToForm}
                >
                  Back
                </button>
                <button
                  type="button"
                  className="py-2 px-4 rounded-lg font-medium text-sm cursor-pointer border-none bg-[#0078d4] text-white transition-all hover:bg-[#1084d8]"
                  onClick={handleClose}
                >
                  Close
                </button>
              </>
            ) : createLoading ? (
              <>
                <span className="text-[#888] text-sm flex items-center gap-2">
                  <div className="w-3 h-3 border-2 border-[#444] border-t-[#0078d4] rounded-full animate-spin" />
                  Creating session...
                </span>
                <button
                  type="button"
                  className="py-2 px-4 rounded-lg font-medium text-sm cursor-pointer border border-[#444] bg-transparent text-[#ccc] transition-all hover:bg-[#333] hover:border-[#555] hover:text-white"
                  onClick={handleClose}
                >
                  Cancel
                </button>
              </>
            ) : createdSession ? (
              <span className="text-[#4ec9b0] text-sm flex items-center gap-2">
                <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                Session created successfully!
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
