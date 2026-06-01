import { useCallback, useMemo, useState } from "react";
import { GitMerge, GitPullRequestArrow, Loader2, MoveUpRight } from "lucide-react";
import { toast } from "sonner";
import { QUEUE_SESSION_MESSAGE_MUTATION, SEND_SESSION_MESSAGE_MUTATION } from "@trace/client-core";
import { client } from "../../lib/urql";
import { cn } from "../../lib/utils";
import { ActionTooltip } from "../ui/ActionTooltip";
import { canQueueMessage, canSendMessage } from "./sessionStatus";

const CREATE_PR_PROMPT =
  "Create a pull request for this session branch. Push any required commits, open the PR against the repository's normal merge target, and report the PR link.";
const MERGE_PR_PROMPT =
  "Merge the pull request for this session branch. Verify it is ready to merge, merge it using the repository's normal strategy, and report the result.";
const neutralActionClass =
  "flex h-7 cursor-pointer items-center gap-1 rounded-md border border-border/70 bg-background/40 px-2 text-xs font-medium text-foreground transition-colors hover:bg-surface-hover disabled:pointer-events-none disabled:cursor-default disabled:opacity-50";

function getPullRequestLabel(prUrl: string): string {
  const match = prUrl.match(/\/pull\/(\d+)(?:[/?#]|$)/);
  return match ? `#${match[1]}` : "PR";
}

export function GitHubActions({
  sessionId,
  prUrl,
  agentStatus,
  connection,
  worktreeDeleted,
  canInteract,
  className,
}: {
  sessionId: string | null;
  prUrl: string | null | undefined;
  agentStatus: string | undefined;
  connection: Record<string, unknown> | null | undefined;
  worktreeDeleted?: boolean;
  canInteract: boolean;
  className?: string;
}) {
  const [pendingAction, setPendingAction] = useState<"create" | "merge" | null>(null);
  const canQueue = canQueueMessage(agentStatus, worktreeDeleted);
  const canSend =
    canInteract &&
    !!sessionId &&
    (canQueue || canSendMessage(agentStatus, connection, worktreeDeleted));
  const disabledReason = useMemo(() => {
    if (!sessionId) return "Select a session to run GitHub actions";
    if (!canInteract) return "You don't have access to this bridge";
    if (worktreeDeleted) return "Cannot run GitHub actions after the worktree is deleted";
    if (!agentStatus) return "Session is not ready";
    if (!canSend) return "Session cannot receive messages right now";
    return null;
  }, [agentStatus, canInteract, canSend, sessionId, worktreeDeleted]);
  const prLabel = prUrl ? getPullRequestLabel(prUrl) : null;

  const sendAction = useCallback(
    async (action: "create" | "merge") => {
      if (!sessionId || !canSend || pendingAction) return;

      setPendingAction(action);
      try {
        const mutation = canQueue ? QUEUE_SESSION_MESSAGE_MUTATION : SEND_SESSION_MESSAGE_MUTATION;
        const result = await client
          .mutation(mutation, {
            sessionId,
            text: action === "create" ? CREATE_PR_PROMPT : MERGE_PR_PROMPT,
          })
          .toPromise();

        if (result.error) throw result.error;
        toast.success(canQueue ? "GitHub action queued" : "GitHub action sent");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to run GitHub action");
      } finally {
        setPendingAction(null);
      }
    },
    [canQueue, canSend, pendingAction, sessionId],
  );

  return (
    <div
      className={cn(
        "app-region-no-drag flex h-8 shrink-0 items-center gap-1",
        className,
      )}
    >
      {prUrl && prLabel ? (
        <>
          <ActionTooltip label="View pull request">
            <a
              href={prUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={neutralActionClass}
              aria-label="View pull request"
            >
              <span className="font-semibold text-emerald-400">{prLabel}</span>
              <MoveUpRight size={13} className="text-muted-foreground" />
            </a>
          </ActionTooltip>
          <ActionTooltip label={disabledReason ?? "Merge pull request"}>
            <button
              type="button"
              onClick={() => void sendAction("merge")}
              disabled={!!disabledReason || pendingAction !== null}
              className={neutralActionClass}
            >
              {pendingAction === "merge" ? (
                <Loader2 size={13} className="animate-spin text-emerald-400" />
              ) : (
                <GitMerge size={13} className="text-emerald-400" />
              )}
              Merge
            </button>
          </ActionTooltip>
        </>
      ) : (
        <ActionTooltip label={disabledReason ?? "Create pull request"}>
          <button
            type="button"
            onClick={() => void sendAction("create")}
            disabled={!!disabledReason || pendingAction !== null}
            className={neutralActionClass}
          >
            {pendingAction === "create" ? (
              <Loader2 size={13} className="animate-spin text-emerald-400" />
            ) : (
              <GitPullRequestArrow size={13} className="text-emerald-400" />
            )}
            Create PR
          </button>
        </ActionTooltip>
      )}
    </div>
  );
}
