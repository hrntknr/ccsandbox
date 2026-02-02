import type { TodoItem } from '@shared/index.js';

interface TodoListProps {
  todos: TodoItem[];
}

export function TodoList({ todos }: TodoListProps) {
  if (todos.length === 0) {
    return null;
  }

  const pendingCount = todos.filter((t) => t.status === 'pending').length;
  const inProgressCount = todos.filter((t) => t.status === 'in_progress').length;
  const completedCount = todos.filter((t) => t.status === 'completed').length;

  return (
    <div className="mb-2 bg-claude-bg-secondary/95 backdrop-blur-sm border border-claude-border rounded-lg overflow-hidden shadow-lg shadow-black/20">
      {/* Header */}
      <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-claude-border/50">
        <div className="flex items-center gap-1.5">
          <svg
            className="w-3 h-3 text-claude-text-secondary"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
            />
          </svg>
          <span className="text-[10px] font-medium text-claude-text-secondary uppercase tracking-wide">
            Todo
          </span>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-claude-text-secondary">
          {inProgressCount > 0 && (
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-claude-accent animate-pulse" />
              {inProgressCount}
            </span>
          )}
          {pendingCount > 0 && (
            <span className="opacity-60">{pendingCount} pending</span>
          )}
          {completedCount > 0 && (
            <span className="text-green-500/80">{completedCount} done</span>
          )}
        </div>
      </div>

      {/* Todo list */}
      <div className="max-h-24 overflow-y-auto scrollbar-thin">
        {todos.map((todo, index) => (
          <TodoItemRow key={index} todo={todo} />
        ))}
      </div>
    </div>
  );
}

interface TodoItemRowProps {
  todo: TodoItem;
}

function TodoItemRow({ todo }: TodoItemRowProps) {
  const statusStyles = {
    pending: {
      checkbox: 'border-claude-border/60 bg-transparent',
      text: 'text-claude-text-secondary',
      icon: null,
    },
    in_progress: {
      checkbox: 'border-claude-accent bg-claude-accent/20',
      text: 'text-claude-text-primary',
      icon: (
        <svg
          className="w-2 h-2 text-claude-accent animate-spin"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
      ),
    },
    completed: {
      checkbox: 'border-green-500/60 bg-green-500/80',
      text: 'text-claude-text-secondary/60 line-through',
      icon: (
        <svg
          className="w-2 h-2 text-white"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={3}
            d="M5 13l4 4L19 7"
          />
        </svg>
      ),
    },
  };

  const styles = statusStyles[todo.status];

  return (
    <div className="flex items-center gap-2 px-2.5 py-1 hover:bg-claude-bg-tertiary/50 transition-colors">
      {/* Checkbox */}
      <div
        className={`flex-shrink-0 w-3 h-3 rounded-sm border flex items-center justify-center ${styles.checkbox}`}
      >
        {styles.icon}
      </div>

      {/* Content */}
      <span className={`text-[11px] leading-tight truncate ${styles.text}`}>
        {todo.content}
      </span>

      {/* Active form indicator */}
      {todo.status === 'in_progress' && todo.activeForm && (
        <span className="text-[9px] text-claude-accent/80 truncate ml-auto">
          {todo.activeForm}
        </span>
      )}
    </div>
  );
}
