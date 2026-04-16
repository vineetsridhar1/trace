import { type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "../ui/button";
import {
  restoreLinkedCheckout,
  setLinkedCheckoutAutoSync,
  syncLinkedCheckout,
  useLinkedCheckoutStatus,
} from "../../stores/linked-checkout";

interface UseLinkedCheckoutHeaderUIProps {
  repoId: string | null | undefined;
  groupBranch: string | null | undefined;
  sessionGroupId: string;
}

interface LinkedCheckoutHeaderSlots {
  subtitle: ReactNode | null;
  actions: ReactNode | null;
}

export function useLinkedCheckoutHeaderUI({
  repoId,
  groupBranch,
  sessionGroupId,
}: UseLinkedCheckoutHeaderUIProps): LinkedCheckoutHeaderSlots {
  const { status, pending, hasDesktopApi } = useLinkedCheckoutStatus(repoId ?? null);

  const isAttachedToThisGroup = status?.attachedSessionGroupId === sessionGroupId;
  const isAttachedElsewhere = !!status?.isAttached && !isAttachedToThisGroup;
  const repoLinked = !!status?.repoPath;
  const canShowControls = hasDesktopApi && !!repoId && !!groupBranch && repoLinked;
  const syncedCommitSha = status?.lastSyncedCommitSha ?? status?.currentCommitSha ?? null;
  const summaryBranch =
    isAttachedToThisGroup && groupBranch ? groupBranch : status?.targetBranch;

  const handleSync = async () => {
    if (!repoId || !groupBranch || pending) return;

    try {
      const result = await syncLinkedCheckout({
        repoId,
        sessionGroupId,
        branch: groupBranch,
        autoSyncEnabled: true,
        source: "manual",
      });

      if (!result.ok) {
        toast.error("Failed to sync root checkout", {
          description: result.error ?? "Unknown error",
        });
        return;
      }

      toast.success("Root checkout synced", {
        description: `Now following ${groupBranch}.`,
      });
    } catch (error) {
      toast.error("Failed to sync root checkout", {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const handleRestore = async () => {
    if (!repoId || pending) return;

    try {
      const result = await restoreLinkedCheckout(repoId);
      if (!result.ok) {
        toast.error("Failed to restore root checkout", {
          description: result.error ?? "Unknown error",
        });
        return;
      }

      toast.success("Root checkout restored");
    } catch (error) {
      toast.error("Failed to restore root checkout", {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const handleToggleAutoSync = async () => {
    if (!repoId || !status || pending) return;

    const nextEnabled = !status.autoSyncEnabled;

    try {
      const result = await setLinkedCheckoutAutoSync(repoId, nextEnabled);
      if (!result.ok) {
        toast.error("Failed to update auto-sync", {
          description: result.error ?? "Unknown error",
        });
        return;
      }

      toast.success(nextEnabled ? "Auto-sync enabled" : "Auto-sync paused");
    } catch (error) {
      toast.error("Failed to update auto-sync", {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const subtitle =
    isAttachedToThisGroup && summaryBranch ? (
      <p className="mt-0.5 truncate text-xs text-muted-foreground">
        Root checkout following {summaryBranch}
        {syncedCommitSha ? ` at ${syncedCommitSha.slice(0, 7)}` : ""}
        {status?.autoSyncEnabled ? "" : " (auto-sync paused)"}
      </p>
    ) : isAttachedElsewhere ? (
      <p className="mt-0.5 truncate text-xs text-muted-foreground">
        Root checkout is attached to another Trace session.
      </p>
    ) : null;

  const errorLine =
    isAttachedToThisGroup && status?.lastSyncError ? (
      <p className="mt-0.5 truncate text-xs text-destructive">{status.lastSyncError}</p>
    ) : null;

  const actions = canShowControls ? (
    <>
      <Button
        variant={isAttachedToThisGroup ? "secondary" : "outline"}
        size="sm"
        onClick={handleSync}
        disabled={pending}
      >
        {pending ? "Syncing..." : "Sync To Root Checkout"}
      </Button>

      {isAttachedToThisGroup && (
        <>
          <Button variant="ghost" size="sm" onClick={handleToggleAutoSync} disabled={pending}>
            {status?.autoSyncEnabled ? "Pause Auto-Sync" : "Resume Auto-Sync"}
          </Button>
          <Button variant="outline" size="sm" onClick={handleRestore} disabled={pending}>
            Restore My Checkout
          </Button>
        </>
      )}
    </>
  ) : null;

  return {
    subtitle: subtitle || errorLine ? (
      <>
        {subtitle}
        {errorLine}
      </>
    ) : null,
    actions,
  };
}
