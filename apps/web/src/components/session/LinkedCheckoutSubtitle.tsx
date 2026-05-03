import type { LinkedCheckoutHeaderState } from "./useLinkedCheckoutHeaderState";

interface Props {
  state: LinkedCheckoutHeaderState;
}

export function LinkedCheckoutSubtitle({ state }: Props) {
  if (!state.canShowControls && !state.needsTargetSelection) return null;

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
    targetDisplayLabel,
    sessionRuntimeLabel,
    targetIsSessionRuntime,
    needsTargetSelection,
  } = state;

  const hasStatusLine =
    needsTargetSelection ||
    requiresRepoLink ||
    (isAttachedToThisGroup && summaryBranch) ||
    isAttachedElsewhere;
  const hasErrorLine = isAttachedToThisGroup && !!lastSyncError;

  if (!hasStatusLine && !hasErrorLine) return null;

  return (
    <>
      {needsTargetSelection ? (
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          Choose one of your bridges to sync this session.
        </p>
      ) : requiresRepoLink ? (
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {canLinkRepo
            ? `Link a local checkout on ${targetDisplayLabel}.`
            : `Repo not linked on ${targetDisplayLabel}. Open Trace Desktop there to link a folder.`}
        </p>
      ) : isAttachedToThisGroup && summaryBranch ? (
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {targetDisplayLabel} following {summaryBranch}
          {syncedCommitSha ? ` at ${syncedCommitSha.slice(0, 7)}` : ""}
          {autoSyncEnabled ? "" : " (auto-sync paused)"}
          {hasUncommittedChanges ? " (has live changes)" : ""}
          {!targetIsSessionRuntime && sessionRuntimeLabel
            ? ` · Session runtime: ${sessionRuntimeLabel}`
            : ""}
        </p>
      ) : isAttachedElsewhere ? (
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {targetDisplayLabel} is attached to another Trace session.
        </p>
      ) : null}
      {hasErrorLine && <p className="mt-0.5 truncate text-xs text-destructive">{lastSyncError}</p>}
    </>
  );
}
