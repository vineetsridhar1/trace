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
  runtimeLabel: string | null | undefined;
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
  hasUncommittedChanges: boolean;
  summaryBranch: string | null | undefined;
  syncedCommitSha: string | null;
  lastSyncError: string | null | undefined;
  canShowControls: boolean;
  syncConflictOpen: boolean;
  syncConflictError: string | null;
  onLinkRepo: () => Promise<void>;
  onSync: () => Promise<void>;
  onResolveSyncConflict: (input: {
    strategy: "DISCARD" | "COMMIT" | "REBASE";
    commitMessage?: string;
  }) => Promise<void>;
  onCloseSyncConflict: () => void;
  onRestore: () => Promise<void>;
  onToggleAutoSync: () => Promise<void>;
}

export function useLinkedCheckoutHeaderState({
  repoId,
  groupBranch,
  runtimeLabel,
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
  const [syncConflictError, setSyncConflictError] = useState<string | null>(null);

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
  const runtimeDisplayLabel = runtimeLabel?.trim() || "this bridge";

  const runSync = async (options?: {
    conflictStrategy?: "DISCARD" | "COMMIT" | "REBASE";
    commitMessage?: string;
  }) => {
    if (!repoId || !groupBranch || !runtimeInstanceId || pending) return null;

    return syncLinkedCheckout({
      repoId,
      sessionGroupId,
      runtimeInstanceId,
      branch: groupBranch,
      autoSyncEnabled: true,
      conflictStrategy: options?.conflictStrategy,
      commitMessage: options?.commitMessage,
    });
  };

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
      const result = await runSync();
      if (!result) return;

      if (!result.ok) {
        if (result.errorCode === "DIRTY_ROOT_CHECKOUT") {
          setSyncConflictError(result.error);
          return;
        }
        toast.error("Failed to sync main worktree", {
          description: result.error ?? "Unknown error",
        });
        return;
      }

      setSyncConflictError(null);
      toast.success("Main worktree synced", {
        description: `Now following ${groupBranch} on ${runtimeDisplayLabel}.`,
      });
    } catch (error) {
      toast.error("Failed to sync main worktree", {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const onResolveSyncConflict = async ({
    strategy,
    commitMessage,
  }: {
    strategy: "DISCARD" | "COMMIT" | "REBASE";
    commitMessage?: string;
  }) => {
    if (!repoId || !groupBranch || !runtimeInstanceId || pending) return;

    try {
      const result = await runSync({ conflictStrategy: strategy, commitMessage });
      if (!result) return;

      if (!result.ok) {
        setSyncConflictError(result.error ?? "Unknown error");
        return;
      }

      setSyncConflictError(null);
      if (strategy === "DISCARD") {
        toast.success("Main worktree synced", {
          description: `Discarded local changes and now following ${groupBranch} on ${runtimeDisplayLabel}.`,
        });
      } else if (strategy === "COMMIT") {
        toast.success("Main worktree synced", {
          description: `Committed local changes and now following ${groupBranch} on ${runtimeDisplayLabel}.`,
        });
      } else {
        toast.success("Main worktree synced", {
          description: `Rebased local changes on top of ${groupBranch} on ${runtimeDisplayLabel}.`,
        });
      }
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
    hasUncommittedChanges: !!status?.hasUncommittedChanges,
    summaryBranch,
    syncedCommitSha,
    lastSyncError: status?.lastSyncError,
    canShowControls,
    syncConflictOpen: syncConflictError !== null,
    syncConflictError,
    onLinkRepo,
    onSync,
    onResolveSyncConflict,
    onCloseSyncConflict: () => setSyncConflictError(null),
    onRestore,
    onToggleAutoSync,
  };
}
