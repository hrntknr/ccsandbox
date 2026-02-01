import { useState, useCallback, useRef, useEffect } from 'react';
import type { PermissionMode } from '@shared/index.js';
import { PermissionModeSelector } from './PermissionModeSelector';

interface InputFormProps {
  onSubmit: (content: string, permissionMode: PermissionMode) => void;
  disabled: boolean;
  isActive: boolean;
  backendPermissionMode?: PermissionMode | null;
  defaultPermissionMode?: PermissionMode;
}

export function InputForm({ onSubmit, disabled, isActive, backendPermissionMode, defaultPermissionMode = 'default' }: InputFormProps) {
  const [input, setInput] = useState('');
  const [permissionMode, setPermissionMode] = useState<PermissionMode>(defaultPermissionMode);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-focus when tab becomes active
  useEffect(() => {
    if (isActive && !disabled) {
      textareaRef.current?.focus();
    }
  }, [isActive, disabled]);

  // Sync permission mode when backend mode changes (EnterPlanMode/ExitPlanMode)
  useEffect(() => {
    if (backendPermissionMode) {
      setPermissionMode(backendPermissionMode);
    }
  }, [backendPermissionMode]);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  }, [input]);

  const handleSubmit = useCallback(
    (e?: React.FormEvent) => {
      e?.preventDefault();
      const trimmed = input.trim();
      if (trimmed && !disabled) {
        onSubmit(trimmed, permissionMode);
        setInput('');
      }
    },
    [input, disabled, onSubmit, permissionMode]
  );

  const cyclePermissionMode = useCallback((reverse: boolean) => {
    const modes: PermissionMode[] = ['default', 'acceptEdits', 'plan', 'bypassPermissions'];
    const currentIndex = modes.indexOf(permissionMode);
    const nextIndex = reverse
      ? (currentIndex - 1 + modes.length) % modes.length
      : (currentIndex + 1) % modes.length;
    setPermissionMode(modes[nextIndex]!);
  }, [permissionMode]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        cyclePermissionMode(e.shiftKey);
        return;
      }
      if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit, cyclePermissionMode]
  );

  return (
    <form className="flex gap-0" onSubmit={handleSubmit}>
      <div className="flex-1 relative bg-claude-bg-secondary/95 backdrop-blur-sm border border-claude-border rounded-2xl shadow-lg shadow-black/20 transition-colors focus-within:border-claude-accent">
        <textarea
          ref={textareaRef}
          className="w-full bg-transparent border-none pt-3 pb-2 px-3.5 text-claude-text-primary font-sans text-base resize-none min-h-[44px] max-h-[200px] leading-normal focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed placeholder:text-claude-text-muted"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={disabled ? 'Waiting for response...' : 'Ask Claude anything...'}
          disabled={disabled}
          rows={1}
        />
        <div className="flex items-center justify-between py-1.5 px-3 border-t border-claude-border/50 bg-claude-bg-tertiary/50 rounded-b-[15px]">
          <PermissionModeSelector
            value={permissionMode}
            onChange={setPermissionMode}
            disabled={disabled}
          />
          <button
            type="submit"
            className="py-1.5 px-3.5 bg-claude-accent text-white border-none rounded-xl cursor-pointer text-[13px] font-medium transition-all flex items-center gap-1.5 hover:bg-claude-accent-hover disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={disabled || !input.trim()}
          >
            <span className="text-sm">↑</span>
          </button>
        </div>
      </div>
    </form>
  );
}
