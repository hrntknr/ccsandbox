import { useState, useCallback, useRef, useEffect } from 'react';
import type { ClaudePermissionMode } from '@ccsandbox/shared';
import { PermissionModeSelector } from './PermissionModeSelector';

interface InputFormProps {
  onSubmit: (content: string, permissionMode: ClaudePermissionMode) => void;
  disabled: boolean;
}

export function InputForm({ onSubmit, disabled }: InputFormProps) {
  const [input, setInput] = useState('');
  const [permissionMode, setPermissionMode] = useState<ClaudePermissionMode>('default');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  return (
    <form className="claude-input-form" onSubmit={handleSubmit}>
      <div className="claude-input-wrapper">
        <textarea
          ref={textareaRef}
          className="claude-input-textarea"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={disabled ? 'Waiting for response...' : 'Ask Claude anything...'}
          disabled={disabled}
          rows={1}
        />
        <div className="claude-input-footer">
          <PermissionModeSelector
            value={permissionMode}
            onChange={setPermissionMode}
            disabled={disabled}
          />
          <button
            type="submit"
            className="claude-input-submit"
            disabled={disabled || !input.trim()}
          >
            <span className="claude-input-submit-icon">↑</span>
            Send
          </button>
        </div>
      </div>
    </form>
  );
}
