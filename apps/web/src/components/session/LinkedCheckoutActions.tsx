import { useState } from "react";
import { Loader2, Pause, Play, RefreshCw, RotateCcw } from "lucide-react";
import { Button } from "../ui/button";
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

  if (requiresRepoLink && canLinkRepo) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => void runAction("link", onLinkRepo)}
        disabled={pending}
      >
        {pendingAction === "link" ? "Linking..." : "Link Local Checkout"}
      </Button>
    );
  }

  if (requiresRepoLink) return null;

  return (
    <>
      <Button
        variant={isAttachedToThisGroup ? "secondary" : "outline"}
        size="icon"
        className="rounded-md"
        onClick={() => void runAction("sync", onSync)}
        disabled={pending}
        aria-label={isAttachedToThisGroup ? "Sync main worktree now" : "Sync to main worktree"}
        title={isAttachedToThisGroup ? "Sync main worktree now" : "Sync to main worktree"}
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
            variant="ghost"
            size="icon"
            className="rounded-md"
            onClick={() => void runAction("toggle-auto-sync", onToggleAutoSync)}
            disabled={pending}
            aria-label={autoSyncEnabled ? "Pause auto-sync" : "Resume auto-sync"}
            title={autoSyncEnabled ? "Pause auto-sync" : "Resume auto-sync"}
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
            variant="outline"
            size="icon"
            className="rounded-md"
            onClick={() => void runAction("restore", onRestore)}
            disabled={pending}
            aria-label="Restore main worktree"
            title="Restore main worktree"
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
