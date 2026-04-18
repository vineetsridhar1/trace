import { useState } from "react";
import { toast } from "sonner";
import {
  linkLinkedCheckoutRepo,
  restoreLinkedCheckout,
  setLinkedCheckoutAutoSync,
  syncLinkedCheckout,
  useLinkedCheckoutStatus,
} from "../../stores/linked-checkout";

interface UseLinkedCheckoutHeaderStateProps {
  repoId: string | null | undefined;
  groupBranch: string | null | undefined;
  runtimeInstanceId: string | null | undefined;
  sessionGroupId: string;
  enabled: boolean;
}

export interface LinkedCheckoutHeaderState {
  repoLinked: boolean;
  canLinkRepo: boolean;
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
  runtimeInstanceId,
  sessionGroupId,
  enabled,
}: UseLinkedCheckoutHeaderStateProps): LinkedCheckoutHeaderState {
  const {
    status,
    pending: syncPending,
    loaded,
    canPickFolder,
  } = useLinkedCheckoutStatus(repoId ?? null, sessionGroupId, runtimeInstanceId ?? null, enabled);
  const [linking, setLinking] = useState(false);

  const isAttachedToThisGroup = status?.attachedSessionGroupId === sessionGroupId;
  const isAttachedElsewhere = !!status?.isAttached && !isAttachedToThisGroup;
  const repoLinked = !!status?.repoPath;
  const hasSyncContext = !!repoId && !!groupBranch && !!runtimeInstanceId;
  const canShowControls = enabled && hasSyncContext && loaded;
  const canLinkRepo = canShowControls && !repoLinked && canPickFolder;
  const requiresRepoLink = canShowControls && !repoLinked;
  const pending = syncPending || linking;
  const syncedCommitSha = status?.lastSyncedCommitSha ?? status?.currentCommitSha ?? null;
  const summaryBranch = isAttachedToThisGroup && groupBranch ? groupBranch : status?.targetBranch;

  const onLinkRepo = async () => {
    if (!repoId || !runtimeInstanceId || pending) return;

    if (!window.trace?.pickFolder || !canPickFolder) {
      toast.error("Linking a local checkout is only available in Trace Desktop.");
      return;
    }

    setLinking(true);
    try {
      const folderPath = await window.trace.pickFolder();
      if (!folderPath) return;

      const result = await linkLinkedCheckoutRepo(
        sessionGroupId,
        repoId,
        folderPath,
        runtimeInstanceId,
      );
      if (!result.ok) {
        toast.error("Failed to link local checkout", {
          description: result.error ?? "Unknown error",
        });
        return;
      }

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
    if (!repoId || !groupBranch || !runtimeInstanceId || pending) return;

    try {
      const result = await syncLinkedCheckout({
        repoId,
        sessionGroupId,
        runtimeInstanceId,
        branch: groupBranch,
        autoSyncEnabled: true,
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
    if (!repoId || !runtimeInstanceId || pending) return;

    try {
      const result = await restoreLinkedCheckout(repoId, sessionGroupId, runtimeInstanceId);
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
    if (!repoId || !runtimeInstanceId || !status || pending) return;

    const nextEnabled = !status.autoSyncEnabled;

    try {
      const result = await setLinkedCheckoutAutoSync(
        repoId,
        sessionGroupId,
        nextEnabled,
        runtimeInstanceId,
      );
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
    repoLinked,
    canLinkRepo,
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
