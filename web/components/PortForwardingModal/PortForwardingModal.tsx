import { useState, useEffect, useCallback } from 'react';
import type { Session } from '@shared/index.js';
import { usePortForwarding } from '../../hooks';

interface PortForwardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  session: Session | null;
}

export function PortForwardingModal({
  isOpen,
  onClose,
  session,
}: PortForwardingModalProps) {
  const [hostPort, setHostPort] = useState('');
  const [containerPort, setContainerPort] = useState('');
  const [label, setLabel] = useState('');

  const { ports, loading, error, listPorts, addPort, removePort } = usePortForwarding(session?.sessionId ?? null);

  // Load ports when modal opens
  useEffect(() => {
    if (isOpen && session) {
      listPorts();
    }
  }, [isOpen, session, listPorts]);

  // Reset form
  const resetForm = useCallback(() => {
    setHostPort('');
    setContainerPort('');
    setLabel('');
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      const hostPortNum = parseInt(hostPort, 10);
      const containerPortNum = parseInt(containerPort, 10);

      if (isNaN(hostPortNum) || isNaN(containerPortNum)) {
        return;
      }

      const result = await addPort({
        hostPort: hostPortNum,
        containerPort: containerPortNum,
        label: label || undefined,
      });

      if (result) {
        resetForm();
      }
    },
    [hostPort, containerPort, label, addPort, resetForm]
  );

  const handleRemove = useCallback(
    async (portId: string) => {
      await removePort(portId);
    },
    [removePort]
  );

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget && !loading) {
        onClose();
      }
    },
    [loading, onClose]
  );

  if (!isOpen || !session) {
    return null;
  }

  const isRunning = session.state === 'RUNNING';

  return (
    <div className="fixed inset-0 bg-black/60 flex justify-center items-center z-[1000]" onClick={handleBackdropClick}>
      <div className="bg-vscode-bg-secondary rounded-lg w-[520px] max-w-[90%] max-h-[90%] overflow-y-auto shadow-[0_4px_20px_rgba(0,0,0,0.4)] max-md:w-[95%] max-md:max-w-none">
        <div className="flex justify-between items-center py-4 px-5 border-b border-vscode-border max-md:py-3 max-md:px-4">
          <h2 className="m-0 text-lg font-semibold text-white max-md:text-base">Port Forwarding</h2>
          <button
            className="bg-transparent border-none text-2xl text-vscode-text-secondary cursor-pointer p-0 leading-none hover:text-white disabled:opacity-50"
            onClick={onClose}
            disabled={loading}
          >
            &times;
          </button>
        </div>

        <div className="p-5 max-md:p-4">
          {error && <div className="bg-vscode-error-bg text-[#ff6b6b] p-3 rounded mb-4 text-[13px]">{error}</div>}

          {!isRunning && (
            <div className="bg-vscode-info-bg text-vscode-info p-3 rounded mb-4 text-[13px]">
              Container must be running to manage port forwarding.
            </div>
          )}

          {/* Port List */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-vscode-text-secondary uppercase tracking-wide m-0 mb-3 pb-2 border-b border-vscode-border max-md:text-[13px]">
              Active Ports
            </h3>

            {ports.length === 0 ? (
              <div className="text-vscode-text-muted text-sm py-4 text-center">
                No port forwarding configured
              </div>
            ) : (
              <div className="space-y-2">
                {ports.map((port) => (
                  <div
                    key={port.id}
                    className="flex items-center justify-between bg-vscode-bg p-3 rounded"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        <span className="text-white font-mono text-sm">{port.hostPort}</span>
                        <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4 text-vscode-text-muted">
                          <path d="M4 8a.5.5 0 0 1 .5-.5h5.793L8.146 5.354a.5.5 0 1 1 .708-.708l3 3a.5.5 0 0 1 0 .708l-3 3a.5.5 0 0 1-.708-.708L10.293 8.5H4.5A.5.5 0 0 1 4 8z" />
                        </svg>
                        <span className="text-white font-mono text-sm">{port.containerPort}</span>
                      </div>
                      {port.label && (
                        <span className="text-vscode-text-secondary text-xs px-2 py-0.5 bg-vscode-border rounded">
                          {port.label}
                        </span>
                      )}
                    </div>
                    <button
                      className="bg-transparent border-none text-vscode-error cursor-pointer p-1 hover:bg-vscode-error-bg rounded disabled:opacity-50"
                      onClick={() => handleRemove(port.id)}
                      disabled={loading}
                      title="Remove port forwarding"
                    >
                      <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
                        <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5Zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5Zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6Z" />
                        <path d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1ZM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118ZM2.5 3h11V2h-11v1Z" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Add Port Form */}
          {isRunning && (
            <div>
              <h3 className="text-sm font-semibold text-vscode-text-secondary uppercase tracking-wide m-0 mb-3 pb-2 border-b border-vscode-border max-md:text-[13px]">
                Add Port Forwarding
              </h3>

              <form onSubmit={handleSubmit}>
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div>
                    <label htmlFor="hostPort" className="block text-[13px] font-medium text-[#ccc] mb-1.5">
                      Host Port
                    </label>
                    <input
                      id="hostPort"
                      type="number"
                      min="1"
                      max="65535"
                      className="w-full py-2.5 px-3 bg-vscode-bg border border-[#444] rounded text-vscode-text text-sm focus:outline-none focus:border-vscode-accent disabled:opacity-60 disabled:cursor-not-allowed placeholder:text-vscode-text-muted"
                      value={hostPort}
                      onChange={(e) => setHostPort(e.target.value)}
                      placeholder="e.g., 8080"
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor="containerPort" className="block text-[13px] font-medium text-[#ccc] mb-1.5">
                      Container Port
                    </label>
                    <input
                      id="containerPort"
                      type="number"
                      min="1"
                      max="65535"
                      className="w-full py-2.5 px-3 bg-vscode-bg border border-[#444] rounded text-vscode-text text-sm focus:outline-none focus:border-vscode-accent disabled:opacity-60 disabled:cursor-not-allowed placeholder:text-vscode-text-muted"
                      value={containerPort}
                      onChange={(e) => setContainerPort(e.target.value)}
                      placeholder="e.g., 3000"
                      required
                    />
                  </div>
                </div>

                <div className="mb-4">
                  <label htmlFor="label" className="block text-[13px] font-medium text-[#ccc] mb-1.5">
                    Label (Optional)
                  </label>
                  <input
                    id="label"
                    type="text"
                    className="w-full py-2.5 px-3 bg-vscode-bg border border-[#444] rounded text-vscode-text text-sm focus:outline-none focus:border-vscode-accent disabled:opacity-60 disabled:cursor-not-allowed placeholder:text-vscode-text-muted"
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    placeholder="e.g., web, api"
                  />
                </div>

                <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    className="py-2.5 px-5 rounded font-medium text-sm cursor-pointer border-none bg-vscode-border-light text-vscode-text hover:bg-[#4a4a4a] disabled:opacity-50 disabled:cursor-not-allowed"
                    onClick={onClose}
                    disabled={loading}
                  >
                    Close
                  </button>
                  <button
                    type="submit"
                    className="py-2.5 px-5 rounded font-medium text-sm cursor-pointer border-none bg-vscode-accent text-white hover:bg-vscode-accent-hover disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={loading || !hostPort || !containerPort}
                  >
                    {loading ? 'Adding...' : 'Add'}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
