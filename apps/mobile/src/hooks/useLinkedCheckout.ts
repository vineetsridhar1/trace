import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";
import {
  BRIDGE_RUNTIME_ACCESS_QUERY,
  COMMIT_LINKED_CHECKOUT_CHANGES_MUTATION,
  LINKED_CHECKOUT_STATUS_QUERY,
  RESTORE_LINKED_CHECKOUT_MUTATION,
  SET_LINKED_CHECKOUT_AUTO_SYNC_MUTATION,
  SYNC_LINKED_CHECKOUT_MUTATION,
  useEntityField,
} from "@trace/client-core";
import type {
  BridgeRuntimeAccess,
  LinkedCheckoutActionResult,
  LinkedCheckoutErrorCode,
  LinkedCheckoutStatus,
  Repo,
  SessionConnection,
} from "@trace/gql";
import { getClient } from "@/lib/urql";

export type LinkedCheckoutAction = "sync" | "commit" | "restore" | "toggle-auto-sync";

interface ActionOutcome {
  ok: boolean;
  error: string | null;
  errorCode?: LinkedCheckoutErrorCode | null;
}

export interface SyncConflictResolutionInput {
  conflictStrategy?: "DISCARD" | "COMMIT" | "REBASE";
  commitMessage?: string;
}

export interface UseLinkedCheckoutResult {
  /** True only when groupId resolves to a repo, runtime, branch, AND the user has bridge access. */
  available: boolean;
  loading: boolean;
  /** Server returned a fetch error — distinct from "no link configured". */
  fetchError: string | null;
  status: LinkedCheckoutStatus | null;
  branch: string | null;
  /** Best-known commit on the linked checkout: last sync if present, else current worktree commit. */
  syncedCommitSha: string | null;
  repoLinked: boolean;
  isAttachedToThisGroup: boolean;
  isAttachedElsewhere: boolean;
  hasUncommittedChanges: boolean;
  pendingAction: LinkedCheckoutAction | null;
  refresh: () => void;
  sync: (input?: SyncConflictResolutionInput) => Promise<ActionOutcome>;
  commitChanges: () => Promise<ActionOutcome>;
  restore: () => Promise<ActionOutcome>;
  toggleAutoSync: () => Promise<ActionOutcome>;
}

type StatusQueryData = { linkedCheckoutStatus?: LinkedCheckoutStatus | null };
type AccessQueryData = { bridgeRuntimeAccess?: BridgeRuntimeAccess | null };
type SyncMutationData = { syncLinkedCheckout?: LinkedCheckoutActionResult | null };
type CommitMutationData = {
  commitLinkedCheckoutChanges?: LinkedCheckoutActionResult | null;
};
type RestoreMutationData = { restoreLinkedCheckout?: LinkedCheckoutActionResult | null };
type AutoSyncMutationData = {
  setLinkedCheckoutAutoSync?: LinkedCheckoutActionResult | null;
};
const STATUS_POLL_INTERVAL_MS = 10_000;

/**
 * Drives the sync / commit / pause / restore controls in the mobile
 * session-title panel.
 * Mirrors the desktop `useLinkedCheckoutHeaderState`, minus the folder-pick
 * step (which only Trace Desktop can do). Mobile only consumes an existing
 * link and triggers actions against it.
 */
export function useLinkedCheckout(groupId: string): UseLinkedCheckoutResult {
  const repo = useEntityField("sessionGroups", groupId, "repo") as Repo | null | undefined;
  const branch = useEntityField("sessionGroups", groupId, "branch") as string | null | undefined;
  const connection = useEntityField("sessionGroups", groupId, "connection") as
    | SessionConnection
    | null
    | undefined;

  const repoId = repo?.id ?? null;
  const runtimeInstanceId = connection?.runtimeInstanceId ?? null;
  const connected = !!runtimeInstanceId && connection?.state !== "disconnected";

  // Bridge-access gate. Optimistically allow until the access query resolves;
  // for cloud sessions it stays allowed (no bridge to authorize against).
  const [access, setAccess] = useState<BridgeRuntimeAccess | null>(null);
  const [accessLoaded, setAccessLoaded] = useState(false);
  useEffect(() => {
    if (!runtimeInstanceId) {
      setAccess(null);
      setAccessLoaded(true);
      return;
    }
    let cancelled = false;
    setAccessLoaded(false);
    void getClient()
      .query(BRIDGE_RUNTIME_ACCESS_QUERY, { runtimeInstanceId, sessionGroupId: groupId })
      .toPromise()
      .then((result) => {
        if (cancelled) return;
        const next = (result.data as AccessQueryData | undefined)?.bridgeRuntimeAccess ?? null;
        setAccess(next);
        setAccessLoaded(true);
      })
      .catch(() => {
        if (cancelled) return;
        // Treat a failed access fetch as allowed; the mutation will reject if
        // the user truly lacks permission, with a clear error surfaced.
        setAccess(null);
        setAccessLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [groupId, runtimeInstanceId]);

  const bridgeAllowed = !access || access.hostingMode !== "local" || access.isOwner;
  const available = bridgeAllowed && !!repoId && !!branch && connected;

  const [status, setStatus] = useState<LinkedCheckoutStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<LinkedCheckoutAction | null>(null);
  const pendingRef = useRef<LinkedCheckoutAction | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    if (!available || !repoId || !accessLoaded) {
      // Don't clear status while access is still loading — that would flicker
      // the panel between branches.
      if (accessLoaded) {
        setStatus(null);
        setFetchError(null);
        setLoading(false);
      }
      return;
    }
    let cancelled = false;
    const isInitialLoad = status === null;
    if (isInitialLoad) {
      setLoading(true);
      setFetchError(null);
    }
    void getClient()
      .query(
        LINKED_CHECKOUT_STATUS_QUERY,
        { sessionGroupId: groupId, repoId, runtimeInstanceId },
        { requestPolicy: "network-only" },
      )
      .toPromise()
      .then((result) => {
        if (cancelled) return;
        if (result.error) {
          if (isInitialLoad) {
            setFetchError(result.error.message);
          } else {
            console.warn("[linkedCheckoutStatus] refresh failed", result.error);
          }
          setLoading(false);
          return;
        }
        const next = (result.data as StatusQueryData | undefined)?.linkedCheckoutStatus ?? null;
        setStatus(next);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (isInitialLoad) {
          setFetchError(err instanceof Error ? err.message : String(err));
        } else {
          console.warn("[linkedCheckoutStatus] refresh threw", err);
        }
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accessLoaded, available, groupId, refreshTick, repoId, runtimeInstanceId, status]);

  const isAttachedToThisGroup = status?.attachedSessionGroupId === groupId;
  const isAttachedElsewhere = !!status?.isAttached && !isAttachedToThisGroup;
  const repoLinked = !!status?.repoPath;
  const syncedCommitSha = status?.lastSyncedCommitSha ?? status?.currentCommitSha ?? null;
  const hasUncommittedChanges = !!status?.hasUncommittedChanges;

  const refresh = useCallback(() => setRefreshTick((n) => n + 1), []);

  useEffect(() => {
    if (!available) return;
    const intervalId = setInterval(() => {
      if (AppState.currentState === "active") refresh();
    }, STATUS_POLL_INTERVAL_MS);
    const appStateSub = AppState.addEventListener("change", (state: AppStateStatus) => {
      if (state === "active") refresh();
    });
    return () => {
      clearInterval(intervalId);
      appStateSub.remove();
    };
  }, [available, refresh]);

  const runAction = useCallback(
    async (
      action: LinkedCheckoutAction,
      perform: () => Promise<LinkedCheckoutActionResult | null>,
    ): Promise<ActionOutcome> => {
      if (pendingRef.current) return { ok: false, error: "Another action is in progress." };
      pendingRef.current = action;
      setPendingAction(action);
      try {
        const payload = await perform();
        if (!payload) return { ok: false, error: "No response from server." };
        setStatus(payload.status);
        return {
          ok: payload.ok,
          error: payload.error ?? null,
          errorCode: payload.errorCode ?? null,
        };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
          errorCode: null,
        };
      } finally {
        pendingRef.current = null;
        setPendingAction(null);
      }
    },
    [],
  );

  const sync = useCallback(
    async (input?: SyncConflictResolutionInput): Promise<ActionOutcome> => {
      if (!repoId || !branch) return { ok: false, error: "Missing repo or branch." };
      return runAction("sync", async () => {
        const result = await getClient()
          .mutation(SYNC_LINKED_CHECKOUT_MUTATION, {
            sessionGroupId: groupId,
            repoId,
            branch,
            runtimeInstanceId,
            autoSyncEnabled: true,
            conflictStrategy: input?.conflictStrategy,
            commitMessage: input?.commitMessage,
          })
          .toPromise();
        if (result.error) throw result.error;
        return (result.data as SyncMutationData | undefined)?.syncLinkedCheckout ?? null;
      });
    },
    [branch, groupId, repoId, runAction, runtimeInstanceId],
  );

  const restore = useCallback(async (): Promise<ActionOutcome> => {
    if (!repoId) return { ok: false, error: "Missing repo." };
    return runAction("restore", async () => {
      const result = await getClient()
        .mutation(RESTORE_LINKED_CHECKOUT_MUTATION, {
          sessionGroupId: groupId,
          repoId,
          runtimeInstanceId,
        })
        .toPromise();
      if (result.error) throw result.error;
      return (result.data as RestoreMutationData | undefined)?.restoreLinkedCheckout ?? null;
    });
  }, [groupId, repoId, runAction, runtimeInstanceId]);

  const commitChanges = useCallback(async (): Promise<ActionOutcome> => {
    if (!repoId) return { ok: false, error: "Missing repo." };
    return runAction("commit", async () => {
      const result = await getClient()
        .mutation(COMMIT_LINKED_CHECKOUT_CHANGES_MUTATION, {
          sessionGroupId: groupId,
          repoId,
          runtimeInstanceId,
        })
        .toPromise();
      if (result.error) throw result.error;
      return (result.data as CommitMutationData | undefined)?.commitLinkedCheckoutChanges ?? null;
    });
  }, [groupId, repoId, runAction, runtimeInstanceId]);

  const toggleAutoSync = useCallback(async (): Promise<ActionOutcome> => {
    if (!repoId || !status) return { ok: false, error: "Missing repo or status." };
    const next = !status.autoSyncEnabled;
    return runAction("toggle-auto-sync", async () => {
      const result = await getClient()
        .mutation(SET_LINKED_CHECKOUT_AUTO_SYNC_MUTATION, {
          sessionGroupId: groupId,
          repoId,
          enabled: next,
          runtimeInstanceId,
        })
        .toPromise();
      if (result.error) throw result.error;
      return (result.data as AutoSyncMutationData | undefined)?.setLinkedCheckoutAutoSync ?? null;
    });
  }, [groupId, repoId, runAction, runtimeInstanceId, status]);

  return {
    available,
    loading,
    fetchError,
    status,
    branch: branch ?? null,
    syncedCommitSha,
    repoLinked,
    isAttachedToThisGroup,
    isAttachedElsewhere,
    hasUncommittedChanges,
    pendingAction,
    refresh,
    sync,
    commitChanges,
    restore,
    toggleAutoSync,
  };
}
