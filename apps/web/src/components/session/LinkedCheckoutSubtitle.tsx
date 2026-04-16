import type { LinkedCheckoutHeaderState } from "./useLinkedCheckoutHeaderState";

interface Props {
  state: LinkedCheckoutHeaderState;
}

export function LinkedCheckoutSubtitle({ state }: Props) {
  const {
    isAttachedToThisGroup,
    isAttachedElsewhere,
    summaryBranch,
    syncedCommitSha,
    autoSyncEnabled,
    lastSyncError,
  } = state;

  const hasStatusLine =
    (isAttachedToThisGroup && summaryBranch) || isAttachedElsewhere;
  const hasErrorLine = isAttachedToThisGroup && !!lastSyncError;

  if (!hasStatusLine && !hasErrorLine) return null;

  return (
    <>
      {isAttachedToThisGroup && summaryBranch ? (
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          Root checkout following {summaryBranch}
          {syncedCommitSha ? ` at ${syncedCommitSha.slice(0, 7)}` : ""}
          {autoSyncEnabled ? "" : " (auto-sync paused)"}
        </p>
      ) : isAttachedElsewhere ? (
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          Root checkout is attached to another Trace session.
        </p>
      ) : null}
      {hasErrorLine && (
        <p className="mt-0.5 truncate text-xs text-destructive">{lastSyncError}</p>
      )}
    </>
  );
}
