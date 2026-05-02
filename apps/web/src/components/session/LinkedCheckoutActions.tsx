import { useState } from "react";
import { Loader2, MoreHorizontal, RefreshCw } from "lucide-react";
import { Button } from "../ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { LinkedCheckoutSyncConflictDialog } from "./LinkedCheckoutSyncConflictDialog";
import type { LinkedCheckoutHeaderState } from "./useLinkedCheckoutHeaderState";
import { LinkedCheckoutControlSheet } from "./LinkedCheckoutControlSheet";

interface Props {
  state: LinkedCheckoutHeaderState;
}

type PendingAction = "link" | "sync" | "restore" | "toggle-auto-sync" | null;

export function LinkedCheckoutActions({ state }: Props) {
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  if (!state.canSelectTarget && !state.canShowControls) return null;

  const {
    isAttachedToThisGroup,
    pending,
    canLinkRepo,
    requiresRepoLink,
    onLinkRepo,
    onSync,
    onResolveSyncConflict,
    onCloseSyncConflict,
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
  const syncTooltip = `Sync this session's branch to the local checkout on ${state.targetDisplayLabel}.`;

  if (requiresRepoLink) {
    return (
      <>
        <LinkedCheckoutControlSheet
          state={state}
          open={sheetOpen}
          pendingAction={pendingAction}
          onOpenChange={setSheetOpen}
          onRunAction={(action, fn) => void runAction(action, fn)}
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            if (canLinkRepo) {
              void runAction("link", onLinkRepo);
            } else {
              setSheetOpen(true);
            }
          }}
          disabled={pending}
          title={`Link checkout on ${state.targetDisplayLabel}`}
        >
          {pendingAction === "link" ? "Linking..." : "Link"}
        </Button>
        <Button
          variant={iconButtonVariant}
          size="icon"
          className={iconButtonClassName}
          onClick={() => setSheetOpen(true)}
          aria-label="Local checkout settings"
          title="Local checkout settings"
        >
          <MoreHorizontal size={14} />
        </Button>
      </>
    );
  }

  if (!state.canShowControls) return null;

  return (
    <>
      <LinkedCheckoutControlSheet
        state={state}
        open={sheetOpen}
        pendingAction={pendingAction}
        onOpenChange={setSheetOpen}
        onRunAction={(action, fn) => void runAction(action, fn)}
      />
      <LinkedCheckoutSyncConflictDialog
        open={state.syncConflictOpen}
        error={state.syncConflictError}
        pending={pending}
        onClose={onCloseSyncConflict}
        onResolve={onResolveSyncConflict}
      />

      <Tooltip>
        <TooltipTrigger
          render={
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
            />
          }
        >
          {pendingAction === "sync" ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <RefreshCw size={14} />
          )}
        </TooltipTrigger>
        <TooltipContent className="max-w-72">{syncTooltip}</TooltipContent>
      </Tooltip>

      <Button
        variant={iconButtonVariant}
        size="icon"
        className={iconButtonClassName}
        onClick={() => setSheetOpen(true)}
        aria-label={
          isAttachedToThisGroup ? "Local checkout settings" : "Choose local checkout target"
        }
        title={isAttachedToThisGroup ? "Local checkout settings" : "Choose local checkout target"}
      >
        <MoreHorizontal size={14} />
      </Button>
    </>
  );
}
