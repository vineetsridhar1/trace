import type { LinkedCheckoutHeaderState } from "./useLinkedCheckoutHeaderState";

interface Props {
  state: LinkedCheckoutHeaderState;
}

export function LinkedCheckoutSubtitle({ state }: Props) {
  if (!state.canShowControls) return null;

  const {
    canLinkRepo,
    requiresRepoLink,
    isAttachedToThisGroup,
    isAttachedElsewhere,
    summaryBranch,
    syncedCommitSha,
    autoSyncEnabled,
    hasUncommittedChanges,
    lastSyncError,
  } = state;

  const hasStatusLine =
    requiresRepoLink || (isAttachedToThisGroup && summaryBranch) || isAttachedElsewhere;
  const hasErrorLine = isAttachedToThisGroup && !!lastSyncError;

  if (!hasStatusLine && !hasErrorLine) return null;

  return (
    <>
      {requiresRepoLink ? (
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {canLinkRepo
            ? "Link a local checkout to sync this session group into your main worktree."
            : "Link a local checkout in Trace Desktop to sync this session group into your main worktree."}
        </p>
      ) : isAttachedToThisGroup && summaryBranch ? (
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          Main worktree following {summaryBranch}
          {syncedCommitSha ? ` at ${syncedCommitSha.slice(0, 7)}` : ""}
          {autoSyncEnabled ? "" : " (auto-sync paused)"}
          {hasUncommittedChanges ? " (has live changes)" : ""}
        </p>
      ) : isAttachedElsewhere ? (
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          Main worktree is attached to another Trace session.
        </p>
      ) : null}
      {hasErrorLine && <p className="mt-0.5 truncate text-xs text-destructive">{lastSyncError}</p>}
    </>
  );
}
