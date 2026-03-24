import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GitCheckpoint } from "@trace/gql";
import { shortSha } from "@trace/shared";
import { GitCommitHorizontal, RotateCcw } from "lucide-react";
import { client } from "../../lib/urql";
import { START_SESSION_MUTATION } from "../../lib/mutations";
import { useEntityStore } from "../../stores/entity";
import { navigateToSession } from "../../stores/ui";
import { cn } from "../../lib/utils";
import { getSessionGroupChannelId } from "../../lib/session-group";

function formatCheckpointTime(committedAt: string): string {
  return new Date(committedAt).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

interface CheckpointPanelProps {
  sessionGroupId: string;
  highlightCheckpointId?: string | null;
}

export function CheckpointPanel({
  sessionGroupId,
  highlightCheckpointId,
}: CheckpointPanelProps) {
  const sessionGroup = useEntityStore(
    (s) => s.sessionGroups[sessionGroupId],
  );
  const sessions = useEntityStore((s) => s.sessions);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const highlightRef = useRef<HTMLDivElement>(null);

  const checkpoints = useMemo(() => {
    const raw = Array.isArray(sessionGroup?.gitCheckpoints)
      ? (sessionGroup.gitCheckpoints as GitCheckpoint[])
      : [];
    return [...raw].sort((a, b) => b.committedAt.localeCompare(a.committedAt));
  }, [sessionGroup?.gitCheckpoints]);

  const groupSessions = useMemo(
    () =>
      Object.values(sessions).filter(
        (s) => s.sessionGroupId === sessionGroupId,
      ),
    [sessionGroupId, sessions],
  );

  const channelId = getSessionGroupChannelId(sessionGroup ?? null, groupSessions);

  useEffect(() => {
    if (highlightCheckpointId && highlightRef.current) {
      highlightRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [highlightCheckpointId]);

  const handleRestore = useCallback(
    async (checkpoint: GitCheckpoint) => {
      const currentSession = groupSessions[0];
      if (!currentSession) return;

      setRestoringId(checkpoint.id);
      try {
        const result = await client
          .mutation(START_SESSION_MUTATION, {
            input: {
              tool: currentSession.tool,
              model: currentSession.model ?? undefined,
              hosting: currentSession.hosting,
              channelId: channelId ?? undefined,
              restoreCheckpointId: checkpoint.id,
            },
          })
          .toPromise();

        if (result.error) {
          console.error("[CheckpointPanel] restore failed:", result.error);
          return;
        }

        const newSessionId = result.data?.startSession?.id;
        const newGroupId = result.data?.startSession?.sessionGroupId;
        if (newSessionId && newGroupId) {
          navigateToSession(channelId, newGroupId, newSessionId);
        }
      } finally {
        setRestoringId(null);
      }
    },
    [channelId, groupSessions],
  );

  if (checkpoints.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-4">
        <p className="text-xs text-muted-foreground">No checkpoints yet</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      {checkpoints.map((checkpoint, index) => {
        const session = sessions[checkpoint.sessionId];
        const isHighlighted = checkpoint.id === highlightCheckpointId;
        const isCurrent = index === 0;

        return (
          <div
            key={checkpoint.id}
            ref={isHighlighted ? highlightRef : undefined}
            className={cn(
              "flex items-start gap-2 border-b border-border/40 px-3 py-2.5 transition-colors hover:bg-surface-elevated",
              isHighlighted && "bg-surface-elevated/60",
            )}
          >
            <GitCommitHorizontal
              size={12}
              className={cn(
                "mt-0.5 shrink-0",
                isCurrent ? "text-emerald-400" : "text-muted-foreground",
              )}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="shrink-0 font-mono text-[11px] text-foreground">
                  {shortSha(checkpoint.commitSha)}
                </span>
                {isCurrent && (
                  <span className="shrink-0 rounded-full bg-emerald-400/15 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wider text-emerald-400">
                    Current
                  </span>
                )}
              </div>
              <p className="mt-0.5 truncate text-xs text-foreground/80">
                {checkpoint.subject}
              </p>
              <div className="mt-1 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <span className="truncate">
                  {session?.name ?? "Session"}
                </span>
                <span>·</span>
                <span className="shrink-0">
                  {formatCheckpointTime(checkpoint.committedAt)}
                </span>
                {checkpoint.filesChanged > 0 && (
                  <>
                    <span>·</span>
                    <span className="shrink-0">
                      {checkpoint.filesChanged} file{checkpoint.filesChanged !== 1 ? "s" : ""}
                    </span>
                  </>
                )}
              </div>
            </div>

            {!isCurrent && (
              <button
                type="button"
                onClick={() => handleRestore(checkpoint)}
                disabled={restoringId !== null}
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-surface-deep hover:text-foreground disabled:opacity-50"
                title="Restore as new session"
              >
                <RotateCcw
                  size={11}
                  className={restoringId === checkpoint.id ? "animate-spin" : ""}
                />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
