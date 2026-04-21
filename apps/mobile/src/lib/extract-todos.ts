import type { Event } from "@trace/gql";
import { asJsonObject } from "@trace/shared";

export interface TodoItem {
  content: string;
  status: string;
  activeForm?: string;
}

/**
 * Walk events backwards to find the most recent TodoWrite tool_use block in
 * an assistant payload and return its `todos` list. Mirrors web's
 * `extractLatestTodos` in `apps/web/src/components/session/StickyTodoList.tsx`.
 */
export function extractLatestTodos(
  eventIds: string[],
  events: Record<string, Event>,
): TodoItem[] | null {
  for (let i = eventIds.length - 1; i >= 0; i--) {
    const id = eventIds[i];
    if (!id) continue;
    const ev = events[id];
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
      if (name !== "todowrite" && name !== "todo_write") continue;
      const input = asJsonObject(block.input);
      const todos = input?.todos;
      if (!Array.isArray(todos)) continue;
      return todos.map((t: unknown) => {
        const item = asJsonObject(t);
        return {
          content: String(item?.content ?? ""),
          status: String(item?.status ?? "pending"),
          activeForm:
            typeof item?.activeForm === "string" ? item.activeForm : undefined,
        };
      });
    }
  }
  return null;
}
