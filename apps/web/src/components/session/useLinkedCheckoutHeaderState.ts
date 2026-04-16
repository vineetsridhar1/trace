import { useState } from "react";
import { toast } from "sonner";
import {
  refreshLinkedCheckoutStatus,
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
  hasDesktopApi: boolean;
  repoLinked: boolean;
  requiresDesktop: boolean;
  requiresRepoLink: boolean;
  isAttachedToThisGroup: boolean;
  isAttachedElsewhere: boolean;
  pending: boolean;
  autoSyncEnabled: boolean;
  summaryBranch: string | null | undefined;
  syncedCommitSha: string | null;
  lastSyncError: string | null | undefined;
  canShowControls: boolean;
  onLinkRepo: () => Promise<void>;
  onSync: () => Promise<void>;
  onRestore: () => Promise<void>;
  onToggleAutoSync: () => Promise<void>;
}

export function useLinkedCheckoutHeaderState({
  repoId,
  groupBranch,
  sessionGroupId,
}: UseLinkedCheckoutHeaderStateProps): LinkedCheckoutHeaderState {
  const { status, pending: syncPending, hasDesktopApi } = useLinkedCheckoutStatus(repoId ?? null);
  const [linking, setLinking] = useState(false);

  const isAttachedToThisGroup = status?.attachedSessionGroupId === sessionGroupId;
  const isAttachedElsewhere = !!status?.isAttached && !isAttachedToThisGroup;
  const repoLinked = !!status?.repoPath;
  const hasSyncContext = !!repoId && !!groupBranch;
  const statusLoaded = !repoId || status !== undefined;
  const requiresDesktop = hasSyncContext && !hasDesktopApi;
  const canShowControls = hasDesktopApi && hasSyncContext && statusLoaded;
  const requiresRepoLink = canShowControls && !repoLinked;
  const pending = syncPending || linking;
  const syncedCommitSha = status?.lastSyncedCommitSha ?? status?.currentCommitSha ?? null;
  const summaryBranch = isAttachedToThisGroup && groupBranch ? groupBranch : status?.targetBranch;

  const onLinkRepo = async () => {
    if (!repoId || pending) return;

    if (!window.trace?.pickFolder || !window.trace?.saveRepoPath) {
      toast.error("Linking a local checkout is only available in Trace Desktop.");
      return;
    }

    setLinking(true);
    try {
      const folderPath = await window.trace.pickFolder();
      if (!folderPath) return;

      await window.trace.saveRepoPath(repoId, folderPath);
      await refreshLinkedCheckoutStatus(repoId);
      toast.success("Local checkout linked", {
        description: "You can now sync this session group into your main worktree.",
      });
    } catch (error) {
      toast.error("Failed to link local checkout", {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setLinking(false);
    }
  };

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
        toast.error("Failed to sync main worktree", {
          description: result.error ?? "Unknown error",
        });
        return;
      }

      toast.success("Main worktree synced", {
        description: `Now following ${groupBranch}.`,
      });
    } catch (error) {
      toast.error("Failed to sync main worktree", {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const onRestore = async () => {
    if (!repoId || pending) return;

    try {
      const result = await restoreLinkedCheckout(repoId);
      if (!result.ok) {
        toast.error("Failed to restore main worktree", {
          description: result.error ?? "Unknown error",
        });
        return;
      }

      toast.success("Main worktree restored");
    } catch (error) {
      toast.error("Failed to restore main worktree", {
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
    hasDesktopApi,
    repoLinked,
    requiresDesktop,
    requiresRepoLink,
    isAttachedToThisGroup,
    isAttachedElsewhere,
    pending,
    autoSyncEnabled: !!status?.autoSyncEnabled,
    summaryBranch,
    syncedCommitSha,
    lastSyncError: status?.lastSyncError,
    canShowControls,
    onLinkRepo,
    onSync,
    onRestore,
    onToggleAutoSync,
  };
}
