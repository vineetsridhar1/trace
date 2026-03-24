import { useCallback, useMemo, useState } from "react";
import { Circle, Plus } from "lucide-react";
import { client } from "../../lib/urql";
import { START_SESSION_MUTATION } from "../../lib/mutations";
import { useEntityStore } from "../../stores/entity";
import { navigateToSession } from "../../stores/ui";
import { cn } from "../../lib/utils";
import { getSessionChannelId } from "../../lib/session-group";
import { agentStatusColor } from "./sessionStatus";

interface SessionHistoryProps {
  sessionId: string;
}

export function SessionHistory({ sessionId }: SessionHistoryProps) {
  const sessions = useEntityStore((s) => s.sessions);
  const [creatingFromId, setCreatingFromId] = useState<string | null>(null);

  const currentSession = sessions[sessionId];
  const sessionGroupId = currentSession?.sessionGroupId as string | undefined;

  const groupSessions = useMemo(() => {
    if (!sessionGroupId) return [];
    return Object.values(sessions)
      .filter((session) => session.sessionGroupId === sessionGroupId)
      .sort((a, b) => {
        const diff = new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        if (diff !== 0) return diff;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
  }, [sessionGroupId, sessions]);

  const handleSeedNewChat = useCallback(
    async (sourceId: string) => {
      if (!sessionGroupId) return;
      const source = sessions[sourceId];
      if (!source) return;

      setCreatingFromId(sourceId);
      try {
        const result = await client
          .mutation(START_SESSION_MUTATION, {
            input: {
              tool: source.tool,
              model: source.model ?? undefined,
              hosting: source.hosting,
              channelId: getSessionChannelId(source) ?? undefined,
              repoId: (source.repo as { id: string } | null | undefined)?.id,
              branch: source.branch ?? undefined,
              sessionGroupId,
              sourceSessionId: sourceId,
            },
          })
          .toPromise();

        const newSessionId = result.data?.startSession?.id;
        if (newSessionId) {
          navigateToSession(
            (source.channel as { id: string } | null | undefined)?.id ?? null,
            sessionGroupId,
            newSessionId,
          );
        }
      } finally {
        setCreatingFromId(null);
      }
    },
    [sessionGroupId, sessions],
  );

  if (!sessionGroupId || groupSessions.length === 0) {
    return (
      <div className="px-3 py-4 text-center">
        <p className="text-xs text-muted-foreground">No group history</p>
      </div>
    );
  }

  return (
    <div className="max-h-72 overflow-y-auto py-1">
      {groupSessions.map((entry) => {
        const color = agentStatusColor[entry.agentStatus ?? "active"] ?? "text-muted-foreground";
        const channelId = getSessionChannelId(entry);

        return (
          <div
            key={entry.id}
            className={cn(
              "flex items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-surface-elevated",
              entry.id === sessionId && "bg-surface-elevated/50",
            )}
          >
            <button
              type="button"
              onClick={() => navigateToSession(channelId, sessionGroupId, entry.id)}
              className="flex min-w-0 flex-1 items-center gap-2 text-left"
            >
              <Circle
                size={6}
                className={cn("shrink-0 fill-current", color)}
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

            <button
              type="button"
              onClick={() => handleSeedNewChat(entry.id)}
              disabled={creatingFromId !== null}
              className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-surface-deep hover:text-foreground disabled:opacity-50"
              title="New chat from this session"
            >
              <Plus size={12} className={creatingFromId === entry.id ? "animate-pulse" : ""} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
