import { useState, useCallback } from 'react';
import type { ClaudePendingPermission, AskUserQuestion, PermissionMode } from '@shared/index.js';

interface AskUserQuestionDialogProps {
  permission: ClaudePendingPermission;
  questions: AskUserQuestion[];
  onResponse: (requestId: string, permission: 'allow' | 'deny', answers?: Record<string, string>, permissionMode?: PermissionMode) => void;
}

export function AskUserQuestionDialog({
  permission,
  questions,
  onResponse,
}: AskUserQuestionDialogProps) {
  // State for each question's answer(s)
  // Key: question text, Value: selected label(s) as a Set for multiSelect, or single string
  const [answers, setAnswers] = useState<Record<string, Set<string> | string>>(() => {
    const initial: Record<string, Set<string> | string> = {};
    for (const q of questions) {
      initial[q.question] = q.multiSelect ? new Set<string>() : '';
    }
    return initial;
  });

  // State for custom text input (when user selects "Other")
  const [customInputs, setCustomInputs] = useState<Record<string, string>>({});
  const [showCustomInput, setShowCustomInput] = useState<Record<string, boolean>>({});

  const handleOptionClick = useCallback((question: AskUserQuestion, label: string) => {
    setAnswers((prev) => {
      const newAnswers = { ...prev };
      if (question.multiSelect) {
        const current = prev[question.question] as Set<string>;
        const updated = new Set(current);
        if (updated.has(label)) {
          updated.delete(label);
        } else {
          updated.add(label);
        }
        newAnswers[question.question] = updated;
      } else {
        newAnswers[question.question] = label;
      }
      return newAnswers;
    });
    // Hide custom input if selecting a predefined option
    setShowCustomInput((prev) => ({ ...prev, [question.question]: false }));
  }, []);

  const handleOtherClick = useCallback((question: AskUserQuestion) => {
    setShowCustomInput((prev) => ({ ...prev, [question.question]: true }));
    // Clear predefined selection
    setAnswers((prev) => ({
      ...prev,
      [question.question]: question.multiSelect ? new Set<string>() : '',
    }));
  }, []);

  const handleCustomInputChange = useCallback((question: string, value: string) => {
    setCustomInputs((prev) => ({ ...prev, [question]: value }));
    // Update answer with custom input
    setAnswers((prev) => ({ ...prev, [question]: value }));
  }, []);

  const handleDeny = useCallback(() => {
    onResponse(permission.requestId, 'deny');
  }, [permission.requestId, onResponse]);

  // Check if all questions have answers
  const allAnswered = questions.every((q) => {
    const answer = answers[q.question];
    if (answer instanceof Set) {
      return answer.size > 0;
    }
    return typeof answer === 'string' && answer.length > 0;
  });

  const handleSubmit = useCallback(
    (e?: React.FormEvent) => {
      e?.preventDefault();
      if (!allAnswered) return;
      // Build answers object
      const answersObj: Record<string, string> = {};
      for (const q of questions) {
        const answer = answers[q.question];
        if (answer instanceof Set) {
          answersObj[q.question] = Array.from(answer).join(', ');
        } else {
          answersObj[q.question] = answer as string;
        }
      }
      onResponse(permission.requestId, 'allow', answersObj);
    },
    [answers, questions, permission.requestId, onResponse, allAnswered]
  );

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      style={{ animation: 'overlay-in 0.2s ease-out' }}
    >
      <form
        className="bg-claude-bg-secondary rounded-2xl shadow-2xl shadow-black/40 max-w-lg w-[calc(100%-2rem)] mx-4 overflow-hidden border border-claude-border"
        style={{ animation: 'modal-in 0.2s ease-out' }}
        onSubmit={handleSubmit}
      >
        {/* Header */}
        <div className="flex items-center gap-2.5 py-3.5 px-4 bg-claude-bg-tertiary border-b border-claude-border">
          <span className="text-claude-accent text-lg">?</span>
          <h3 className="m-0 text-sm font-semibold text-claude-text-primary">
            Claude has a question
          </h3>
        </div>

        {/* Questions */}
        <div className="p-4 max-h-[60vh] overflow-y-auto scrollbar-thin">
          {questions.map((q, index) => (
            <div key={index} className={index > 0 ? 'mt-6' : ''}>
              {/* Question header */}
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-medium text-claude-text-tertiary bg-claude-bg-tertiary px-2 py-0.5 rounded">
                  {q.header}
                </span>
                {q.multiSelect && (
                  <span className="text-xs text-claude-text-tertiary">(multiple)</span>
                )}
              </div>

              {/* Question text */}
              <p className="text-sm text-claude-text-primary mb-3">{q.question}</p>

              {/* Options */}
              <div className="space-y-2">
                {q.options.map((option, optIndex) => {
                  const answer = answers[q.question];
                  const isSelected = q.multiSelect
                    ? (answer as Set<string>).has(option.label)
                    : answer === option.label;

                  return (
                    <button
                      type="button"
                      key={optIndex}
                      className={`w-full text-left p-3 rounded-lg border transition-all ${
                        isSelected
                          ? 'border-claude-accent bg-claude-accent/10 text-claude-text-primary'
                          : 'border-claude-border bg-claude-bg-tertiary text-claude-text-secondary hover:border-claude-accent/50 hover:bg-claude-bg-hover'
                      }`}
                      onClick={() => handleOptionClick(q, option.label)}
                    >
                      <div className="flex items-start gap-2">
                        <div
                          className={`mt-0.5 w-4 h-4 rounded ${
                            q.multiSelect ? 'rounded' : 'rounded-full'
                          } border-2 flex items-center justify-center flex-shrink-0 ${
                            isSelected
                              ? 'border-claude-accent bg-claude-accent'
                              : 'border-claude-text-tertiary'
                          }`}
                        >
                          {isSelected && (
                            <span className="text-white text-xs">
                              {q.multiSelect ? '\u2713' : '\u2022'}
                            </span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm">{option.label}</div>
                          {option.description && (
                            <div className="text-xs text-claude-text-tertiary mt-0.5">
                              {option.description}
                            </div>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}

                {/* Other option */}
                <div
                  className={`w-full text-left p-3 rounded-lg border transition-all ${
                    showCustomInput[q.question]
                      ? 'border-claude-accent bg-claude-accent/10'
                      : 'border-claude-border bg-claude-bg-tertiary hover:border-claude-accent/50 hover:bg-claude-bg-hover cursor-pointer'
                  }`}
                  onClick={() => !showCustomInput[q.question] && handleOtherClick(q)}
                >
                  <div className="flex items-start gap-2">
                    <div
                      className={`mt-0.5 w-4 h-4 rounded ${
                        q.multiSelect ? 'rounded' : 'rounded-full'
                      } border-2 flex items-center justify-center flex-shrink-0 ${
                        showCustomInput[q.question]
                          ? 'border-claude-accent bg-claude-accent'
                          : 'border-claude-text-tertiary'
                      }`}
                    >
                      {showCustomInput[q.question] && (
                        <span className="text-white text-xs">
                          {q.multiSelect ? '\u2713' : '\u2022'}
                        </span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      {showCustomInput[q.question] ? (
                        <input
                          type="text"
                          className="w-full bg-transparent text-claude-text-primary text-sm focus:outline-none placeholder:text-claude-text-tertiary"
                          placeholder="Enter your answer..."
                          value={customInputs[q.question] ?? ''}
                          onChange={(e) => handleCustomInputChange(q.question, e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          autoFocus
                        />
                      ) : (
                        <div className="font-medium text-sm text-claude-text-secondary">Other</div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex gap-2 justify-end py-3 px-4 bg-claude-bg-tertiary border-t border-claude-border">
          <button
            type="button"
            className="py-2 px-4 bg-transparent text-claude-text-secondary border border-claude-border rounded-lg cursor-pointer text-[13px] font-medium transition-all hover:bg-claude-bg-hover hover:text-claude-text-primary"
            onClick={handleDeny}
          >
            Skip
          </button>
          <button
            type="submit"
            className={`py-2 px-4 border-none rounded-lg cursor-pointer text-[13px] font-medium transition-all ${
              allAnswered
                ? 'bg-claude-accent text-white hover:bg-[#b04a2a]'
                : 'bg-claude-bg-hover text-claude-text-tertiary cursor-not-allowed'
            }`}
            disabled={!allAnswered}
          >
            Submit
          </button>
        </div>
      </form>
    </div>
  );
}
