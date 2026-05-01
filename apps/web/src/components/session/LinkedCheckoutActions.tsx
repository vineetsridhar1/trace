import { useState } from "react";
import { Loader2, Pause, Play, RefreshCw, RotateCcw } from "lucide-react";
import { Button } from "../ui/button";
import { LinkedCheckoutSyncConflictDialog } from "./LinkedCheckoutSyncConflictDialog";
import type { LinkedCheckoutHeaderState } from "./useLinkedCheckoutHeaderState";

interface Props {
  state: LinkedCheckoutHeaderState;
}

type PendingAction = "link" | "sync" | "restore" | "toggle-auto-sync" | null;

export function LinkedCheckoutActions({ state }: Props) {
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);

  if (!state.canShowControls) return null;

  const {
    isAttachedToThisGroup,
    pending,
    autoSyncEnabled,
    canLinkRepo,
    requiresRepoLink,
    onLinkRepo,
    onSync,
    onResolveSyncConflict,
    onCloseSyncConflict,
    onRestore,
    onToggleAutoSync,
  } = state;

  const runAction = async (action: Exclude<PendingAction, null>, fn: () => Promise<void>) => {
    if (pending) return;

    setPendingAction(action);
    try {
      await fn();
    } finally {
      setPendingAction((current) => (current === action ? null : current));
    }
  };

  const iconButtonVariant = "secondary" as const;
  const iconButtonClassName = "rounded-md";

  if (requiresRepoLink && canLinkRepo) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => void runAction("link", onLinkRepo)}
        disabled={pending}
        title={`Link checkout on ${state.targetDisplayLabel}`}
      >
        {pendingAction === "link" ? "Linking..." : "Link Checkout"}
      </Button>
    );
  }

  if (requiresRepoLink) return null;

  return (
    <>
      <LinkedCheckoutSyncConflictDialog
        open={state.syncConflictOpen}
        error={state.syncConflictError}
        pending={pending}
        onClose={onCloseSyncConflict}
        onResolve={onResolveSyncConflict}
      />

      <Button
        variant={iconButtonVariant}
        size="icon"
        className={iconButtonClassName}
        onClick={() => void runAction("sync", onSync)}
        disabled={pending}
        aria-label={
          isAttachedToThisGroup
            ? `Sync checkout on ${state.targetDisplayLabel}`
            : `Sync to checkout on ${state.targetDisplayLabel}`
        }
        title={
          isAttachedToThisGroup
            ? `Sync checkout on ${state.targetDisplayLabel}`
            : `Sync to checkout on ${state.targetDisplayLabel}`
        }
      >
        {pendingAction === "sync" ? (
          <Loader2 size={14} className="animate-spin" />
        ) : (
          <RefreshCw size={14} />
        )}
      </Button>

      {isAttachedToThisGroup && (
        <>
          <Button
            variant={iconButtonVariant}
            size="icon"
            className={iconButtonClassName}
            onClick={() => void runAction("toggle-auto-sync", onToggleAutoSync)}
            disabled={pending}
            aria-label={
              autoSyncEnabled
                ? `Pause auto-sync on ${state.targetDisplayLabel}`
                : `Resume auto-sync on ${state.targetDisplayLabel}`
            }
            title={
              autoSyncEnabled
                ? `Pause auto-sync on ${state.targetDisplayLabel}`
                : `Resume auto-sync on ${state.targetDisplayLabel}`
            }
          >
            {pendingAction === "toggle-auto-sync" ? (
              <Loader2 size={14} className="animate-spin" />
            ) : autoSyncEnabled ? (
              <Pause size={14} />
            ) : (
              <Play size={14} />
            )}
          </Button>
          <Button
            variant={iconButtonVariant}
            size="icon"
            className={iconButtonClassName}
            onClick={() => void runAction("restore", onRestore)}
            disabled={pending}
            aria-label={`Restore checkout on ${state.targetDisplayLabel}`}
            title={`Restore checkout on ${state.targetDisplayLabel}`}
          >
            {pendingAction === "restore" ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <RotateCcw size={14} />
            )}
          </Button>
        </>
      )}
    </>
  );
}
