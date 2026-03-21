import { Check } from "lucide-react";
import type { Event } from "@trace/gql";
import { asJsonObject } from "@trace/shared";

export interface TodoItem {
  content: string;
  status: string;
  activeForm?: string;
}

/** Scan session events backwards to find the most recent TodoWrite tool_use block */
export function extractLatestTodos(
  eventIds: string[],
  events: Record<string, Event>,
): TodoItem[] | null {
  for (let i = eventIds.length - 1; i >= 0; i--) {
    const ev = events[eventIds[i]];
    if (!ev || ev.eventType !== "session_output") continue;
    const payload = asJsonObject(ev.payload);
    if (!payload || payload.type !== "assistant") continue;
    const message = asJsonObject(payload.message);
    const blocks = message?.content;
    if (!Array.isArray(blocks)) continue;
    for (const rawBlock of blocks) {
      const block = asJsonObject(rawBlock);
      if (!block || block.type !== "tool_use") continue;
      const name = String(block.name ?? "").toLowerCase();
      if (name === "todowrite" || name === "todo_write") {
        const input = asJsonObject(block.input);
        const todos = input?.todos;
        if (Array.isArray(todos)) {
          return todos.map((t: unknown) => {
            const item = asJsonObject(t);
            return {
              content: String(item?.content ?? ""),
              status: String(item?.status ?? "pending"),
              activeForm: typeof item?.activeForm === "string" ? item.activeForm : undefined,
            };
          });
        }
      }
    }
  }
  return null;
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
