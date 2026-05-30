import { useState } from "react";
import { ChevronDown, RefreshCw } from "lucide-react";
import { Button } from "../ui/button";
import { TraceLoader } from "../ui/trace-loader";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { LinkedCheckoutSyncConflictDialog } from "./LinkedCheckoutSyncConflictDialog";
import type { LinkedCheckoutHeaderState } from "./useLinkedCheckoutHeaderState";
import { LinkedCheckoutControlSheet } from "./LinkedCheckoutControlSheet";

interface Props {
  state: LinkedCheckoutHeaderState;
}

type PendingAction = "link" | "sync" | "restore" | "toggle-auto-sync" | null;

const actionGroupClass =
  "flex h-9 shrink-0 items-center gap-1 rounded-md border border-border bg-surface-deep p-0.5";
const primaryActionClass =
  "h-8 cursor-pointer rounded-md bg-emerald-500 px-2.5 text-sm font-medium text-white hover:bg-emerald-400 disabled:pointer-events-none disabled:cursor-default disabled:opacity-50";
const secondaryActionClass =
  "h-8 cursor-pointer rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2.5 text-sm font-medium text-emerald-300 hover:border-emerald-400/70 hover:bg-emerald-500/15 hover:text-emerald-200 disabled:pointer-events-none disabled:cursor-default disabled:opacity-50";
const menuActionClass =
  "h-8 cursor-pointer rounded-md border border-emerald-500/40 bg-emerald-500/10 px-1.5 text-emerald-300 hover:border-emerald-400/70 hover:bg-emerald-500/15 hover:text-emerald-200 disabled:pointer-events-none disabled:cursor-default disabled:opacity-50";

export function LinkedCheckoutActions({ state }: Props) {
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  if (!state.canSelectTarget && !state.canShowControls) return null;

  const {
    isAttachedToThisGroup,
    pending,
    canLinkRepo,
    needsTargetSelection,
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

  const syncTooltip = `This syncs the session branch to your local checkout on ${state.targetDisplayLabel}.`;

  if (needsTargetSelection) {
    return (
      <>
        <LinkedCheckoutControlSheet
          state={state}
          open={sheetOpen}
          pendingAction={pendingAction}
          onOpenChange={setSheetOpen}
          onRunAction={(action, fn) => void runAction(action, fn)}
        />
        <div className={actionGroupClass}>
          <Button
            size="sm"
            className={primaryActionClass}
            onClick={() => setSheetOpen(true)}
          >
            Sync
          </Button>
          <Button
            size="sm"
            className={menuActionClass}
            onClick={() => setSheetOpen(true)}
            aria-label="Choose local checkout target"
            title="Choose local checkout target"
          >
            <ChevronDown size={13} />
          </Button>
        </div>
      </>
    );
  }

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
        <div className={actionGroupClass}>
          <Button
            size="sm"
            className={secondaryActionClass}
            onClick={() => void runAction("link", onLinkRepo)}
            disabled={pending || !canLinkRepo}
            title={`Link checkout on ${state.targetDisplayLabel}`}
          >
            {pendingAction === "link" ? "Linking..." : "Link"}
          </Button>
          <Button
            size="sm"
            className={menuActionClass}
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
        changedFiles={state.changedFiles}
        repoId={state.repoId}
        sessionGroupId={state.sessionGroupId}
        runtimeInstanceId={state.targetRuntimeInstanceId}
        pending={pending}
        onClose={onCloseSyncConflict}
        onResolve={onResolveSyncConflict}
      />

      <div className={actionGroupClass}>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                size="sm"
                className={primaryActionClass}
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
              <TraceLoader size={14} showLabel={false} />
            ) : (
              <RefreshCw size={14} />
            )}
            Sync
          </TooltipTrigger>
          <TooltipContent className="max-w-72">{syncTooltip}</TooltipContent>
        </Tooltip>
        <Button
          size="sm"
          className={menuActionClass}
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
