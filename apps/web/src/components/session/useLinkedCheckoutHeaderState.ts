import { toast } from "sonner";
import {
  restoreLinkedCheckout,
  setLinkedCheckoutAutoSync,
  syncLinkedCheckout,
  useLinkedCheckoutStatus,
} from "../../stores/linked-checkout";

interface UseLinkedCheckoutHeaderStateProps {
  repoId: string | null | undefined;
  groupBranch: string | null | undefined;
  sessionGroupId: string;
}

export interface LinkedCheckoutHeaderState {
  isAttachedToThisGroup: boolean;
  isAttachedElsewhere: boolean;
  pending: boolean;
  autoSyncEnabled: boolean;
  summaryBranch: string | null | undefined;
  syncedCommitSha: string | null;
  lastSyncError: string | null | undefined;
  canShowControls: boolean;
  onSync: () => Promise<void>;
  onRestore: () => Promise<void>;
  onToggleAutoSync: () => Promise<void>;
}

export function useLinkedCheckoutHeaderState({
  repoId,
  groupBranch,
  sessionGroupId,
}: UseLinkedCheckoutHeaderStateProps): LinkedCheckoutHeaderState {
  const { status, pending, hasDesktopApi } = useLinkedCheckoutStatus(repoId ?? null);

  const isAttachedToThisGroup = status?.attachedSessionGroupId === sessionGroupId;
  const isAttachedElsewhere = !!status?.isAttached && !isAttachedToThisGroup;
  const repoLinked = !!status?.repoPath;
  const canShowControls = hasDesktopApi && !!repoId && !!groupBranch && repoLinked;
  const syncedCommitSha = status?.lastSyncedCommitSha ?? status?.currentCommitSha ?? null;
  const summaryBranch =
    isAttachedToThisGroup && groupBranch ? groupBranch : status?.targetBranch;

  const onSync = async () => {
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

  const onRestore = async () => {
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

  const onToggleAutoSync = async () => {
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

  return {
    isAttachedToThisGroup,
    isAttachedElsewhere,
    pending,
    autoSyncEnabled: !!status?.autoSyncEnabled,
    summaryBranch,
    syncedCommitSha,
    lastSyncError: status?.lastSyncError,
    canShowControls,
    onSync,
    onRestore,
    onToggleAutoSync,
  };
}
