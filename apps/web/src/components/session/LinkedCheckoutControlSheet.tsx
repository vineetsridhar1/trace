import { Check, GitBranch, Monitor, RotateCcw, SlidersHorizontal } from "lucide-react";
import { Button } from "../ui/button";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "../ui/responsive-dialog";
import { cn } from "../../lib/utils";
import type {
  LinkedCheckoutHeaderState,
  LinkedCheckoutTargetOption,
} from "./useLinkedCheckoutHeaderState";

type PendingAction = "link" | "sync" | "restore" | "toggle-auto-sync" | null;

interface Props {
  state: LinkedCheckoutHeaderState;
  open: boolean;
  pendingAction: PendingAction;
  onOpenChange: (open: boolean) => void;
  onRunAction: (action: Exclude<PendingAction, null>, fn: () => Promise<void>) => void;
}

export function LinkedCheckoutControlSheet({
  state,
  open,
  pendingAction,
  onOpenChange,
  onRunAction,
}: Props) {
  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className="sm:max-w-md">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>Local checkout</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            Choose which of your connected bridges receives sync actions for this session.
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>

        <div className="space-y-4">
          <section className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground">Checkout target</div>
            <div className="space-y-1">
              {state.targetOptions.map((option: LinkedCheckoutTargetOption) => (
                <button
                  key={option.instanceId}
                  type="button"
                  onClick={() => state.onSelectTarget(option.instanceId)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-md border border-border px-3 py-2 text-left transition-colors hover:bg-surface-elevated",
                    option.instanceId === state.targetRuntimeInstanceId &&
                      "border-primary/60 bg-surface-elevated",
                  )}
                >
                  <Monitor size={15} className="shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">
                      {option.label}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {targetOptionDetail(option)}
                    </span>
                  </span>
                  {option.instanceId === state.targetRuntimeInstanceId && (
                    <Check size={15} className="shrink-0 text-primary" />
                  )}
                </button>
              ))}
            </div>
          </section>

          {state.sessionRuntimeLabel && (
            <section className="rounded-md border border-border px-3 py-2">
              <div className="text-xs font-medium text-muted-foreground">Session runtime</div>
              <div className="mt-1 flex items-center gap-2 text-sm text-foreground">
                <Monitor size={14} className="text-muted-foreground" />
                <span className="truncate">{state.sessionRuntimeLabel}</span>
              </div>
            </section>
          )}

          <section className="grid gap-2 sm:grid-cols-2">
            {state.requiresRepoLink ? (
              <Button
                variant="default"
                onClick={() => onRunAction("link", state.onLinkRepo)}
                disabled={state.pending || !state.canLinkRepo}
                className="justify-start"
              >
                <GitBranch size={14} />
                {pendingAction === "link" ? "Linking..." : "Link folder"}
              </Button>
            ) : (
              <Button
                variant="default"
                onClick={() => onRunAction("sync", state.onSync)}
                disabled={state.pending}
                className="justify-start"
              >
                <GitBranch size={14} />
                {pendingAction === "sync" ? "Syncing..." : "Sync now"}
              </Button>
            )}

            {!state.requiresRepoLink && state.isAttachedToThisGroup && (
              <>
                <Button
                  variant="secondary"
                  onClick={() => onRunAction("toggle-auto-sync", state.onToggleAutoSync)}
                  disabled={state.pending}
                  className="justify-start"
                >
                  <SlidersHorizontal size={14} />
                  {state.autoSyncEnabled ? "Pause auto-sync" : "Resume auto-sync"}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => onRunAction("restore", state.onRestore)}
                  disabled={state.pending}
                  className="justify-start"
                >
                  <RotateCcw size={14} />
                  {pendingAction === "restore" ? "Restoring..." : "Restore checkout"}
                </Button>
              </>
            )}
          </section>
        </div>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}

function targetOptionDetail(option: LinkedCheckoutTargetOption): string {
  if (option.isAttachedToGroup) return "Attached to this session";
  if (option.repoRegistered && option.isCurrentDesktop) return "Repo linked on this desktop";
  if (option.repoRegistered) return "Repo linked";
  if (option.isCurrentDesktop) return "This desktop";
  return "Repo not linked";
}
