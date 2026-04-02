import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import type { GitCheckpoint } from "@trace/gql";
import { shortSha } from "@trace/shared";
import { GitCommitHorizontal, RotateCcw } from "lucide-react";
import { client } from "../../lib/urql";
import { START_SESSION_MUTATION } from "../../lib/mutations";
import { useEntityField, useEntityStore, type SessionGroupEntity, type SessionEntity } from "../../stores/entity";
import { navigateToSession } from "../../stores/ui";
import { cn } from "../../lib/utils";
import { getSessionGroupChannelId } from "../../lib/session-group";
import {
  RestoreCheckpointDialog,
  shouldShowRestoreDialog,
} from "./RestoreCheckpointDialog";

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
  activeSessionId: string | null;
  highlightCheckpointId?: string | null;
  onCheckpointClick?: (sessionId: string, promptEventId: string) => void;
}

export function CheckpointPanel({
  sessionGroupId,
  activeSessionId,
  highlightCheckpointId,
  onCheckpointClick,
}: CheckpointPanelProps) {
  const gitCheckpoints = useEntityField("sessionGroups", sessionGroupId, "gitCheckpoints") as
    | GitCheckpoint[]
    | undefined;
  const sessionGroup = useEntityStore(
    (s: { sessionGroups: Record<string, SessionGroupEntity> }) => s.sessionGroups[sessionGroupId],
  );
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [pendingCheckpoint, setPendingCheckpoint] = useState<GitCheckpoint | null>(null);
  const highlightRef = useRef<HTMLDivElement>(null);

  const checkpoints = useMemo(() => {
    const raw = Array.isArray(gitCheckpoints) ? gitCheckpoints : [];
    return [...raw].sort((a, b) => b.committedAt.localeCompare(a.committedAt));
  }, [gitCheckpoints]);

  // Build a minimal map of session id → name for display only
  const sessionNameById = useEntityStore(
    useShallow((s: { sessions: Record<string, SessionEntity> }) => {
      const names: Record<string, string> = {};
      for (const cp of checkpoints) {
        const session = s.sessions[cp.sessionId];
        if (session) names[cp.sessionId] = session.name;
      }
      return names;
    }),
  );

  const groupSessions = useMemo(
    () =>
      Object.values(useEntityStore.getState().sessions).filter(
        (s: SessionEntity) => s.sessionGroupId === sessionGroupId,
      ),
    [sessionGroupId, sessionNameById], // eslint-disable-line react-hooks/exhaustive-deps -- sessionNameById changes when sessions change
  );

  const channelId = getSessionGroupChannelId(sessionGroup ?? null, groupSessions);

  // Use the active session (or fall back to most recently updated) for restore config
  const restoreSession = useMemo(() => {
    if (!groupSessions.length) return null;
    if (activeSessionId) {
      const active = groupSessions.find((s: SessionEntity) => s.id === activeSessionId);
      if (active) return active;
    }
    return [...groupSessions].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    )[0];
  }, [activeSessionId, groupSessions]);

  useEffect(() => {
    if (highlightCheckpointId && highlightRef.current) {
      highlightRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [highlightCheckpointId]);

  const handleRestore = useCallback(
    async (checkpoint: GitCheckpoint) => {
      if (!restoreSession) return;

      setRestoringId(checkpoint.id);
      try {
        const result = await client
          .mutation(START_SESSION_MUTATION, {
            input: {
              tool: restoreSession.tool,
              model: restoreSession.model ?? undefined,
              hosting: restoreSession.hosting,
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
    [channelId, restoreSession],
  );

  const requestRestore = useCallback(
    (checkpoint: GitCheckpoint) => {
      if (shouldShowRestoreDialog()) {
        setPendingCheckpoint(checkpoint);
      } else {
        handleRestore(checkpoint);
      }
    },
    [handleRestore],
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
      {checkpoints.map((checkpoint: GitCheckpoint, index: number) => {
        const sessionName = sessionNameById[checkpoint.sessionId] ?? "Session";
        const isHighlighted = checkpoint.id === highlightCheckpointId;
        const isCurrent = index === 0;

        return (
          <div
            key={checkpoint.id}
            ref={isHighlighted ? highlightRef : undefined}
            className={cn(
              "flex items-start gap-2 border-b border-border/40 px-3 py-2.5 transition-colors hover:bg-surface-elevated cursor-pointer",
              isHighlighted && "bg-surface-elevated/60",
            )}
            onClick={() => onCheckpointClick?.(checkpoint.sessionId, checkpoint.promptEventId)}
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
                  {sessionName}
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
                onClick={(e: React.MouseEvent) => { e.stopPropagation(); requestRestore(checkpoint); }}
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

      {pendingCheckpoint && (
        <RestoreCheckpointDialog
          open
          commitSha={shortSha(pendingCheckpoint.commitSha)}
          subject={pendingCheckpoint.subject}
          onConfirm={() => {
            handleRestore(pendingCheckpoint);
            setPendingCheckpoint(null);
          }}
          onCancel={() => setPendingCheckpoint(null)}
        />
      )}
    </div>
  );
}
