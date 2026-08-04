import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import type { GitCheckpoint } from "@trace/gql";
import { shortSha } from "@trace/shared";
import { GitCommitHorizontal, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { client } from "../../lib/urql";
import { START_SESSION_MUTATION } from "@trace/client-core";
import {
  useEntityField,
  useEntityStore,
  type SessionGroupEntity,
  type SessionEntity,
} from "@trace/client-core";
import { navigateToSession } from "../../stores/ui";
import { cn } from "../../lib/utils";
import { getSessionGroupChannelId } from "@trace/client-core";
import { RestoreCheckpointDialog, shouldShowRestoreDialog } from "./RestoreCheckpointDialog";
import {
  CLOUD_REPO_REMOTE_REQUIRED,
  repoRemoteKnownMissing,
  resolveSupportedHostingForRepo,
} from "../../lib/repo-capabilities";
import { TraceLoader } from "../ui/trace-loader";

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
  const [failedCaptureIds, setFailedCaptureIds] = useState<Set<string>>(() => new Set());
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
    [sessionGroupId, sessionNameById],
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
        const restoreRepo = restoreSession.repo as { remoteUrl?: string | null } | null | undefined;
        if (restoreSession.hosting === "cloud" && repoRemoteKnownMissing(restoreRepo)) {
          toast.error("Cloud is unavailable for this repo", { description: CLOUD_REPO_REMOTE_REQUIRED });
          return;
        }
        const result = await client
          .mutation(START_SESSION_MUTATION, {
            input: {
              tool: restoreSession.tool,
              model: restoreSession.model ?? undefined,
              reasoningEffort: restoreSession.reasoningEffort ?? undefined,
              hosting: resolveSupportedHostingForRepo(restoreSession.hosting, restoreRepo),
              channelId: channelId ?? undefined,
              restoreCheckpointId: checkpoint.id,
            },
          })
          .toPromise();

        if (result.error) {
          toast.error("Failed to restore checkpoint", { description: result.error.message });
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
              <p className="mt-0.5 truncate text-xs text-foreground/80">{checkpoint.subject}</p>
              {checkpoint.captureStatus === "captured" &&
              checkpoint.captureUrl &&
              !failedCaptureIds.has(checkpoint.id) ? (
                <img
                  src={checkpoint.captureUrl}
                  alt={`Preview at ${shortSha(checkpoint.commitSha)}`}
                  loading="lazy"
                  className="mt-2 aspect-video w-full rounded border border-border/60 object-cover"
                  onError={() =>
                    setFailedCaptureIds((current) => {
                      if (current.has(checkpoint.id)) return current;
                      const next = new Set(current);
                      next.add(checkpoint.id);
                      return next;
                    })
                  }
                />
              ) : null}
              {checkpoint.previewStatus === "captured" && checkpoint.previewUrl ? (
                <a
                  href={checkpoint.previewUrl}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(event) => event.stopPropagation()}
                  className="mt-2 inline-flex rounded border border-border/60 px-2 py-1 text-[11px] font-medium text-foreground hover:bg-surface-deep"
                >
                  Open saved design
                </a>
              ) : null}
              <div className="mt-1 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <span className="truncate">{sessionName}</span>
                <span>·</span>
                <span className="shrink-0">{formatCheckpointTime(checkpoint.committedAt)}</span>
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
                onClick={(e: React.MouseEvent) => {
                  e.stopPropagation();
                  requestRestore(checkpoint);
                }}
                disabled={restoringId !== null}
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-surface-deep hover:text-foreground disabled:opacity-50"
                title="Restore as new session"
              >
                {restoringId === checkpoint.id ? (
                  <TraceLoader size={11} showLabel={false} />
                ) : (
                  <RotateCcw size={11} />
                )}
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
