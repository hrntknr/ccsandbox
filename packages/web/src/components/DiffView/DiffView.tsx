import { useState, useEffect, useCallback } from 'react';
import type { FileDiff, DiffStats } from '@ccsandbox/shared';
import { useDiffDetail } from '../../hooks/useApi';

interface DiffViewProps {
  sessionId: string;
  onClose: () => void;
}

export function DiffView({ sessionId, onClose }: DiffViewProps) {
  const [selectedFileIndex, setSelectedFileIndex] = useState(0);
  const { data, loading, execute } = useDiffDetail(sessionId);

  useEffect(() => {
    execute();
  }, [execute]);

  // Handle ESC key to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const files = data?.files ?? [];
  const stats = data?.stats;
  const selectedFile = files[selectedFileIndex];

  // Close when clicking backdrop
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose]
  );

  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-8"
      onClick={handleBackdropClick}
    >
      {/* Modal container */}
      <div className="bg-vscode-bg border border-vscode-border rounded-lg shadow-2xl flex flex-col w-full max-w-5xl max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-vscode-bg-secondary border-b border-vscode-border shrink-0">
          <div className="flex items-center gap-4">
            <h2 className="text-white text-base font-medium">Diff View</h2>
            {stats && (
              <div className="text-sm">
                <span className="text-green-400">+{stats.insertions}</span>
                <span className="text-vscode-text-muted mx-1">/</span>
                <span className="text-red-400">-{stats.deletions}</span>
                <span className="text-vscode-text-muted ml-2">
                  ({stats.filesChanged} file{stats.filesChanged !== 1 ? 's' : ''})
                </span>
              </div>
            )}
          </div>
          <button
            className="text-vscode-text-muted hover:text-white text-xl leading-none p-1 hover:bg-white/10 rounded"
            onClick={onClose}
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 flex overflow-hidden min-h-0">
          {loading ? (
            <div className="flex-1 flex items-center justify-center text-vscode-text-muted">
              Loading diff...
            </div>
          ) : files.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-vscode-text-muted">
              No changes detected
            </div>
          ) : (
            <>
              {/* File list sidebar */}
              <div className="w-56 min-w-[180px] border-r border-vscode-border bg-vscode-bg-secondary overflow-y-auto shrink-0">
                {files.map((file, index) => (
                  <FileListItem
                    key={file.path}
                    file={file}
                    isSelected={index === selectedFileIndex}
                    onClick={() => setSelectedFileIndex(index)}
                  />
                ))}
              </div>

              {/* Diff content */}
              <div className="flex-1 overflow-auto bg-vscode-bg min-w-0">
                {selectedFile && <FileDiffContent file={selectedFile} />}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

interface FileListItemProps {
  file: FileDiff;
  isSelected: boolean;
  onClick: () => void;
}

function FileListItem({ file, isSelected, onClick }: FileListItemProps) {
  const statusColor = {
    added: 'text-green-400',
    modified: 'text-yellow-400',
    deleted: 'text-red-400',
    renamed: 'text-blue-400',
  }[file.status];

  const statusIcon = {
    added: 'A',
    modified: 'M',
    deleted: 'D',
    renamed: 'R',
  }[file.status];

  return (
    <button
      className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-white/5 ${
        isSelected ? 'bg-white/10 border-l-2 border-vscode-accent' : ''
      }`}
      onClick={onClick}
    >
      <span className={`${statusColor} font-mono text-xs w-4`}>{statusIcon}</span>
      <span className="text-vscode-text-secondary truncate flex-1">{file.path}</span>
      <span className="text-xs shrink-0">
        <span className="text-green-400">+{file.insertions}</span>
        <span className="text-vscode-text-muted">/</span>
        <span className="text-red-400">-{file.deletions}</span>
      </span>
    </button>
  );
}

interface FileDiffContentProps {
  file: FileDiff;
}

function FileDiffContent({ file }: FileDiffContentProps) {
  return (
    <div className="font-mono text-sm">
      {/* File header */}
      <div className="sticky top-0 bg-vscode-bg-secondary px-4 py-2 border-b border-vscode-border">
        <span className="text-vscode-text-secondary">{file.path}</span>
      </div>

      {/* Hunks */}
      <div className="p-0">
        {file.hunks.map((hunk, hunkIndex) => (
          <div key={hunkIndex} className="mb-4">
            {/* Hunk header */}
            <div className="bg-[#1e3a5f] text-[#80b4d8] px-4 py-1 text-xs">
              @@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@
            </div>
            {/* Lines */}
            <div>
              {hunk.lines.map((line, lineIndex) => {
                const bgColor = {
                  add: 'bg-[#1e3a1e]',
                  delete: 'bg-[#3a1e1e]',
                  context: '',
                }[line.type];

                const textColor = {
                  add: 'text-[#4ec94e]',
                  delete: 'text-[#e95c5c]',
                  context: 'text-vscode-text-secondary',
                }[line.type];

                const prefix = {
                  add: '+',
                  delete: '-',
                  context: ' ',
                }[line.type];

                return (
                  <div
                    key={lineIndex}
                    className={`${bgColor} px-4 py-0 leading-6 whitespace-pre ${textColor}`}
                  >
                    <span className="inline-block w-4 shrink-0 select-none opacity-60">{prefix}</span>
                    {line.content}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
