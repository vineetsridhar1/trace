import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  linkLinkedCheckoutRepo,
  restoreLinkedCheckout,
  setLinkedCheckoutAutoSync,
  syncLinkedCheckout,
  useLinkedCheckoutStatus,
} from "../../stores/linked-checkout";
import { useBridgesStore, type BridgesState } from "../../stores/bridges";

interface UseLinkedCheckoutHeaderStateProps {
  repoId: string | null | undefined;
  groupBranch: string | null | undefined;
  runtimeLabel: string | null | undefined;
  runtimeInstanceId: string | null | undefined;
  sessionGroupId: string;
  enabled: boolean;
}

export interface LinkedCheckoutHeaderState {
  targetRuntimeInstanceId: string | null;
  targetDisplayLabel: string;
  sessionRuntimeLabel: string | null;
  targetIsSessionRuntime: boolean;
  canSelectTarget: boolean;
  needsTargetSelection: boolean;
  targetOptions: LinkedCheckoutTargetOption[];
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
  onSelectTarget: (runtimeInstanceId: string) => void;
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

export interface LinkedCheckoutTargetOption {
  instanceId: string;
  label: string;
  repoRegistered: boolean;
  isAttachedToGroup: boolean;
  isCurrentDesktop: boolean;
}

export function useLinkedCheckoutHeaderState({
  repoId,
  groupBranch,
  runtimeLabel,
  runtimeInstanceId,
  sessionGroupId,
  enabled,
}: UseLinkedCheckoutHeaderStateProps): LinkedCheckoutHeaderState {
  const bridges = useBridgesStore((s: BridgesState) => s.bridges);
  const connectedLocalBridges = bridges.filter(
    (bridge) => bridge.connected && bridge.hostingMode === "local",
  );
  const [selectedTargetRuntimeId, setSelectedTargetRuntimeId] = useState<string | null>(null);
  const [desktopBridgeInstanceId, setDesktopBridgeInstanceId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!window.trace?.getBridgeInfo) return;

    window.trace
      .getBridgeInfo()
      .then((info) => {
        if (!cancelled) setDesktopBridgeInstanceId(info?.instanceId ?? null);
      })
      .catch(() => {
        if (!cancelled) setDesktopBridgeInstanceId(null);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const connectedLocalBridgeIds = connectedLocalBridges
    .map((bridge) => bridge.instanceId)
    .join("\0");

  useEffect(() => {
    if (!selectedTargetRuntimeId) return;
    if (connectedLocalBridges.some((bridge) => bridge.instanceId === selectedTargetRuntimeId)) {
      return;
    }
    setSelectedTargetRuntimeId(null);
  }, [connectedLocalBridgeIds, connectedLocalBridges, selectedTargetRuntimeId]);

  const currentDesktopBridge = desktopBridgeInstanceId
    ? (connectedLocalBridges.find((bridge) => bridge.instanceId === desktopBridgeInstanceId) ??
      null)
    : null;
  const sessionRuntimeBridge = runtimeInstanceId
    ? (connectedLocalBridges.find((bridge) => bridge.instanceId === runtimeInstanceId) ?? null)
    : null;
  const preferredBridge = currentDesktopBridge ?? sessionRuntimeBridge;
  const selectedBridge = selectedTargetRuntimeId
    ? (connectedLocalBridges.find((bridge) => bridge.instanceId === selectedTargetRuntimeId) ??
      null)
    : null;
  const targetBridge = selectedBridge ?? preferredBridge;
  const effectiveRuntimeInstanceId = targetBridge?.instanceId ?? null;
  const effectiveRuntimeLabel = targetBridge?.label ?? null;
  const targetOptions = connectedLocalBridges.map((bridge) => ({
    instanceId: bridge.instanceId,
    label: bridge.label,
    repoRegistered: repoId ? bridge.registeredRepoIds.includes(repoId) : false,
    isAttachedToGroup: sessionGroupId
      ? bridge.linkedCheckouts.some((checkout) => checkout.sessionGroup.id === sessionGroupId)
      : false,
    isCurrentDesktop: bridge.instanceId === desktopBridgeInstanceId,
  }));
  const {
    status,
    pending: syncPending,
    loaded,
    canPickFolder,
  } = useLinkedCheckoutStatus(repoId ?? null, sessionGroupId, effectiveRuntimeInstanceId, enabled);
  const [linking, setLinking] = useState(false);
  const [syncConflictError, setSyncConflictError] = useState<string | null>(null);

  const isAttachedToThisGroup = status?.attachedSessionGroupId === sessionGroupId;
  const isAttachedElsewhere = !!status?.isAttached && !isAttachedToThisGroup;
  const repoLinked = !!status?.repoPath;
  const hasSyncContext = !!repoId && !!groupBranch && !!effectiveRuntimeInstanceId;
  const canSelectTarget = enabled && !!repoId && !!groupBranch && targetOptions.length > 0;
  const needsTargetSelection = canSelectTarget && !effectiveRuntimeInstanceId;
  const canShowControls = enabled && hasSyncContext && loaded;
  const selectedTargetCanPickFolder =
    canPickFolder &&
    (!desktopBridgeInstanceId ||
      !effectiveRuntimeInstanceId ||
      desktopBridgeInstanceId === effectiveRuntimeInstanceId);
  const canLinkRepo = canShowControls && !repoLinked && selectedTargetCanPickFolder;
  const requiresRepoLink = canShowControls && !repoLinked;
  const pending = syncPending || linking;
  const syncedCommitSha = status?.lastSyncedCommitSha ?? status?.currentCommitSha ?? null;
  const summaryBranch = isAttachedToThisGroup && groupBranch ? groupBranch : status?.targetBranch;
  const runtimeDisplayLabel = effectiveRuntimeLabel?.trim() || "this bridge";
  const sessionRuntimeLabel = runtimeLabel?.trim() || null;
  const targetIsSessionRuntime =
    !!effectiveRuntimeInstanceId &&
    !!runtimeInstanceId &&
    effectiveRuntimeInstanceId === runtimeInstanceId;

  const runSync = async (options?: {
    conflictStrategy?: "DISCARD" | "COMMIT" | "REBASE";
    commitMessage?: string;
  }) => {
    if (!repoId || !groupBranch || !effectiveRuntimeInstanceId || pending) return null;

    return syncLinkedCheckout({
      repoId,
      sessionGroupId,
      runtimeInstanceId: effectiveRuntimeInstanceId,
      branch: groupBranch,
      autoSyncEnabled: true,
      conflictStrategy: options?.conflictStrategy,
      commitMessage: options?.commitMessage,
    });
  };

  const onLinkRepo = async () => {
    if (!repoId || !effectiveRuntimeInstanceId || pending) return;

    if (!window.trace?.pickFolder || !canPickFolder) {
      toast.error("Linking a local checkout is only available in Trace Desktop.");
      return;
    }

    setLinking(true);
    try {
      const folderPath = await window.trace.pickFolder();
      if (!folderPath) return;
      const bridgeInfo = await window.trace.getBridgeInfo?.();
      const pickerRuntimeInstanceId = bridgeInfo?.instanceId ?? desktopBridgeInstanceId;
      if (pickerRuntimeInstanceId && pickerRuntimeInstanceId !== effectiveRuntimeInstanceId) {
        toast.error("Open Trace Desktop on the selected bridge to link a folder.", {
          description: `${runtimeDisplayLabel} is selected as the checkout target.`,
        });
        return;
      }

      const result = await linkLinkedCheckoutRepo(
        sessionGroupId,
        repoId,
        folderPath,
        effectiveRuntimeInstanceId,
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
    if (!repoId || !groupBranch || !effectiveRuntimeInstanceId || pending) return;

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
    if (!repoId || !groupBranch || !effectiveRuntimeInstanceId || pending) return;

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
    if (!repoId || !effectiveRuntimeInstanceId || pending) return;

    try {
      const result = await restoreLinkedCheckout(
        repoId,
        sessionGroupId,
        effectiveRuntimeInstanceId,
      );
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
    if (!repoId || !effectiveRuntimeInstanceId || !status || pending) return;

    const nextEnabled = !status.autoSyncEnabled;

    try {
      const result = await setLinkedCheckoutAutoSync(
        repoId,
        sessionGroupId,
        nextEnabled,
        effectiveRuntimeInstanceId,
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
    targetRuntimeInstanceId: effectiveRuntimeInstanceId,
    targetDisplayLabel: runtimeDisplayLabel,
    sessionRuntimeLabel,
    targetIsSessionRuntime,
    canSelectTarget,
    needsTargetSelection,
    targetOptions,
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
    onSelectTarget: setSelectedTargetRuntimeId,
    onLinkRepo,
    onSync,
    onResolveSyncConflict,
    onCloseSyncConflict: () => setSyncConflictError(null),
    onRestore,
    onToggleAutoSync,
  };
}
