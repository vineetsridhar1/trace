import { useCallback, useMemo, useState } from "react";
import { Circle, Plus } from "lucide-react";
import { client } from "../../lib/urql";
import { START_SESSION_MUTATION } from "../../lib/mutations";
import { useEntityStore, useEntityField, useSessionIdsByGroup } from "../../stores/entity";
import { navigateToSession, useUIStore } from "../../stores/ui";
import { cn } from "../../lib/utils";
import { getSessionChannelId, getSessionGroupChannelId } from "../../lib/session-group";
import { agentStatusColor, getDisplayAgentStatus } from "./sessionStatus";

interface SessionHistoryProps {
  sessionId: string;
}

export function SessionHistory({ sessionId }: SessionHistoryProps) {
  const openSessionTab = useUIStore((s) => s.openSessionTab);
  const [creatingFromId, setCreatingFromId] = useState<string | null>(null);

  const sessionGroupId = useEntityField("sessions", sessionId, "sessionGroupId") as string | undefined;
  const sessionGroups = useEntityStore((s) => s.sessionGroups);
  const sessions = useEntityStore((s) => s.sessions);
  const sessionGroup = sessionGroupId ? sessionGroups[sessionGroupId] : null;

  const groupSessionIds = useSessionIdsByGroup(sessionGroupId);

  const groupSessions = useMemo(() => {
    if (!sessionGroupId) return [];
    return groupSessionIds
      .map((id) => sessions[id])
      .filter(Boolean)
      .sort((a, b) => {
        const diff = new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        if (diff !== 0) return diff;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
  }, [sessionGroupId, groupSessionIds, sessions]);

  const channelId = getSessionGroupChannelId(sessionGroup ?? null, groupSessions);

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

        if (result.error) {
          console.error("[SessionHistory] mutation failed:", result.error);
          return;
        }

        const newSessionId = result.data?.startSession?.id;
        const newSessionGroupId = result.data?.startSession?.sessionGroupId ?? sessionGroupId;
        if (newSessionId) {
          openSessionTab(sessionGroupId, newSessionId);
          navigateToSession(
            (source.channel as { id: string } | null | undefined)?.id ?? null,
            newSessionGroupId,
            newSessionId,
          );
        }
      } finally {
        setCreatingFromId(null);
      }
    },
    [openSessionTab, sessionGroupId, sessions],
  );

  if (!sessionGroupId || groupSessions.length === 0) {
    return (
      <div className="px-3 py-4 text-center">
        <p className="text-xs text-muted-foreground">No group history</p>
      </div>
    );
  }

  return (
    <div className="max-h-96 overflow-y-auto py-1">
      <div className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        Sessions
      </div>
      {groupSessions.map((entry) => {
        const displayAgentStatus = getDisplayAgentStatus(entry.agentStatus, entry.sessionStatus);
        const color = agentStatusColor[displayAgentStatus] ?? "text-muted-foreground";

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
              onClick={() => {
                openSessionTab(sessionGroupId, entry.id);
                navigateToSession(channelId, sessionGroupId, entry.id);
              }}
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
