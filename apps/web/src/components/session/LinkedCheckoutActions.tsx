import { useState } from "react";
import { ChevronDown, Spotlight } from "lucide-react";
import { Button } from "../ui/button";
import { TraceLoader } from "../ui/trace-loader";
import { LinkedCheckoutSyncConflictDialog } from "./LinkedCheckoutSyncConflictDialog";
import type { LinkedCheckoutHeaderState } from "./useLinkedCheckoutHeaderState";
import { LinkedCheckoutControlSheet } from "./LinkedCheckoutControlSheet";
import { ActionTooltip } from "../ui/ActionTooltip";

interface Props {
  state: LinkedCheckoutHeaderState;
}

type PendingAction = "link" | "sync" | "restore" | "toggle-auto-sync" | null;

const actionGroupClass =
  "flex h-8 shrink-0 items-center gap-1";
const primaryActionClass =
  "app-region-no-drag h-7 cursor-pointer rounded-md border border-border/70 bg-background/40 px-2 text-xs font-medium text-foreground hover:bg-surface-hover disabled:pointer-events-none disabled:cursor-default disabled:opacity-50";
const secondaryActionClass =
  "app-region-no-drag h-7 cursor-pointer rounded-md border border-border/70 bg-background/40 px-2 text-xs font-medium text-foreground hover:bg-surface-hover disabled:pointer-events-none disabled:cursor-default disabled:opacity-50";
const menuActionClass =
  "app-region-no-drag h-7 cursor-pointer rounded-md border border-border/70 bg-background/40 px-1.5 text-muted-foreground hover:bg-surface-hover hover:text-foreground disabled:pointer-events-none disabled:cursor-default disabled:opacity-50";

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

  const syncTooltip = `This spotlights the session branch in your local checkout on ${state.targetDisplayLabel}.`;

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
          <ActionTooltip label="Choose local checkout target">
            <Button
              size="sm"
              className={primaryActionClass}
              onClick={() => setSheetOpen(true)}
            >
              Spotlight
            </Button>
          </ActionTooltip>
          <ActionTooltip label="Choose local checkout target">
            <Button
              size="sm"
              className={menuActionClass}
              onClick={() => setSheetOpen(true)}
              aria-label="Choose local checkout target"
            >
              <ChevronDown size={12} />
            </Button>
          </ActionTooltip>
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
          <ActionTooltip label={`Link checkout on ${state.targetDisplayLabel}`}>
            <Button
              size="sm"
              className={secondaryActionClass}
              onClick={() => void runAction("link", onLinkRepo)}
              disabled={pending || !canLinkRepo}
            >
              {pendingAction === "link" ? "Linking..." : "Link"}
            </Button>
          </ActionTooltip>
          <ActionTooltip label="Local checkout settings">
            <Button
              size="sm"
              className={menuActionClass}
              onClick={() => setSheetOpen(true)}
              aria-label="Local checkout settings"
            >
              <ChevronDown size={12} />
            </Button>
          </ActionTooltip>
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
        <ActionTooltip label={syncTooltip} contentClassName="max-w-72">
          <Button
            size="sm"
            className={primaryActionClass}
            onClick={() => void runAction("sync", onSync)}
            disabled={pending}
            aria-label={`Spotlight checkout on ${state.targetDisplayLabel}`}
          >
            {pendingAction === "sync" ? (
              <TraceLoader size={13} showLabel={false} />
            ) : (
              <Spotlight size={13} className="text-amber-300" />
            )}
            Spotlight
          </Button>
        </ActionTooltip>
        <ActionTooltip
          label={isAttachedToThisGroup ? "Local checkout settings" : "Choose local checkout target"}
        >
          <Button
            size="sm"
            className={menuActionClass}
            onClick={() => setSheetOpen(true)}
            aria-label={
              isAttachedToThisGroup ? "Local checkout settings" : "Choose local checkout target"
            }
          >
            <ChevronDown size={12} />
          </Button>
        </ActionTooltip>
      </div>
    </>
  );
}
