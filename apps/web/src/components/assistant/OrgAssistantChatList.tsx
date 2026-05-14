import type { Session } from "@trace/gql";
import { cn } from "../../lib/utils";

function formatAssistantChatDate(value: string | null | undefined): string {
  if (!value) return "No messages yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No messages yet";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function OrgAssistantChatList({
  sessions,
  selectedSessionId,
  onSelectSession,
}: {
  sessions: Session[];
  selectedSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
}) {
  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-border bg-surface-subtle/40 md:w-64">
      <div className="shrink-0 px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Previous chats
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {sessions.map((session) => (
          <button
            key={session.id}
            type="button"
            onClick={() => onSelectSession(session.id)}
            className={cn(
              "flex w-full flex-col gap-1 rounded-md px-2 py-2 text-left text-sm transition-colors",
              session.id === selectedSessionId
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
            )}
          >
            <span className="truncate font-medium">{session.name || "Org Assistant"}</span>
            <span className="truncate text-xs opacity-80">
              {formatAssistantChatDate(session.lastMessageAt ?? session.updatedAt ?? session.createdAt)}
            </span>
          </button>
        ))}
      </div>
    </aside>
  );
}
