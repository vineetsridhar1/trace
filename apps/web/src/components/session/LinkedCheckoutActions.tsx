import { useState } from "react";
import { ChevronDown, Loader2, RefreshCw } from "lucide-react";
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
        <div className="flex shrink-0 items-center">
          <Button
            variant="outline"
            size="sm"
            className="rounded-r-none border-r-0"
            onClick={() => void runAction("link", onLinkRepo)}
            disabled={pending || !canLinkRepo}
            title={`Link checkout on ${state.targetDisplayLabel}`}
          >
            {pendingAction === "link" ? "Linking..." : "Link"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="rounded-l-none px-1.5"
            onClick={() => setSheetOpen(true)}
            aria-label="Local checkout settings"
            title="Local checkout settings"
          >
            <ChevronDown size={13} />
          </Button>
        </div>
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

      <div className="flex shrink-0 items-center">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="secondary"
                size="sm"
                className="rounded-r-none border-r border-border/70"
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
            Sync
          </TooltipTrigger>
          <TooltipContent className="max-w-72">{syncTooltip}</TooltipContent>
        </Tooltip>
        <Button
          variant="secondary"
          size="sm"
          className="rounded-l-none px-1.5"
          onClick={() => setSheetOpen(true)}
          aria-label={
            isAttachedToThisGroup ? "Local checkout settings" : "Choose local checkout target"
          }
          title={isAttachedToThisGroup ? "Local checkout settings" : "Choose local checkout target"}
        >
          <ChevronDown size={13} />
        </Button>
      </div>
    </>
  );
}
