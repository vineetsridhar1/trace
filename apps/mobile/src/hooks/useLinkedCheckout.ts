import { useCallback, useEffect, useRef, useState } from "react";
import {
  LINKED_CHECKOUT_STATUS_QUERY,
  RESTORE_LINKED_CHECKOUT_MUTATION,
  SET_LINKED_CHECKOUT_AUTO_SYNC_MUTATION,
  SYNC_LINKED_CHECKOUT_MUTATION,
  useEntityField,
} from "@trace/client-core";
import type { SessionConnection } from "@trace/gql";
import { getClient } from "@/lib/urql";

export interface LinkedCheckoutStatus {
  repoId: string;
  repoPath: string | null;
  isAttached: boolean;
  attachedSessionGroupId: string | null;
  targetBranch: string | null;
  autoSyncEnabled: boolean;
  currentBranch: string | null;
  currentCommitSha: string | null;
  lastSyncedCommitSha: string | null;
  lastSyncError: string | null;
  restoreBranch: string | null;
  restoreCommitSha: string | null;
}

export type LinkedCheckoutAction = "sync" | "restore" | "toggle-auto-sync";

interface ActionOutcome {
  ok: boolean;
  error: string | null;
}

export interface UseLinkedCheckoutResult {
  /** True only when groupId resolves to a repo, runtime, and branch — i.e. linked-checkout could apply. */
  available: boolean;
  loading: boolean;
  status: LinkedCheckoutStatus | null;
  branch: string | null;
  repoLinked: boolean;
  isAttachedToThisGroup: boolean;
  isAttachedElsewhere: boolean;
  pendingAction: LinkedCheckoutAction | null;
  sync: () => Promise<ActionOutcome>;
  restore: () => Promise<ActionOutcome>;
  toggleAutoSync: () => Promise<ActionOutcome>;
}

interface MutationPayload {
  ok: boolean;
  error: string | null;
  status: LinkedCheckoutStatus;
}

type MutationResponseData =
  | { syncLinkedCheckout?: MutationPayload | null }
  | { restoreLinkedCheckout?: MutationPayload | null }
  | { setLinkedCheckoutAutoSync?: MutationPayload | null };

/**
 * Drives the sync / pause / restore controls in the mobile session-title panel.
 * Mirrors the desktop `useLinkedCheckoutHeaderState`, minus the folder-pick
 * step (which only Trace Desktop can do). Mobile only consumes an existing
 * link and triggers actions against it.
 */
export function useLinkedCheckout(groupId: string): UseLinkedCheckoutResult {
  const repo = useEntityField("sessionGroups", groupId, "repo") as
    | { id?: string }
    | null
    | undefined;
  const branch = useEntityField("sessionGroups", groupId, "branch") as
    | string
    | null
    | undefined;
  const connection = useEntityField("sessionGroups", groupId, "connection") as
    | SessionConnection
    | null
    | undefined;

  const repoId = repo?.id ?? null;
  const runtimeInstanceId = connection?.runtimeInstanceId ?? null;
  const connected = !!runtimeInstanceId && connection?.state !== "disconnected";
  const available = !!repoId && !!branch && connected;

  const [status, setStatus] = useState<LinkedCheckoutStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingAction, setPendingAction] =
    useState<LinkedCheckoutAction | null>(null);
  const pendingRef = useRef<LinkedCheckoutAction | null>(null);

  useEffect(() => {
    if (!available || !repoId) {
      setStatus(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void getClient()
      .query(
        LINKED_CHECKOUT_STATUS_QUERY,
        { sessionGroupId: groupId, repoId },
        { requestPolicy: "network-only" },
      )
      .toPromise()
      .then((result) => {
        if (cancelled) return;
        const next =
          (result.data?.linkedCheckoutStatus as LinkedCheckoutStatus | null | undefined) ??
          null;
        setStatus(next);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [available, groupId, repoId]);

  const isAttachedToThisGroup = status?.attachedSessionGroupId === groupId;
  const isAttachedElsewhere = !!status?.isAttached && !isAttachedToThisGroup;
  const repoLinked = !!status?.repoPath;

  const runAction = useCallback(
    async (
      action: LinkedCheckoutAction,
      perform: () => Promise<MutationPayload | null>,
    ): Promise<ActionOutcome> => {
      if (pendingRef.current) return { ok: false, error: "Another action is in progress." };
      pendingRef.current = action;
      setPendingAction(action);
      try {
        const payload = await perform();
        if (!payload) return { ok: false, error: "No response from server." };
        setStatus(payload.status);
        return { ok: payload.ok, error: payload.error };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        };
      } finally {
        pendingRef.current = null;
        setPendingAction(null);
      }
    },
    [],
  );

  const sync = useCallback(async (): Promise<ActionOutcome> => {
    if (!repoId || !branch) return { ok: false, error: "Missing repo or branch." };
    return runAction("sync", async () => {
      const result = await getClient()
        .mutation(SYNC_LINKED_CHECKOUT_MUTATION, {
          sessionGroupId: groupId,
          repoId,
          branch,
          autoSyncEnabled: true,
        })
        .toPromise();
      if (result.error) throw result.error;
      const data = result.data as MutationResponseData | undefined;
      return (data && "syncLinkedCheckout" in data ? data.syncLinkedCheckout : null) ?? null;
    });
  }, [branch, groupId, repoId, runAction]);

  const restore = useCallback(async (): Promise<ActionOutcome> => {
    if (!repoId) return { ok: false, error: "Missing repo." };
    return runAction("restore", async () => {
      const result = await getClient()
        .mutation(RESTORE_LINKED_CHECKOUT_MUTATION, {
          sessionGroupId: groupId,
          repoId,
        })
        .toPromise();
      if (result.error) throw result.error;
      const data = result.data as MutationResponseData | undefined;
      return (
        (data && "restoreLinkedCheckout" in data ? data.restoreLinkedCheckout : null) ?? null
      );
    });
  }, [groupId, repoId, runAction]);

  const toggleAutoSync = useCallback(async (): Promise<ActionOutcome> => {
    if (!repoId || !status) return { ok: false, error: "Missing repo or status." };
    const next = !status.autoSyncEnabled;
    return runAction("toggle-auto-sync", async () => {
      const result = await getClient()
        .mutation(SET_LINKED_CHECKOUT_AUTO_SYNC_MUTATION, {
          sessionGroupId: groupId,
          repoId,
          enabled: next,
        })
        .toPromise();
      if (result.error) throw result.error;
      const data = result.data as MutationResponseData | undefined;
      return (
        (data && "setLinkedCheckoutAutoSync" in data
          ? data.setLinkedCheckoutAutoSync
          : null) ?? null
      );
    });
  }, [groupId, repoId, runAction, status]);

  return {
    available,
    loading,
    status,
    branch: branch ?? null,
    repoLinked,
    isAttachedToThisGroup,
    isAttachedElsewhere,
    pendingAction,
    sync,
    restore,
    toggleAutoSync,
  };
}
