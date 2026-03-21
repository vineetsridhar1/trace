import { Check } from "lucide-react";

export interface TodoItem {
  content: string;
  status: string;
  activeForm?: string;
}

export function StickyTodoList({ todos }: { todos: TodoItem[] }) {
  const hasActive = todos.some((t) => t.status !== "completed");
  if (!hasActive) return null;

  return (
    <div className="sticky-todo-list border-t border-border bg-background px-4 py-2.5">
      <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Tasks
      </div>
      <ul className="space-y-1">
        {todos.map((t, i) => (
          <li key={i} className="flex items-center gap-2 text-xs">
            {t.status === "in_progress" ? (
              <svg
                className="h-3 w-3 flex-shrink-0 animate-spin text-[var(--th-accent-light)]"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="3"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z"
                />
              </svg>
            ) : t.status === "completed" ? (
              <Check className="h-3 w-3 flex-shrink-0 text-green-400" aria-hidden="true" />
            ) : (
              <span className="flex h-3 w-3 flex-shrink-0 items-center justify-center rounded-full border border-muted-foreground" />
            )}
            <span
              className={
                t.status === "completed"
                  ? "text-muted-foreground line-through"
                  : t.status === "in_progress"
                    ? "text-[var(--th-accent-light)]"
                    : "text-foreground"
              }
            >
              {t.status === "in_progress" && t.activeForm
                ? t.activeForm
                : t.content}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
