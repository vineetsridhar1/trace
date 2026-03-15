import { useMemo } from "react";
import { Circle, ArrowDown } from "lucide-react";
import { useEntityStore } from "../../stores/entity";
import { useUIStore } from "../../stores/ui";
import { statusColor } from "./sessionStatus";
import { cn } from "../../lib/utils";

interface SessionHistoryProps {
  sessionId: string;
}

interface ChainEntry {
  id: string;
  name: string;
  status: string;
}

export function SessionHistory({ sessionId }: SessionHistoryProps) {
  const sessions = useEntityStore((s) => s.sessions);
  const setActiveSessionId = useUIStore((s) => s.setActiveSessionId);

  const chain = useMemo(() => {
    const entries: ChainEntry[] = [];
    const sessionsMap = sessions;

    // Walk up to find the root
    let current = sessionsMap[sessionId];
    const ancestors: ChainEntry[] = [];
    while (current) {
      const parent = current.parentSession as { id: string } | null | undefined;
      if (!parent?.id) break;
      const parentSession = sessionsMap[parent.id];
      if (!parentSession) break;
      ancestors.unshift({
        id: parentSession.id as string,
        name: (parentSession.name as string) ?? "Session",
        status: (parentSession.status as string) ?? "completed",
      });
      current = parentSession;
    }

    entries.push(...ancestors);

    // Add current session
    const self = sessionsMap[sessionId];
    if (self) {
      entries.push({
        id: sessionId,
        name: (self.name as string) ?? "Session",
        status: (self.status as string) ?? "active",
      });
    }

    // Walk down to find children (only direct chain — follow first child)
    current = sessionsMap[sessionId];
    while (current) {
      const children = current.childSessions as Array<{ id: string }> | undefined;
      if (!children?.length) break;
      const child = sessionsMap[children[0].id];
      if (!child) break;
      entries.push({
        id: child.id as string,
        name: (child.name as string) ?? "Session",
        status: (child.status as string) ?? "pending",
      });
      current = child;
    }

    return entries;
  }, [sessions, sessionId]);

  if (chain.length <= 1) {
    return (
      <div className="px-3 py-4 text-center">
        <p className="text-xs text-muted-foreground">No linked sessions</p>
      </div>
    );
  }

  return (
    <div className="max-h-64 overflow-y-auto py-1">
      {chain.map((entry, i) => (
        <div key={entry.id}>
          <button
            type="button"
            onClick={() => setActiveSessionId(entry.id)}
            className={cn(
              "flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-surface-elevated",
              entry.id === sessionId && "bg-surface-elevated/50",
            )}
          >
            <Circle
              size={6}
              className={cn("shrink-0 fill-current", statusColor[entry.status])}
            />
            <span
              className={cn(
                "min-w-0 flex-1 truncate",
                entry.id === sessionId ? "font-semibold text-foreground" : "text-muted-foreground",
              )}
            >
              {entry.name}
            </span>
          </button>
          {i < chain.length - 1 && (
            <div className="flex justify-center py-0.5">
              <ArrowDown size={10} className="text-muted-foreground/50" />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
