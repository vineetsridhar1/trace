import { useCallback, useMemo, useState } from "react";
import type { GitCheckpoint } from "@trace/gql";
import { Circle, GitCommitHorizontal, Plus, RotateCcw } from "lucide-react";
import { shortSha } from "@trace/shared";
import { client } from "../../lib/urql";
import { START_SESSION_MUTATION } from "../../lib/mutations";
import { useEntityStore } from "../../stores/entity";
import { navigateToSession } from "../../stores/ui";
import { cn } from "../../lib/utils";
import { getSessionChannelId, getSessionGroupChannelId } from "../../lib/session-group";
import { getDisplayStatus, statusColor } from "./sessionStatus";

interface SessionHistoryProps {
  sessionId: string;
}

function formatCheckpointTime(committedAt: string): string {
  return new Date(committedAt).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function SessionHistory({ sessionId }: SessionHistoryProps) {
  const sessions = useEntityStore((s) => s.sessions);
  const sessionGroups = useEntityStore((s) => s.sessionGroups);
  const [creatingFromId, setCreatingFromId] = useState<string | null>(null);
  const [restoringCheckpointId, setRestoringCheckpointId] = useState<string | null>(null);

  const currentSession = sessions[sessionId];
  const sessionGroupId = currentSession?.sessionGroupId as string | undefined;
  const sessionGroup = sessionGroupId ? sessionGroups[sessionGroupId] : null;

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

  const gitCheckpoints = useMemo(() => {
    const checkpoints = Array.isArray(sessionGroup?.gitCheckpoints)
      ? (sessionGroup.gitCheckpoints as GitCheckpoint[])
      : [];
    return [...checkpoints].sort((a, b) => b.committedAt.localeCompare(a.committedAt));
  }, [sessionGroup?.gitCheckpoints]);

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
    [sessionGroupId, sessions],
  );

  const handleRestoreCheckpoint = useCallback(
    async (checkpointId: string) => {
      if (!currentSession) return;

      setRestoringCheckpointId(checkpointId);
      try {
        const result = await client
          .mutation(START_SESSION_MUTATION, {
            input: {
              tool: currentSession.tool,
              model: currentSession.model ?? undefined,
              hosting: currentSession.hosting,
              channelId: channelId ?? undefined,
              restoreCheckpointId: checkpointId,
            },
          })
          .toPromise();

        if (result.error) {
          console.error("[SessionHistory] mutation failed:", result.error);
          return;
        }

        const newSessionId = result.data?.startSession?.id;
        const newSessionGroupId = result.data?.startSession?.sessionGroupId;
        if (newSessionId && newSessionGroupId) {
          navigateToSession(channelId, newSessionGroupId, newSessionId);
        }
      } finally {
        setRestoringCheckpointId(null);
      }
    },
    [channelId, currentSession],
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
        const displayStatus = getDisplayStatus(entry.status, null);
        const entryChannelId = getSessionChannelId(entry);

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
              onClick={() => navigateToSession(entryChannelId, sessionGroupId, entry.id)}
              className="flex min-w-0 flex-1 items-center gap-2 text-left"
            >
              <Circle
                size={6}
                className={cn("shrink-0 fill-current", statusColor[displayStatus])}
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
              disabled={creatingFromId !== null || restoringCheckpointId !== null}
              className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-surface-deep hover:text-foreground disabled:opacity-50"
              title="New chat from this session"
            >
              <Plus size={12} className={creatingFromId === entry.id ? "animate-pulse" : ""} />
            </button>
          </div>
        );
      })}

      <div className="mx-3 my-2 h-px bg-border" />
      <div className="px-3 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        Git
      </div>

      {gitCheckpoints.length === 0 ? (
        <div className="px-3 py-3 text-xs text-muted-foreground">No checkpoints yet</div>
      ) : (
        gitCheckpoints.map((checkpoint) => {
          const checkpointSession = sessions[checkpoint.sessionId];
          return (
            <div
              key={checkpoint.id}
              className="flex items-start gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-surface-elevated"
            >
              <div className="flex min-w-0 flex-1 gap-2">
                <GitCommitHorizontal size={12} className="mt-0.5 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] text-foreground">
                      {shortSha(checkpoint.commitSha)}
                    </span>
                    <span className="truncate text-foreground">{checkpoint.subject}</span>
                  </div>
                  <div className="mt-1 truncate text-[11px] text-muted-foreground">
                    {(checkpointSession?.name ?? "Session")} · {formatCheckpointTime(checkpoint.committedAt)}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleRestoreCheckpoint(checkpoint.id)}
                disabled={creatingFromId !== null || restoringCheckpointId !== null}
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-surface-deep hover:text-foreground disabled:opacity-50"
                title="Restore as new session"
              >
                <RotateCcw
                  size={12}
                  className={restoringCheckpointId === checkpoint.id ? "animate-spin" : ""}
                />
              </button>
            </div>
          );
        })
      )}
    </div>
  );
}
