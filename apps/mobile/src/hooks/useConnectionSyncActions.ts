import { useCallback, useEffect, useRef, useState } from "react";
import {
  COMMIT_LINKED_CHECKOUT_CHANGES_MUTATION,
  RESTORE_LINKED_CHECKOUT_MUTATION,
  SET_LINKED_CHECKOUT_AUTO_SYNC_MUTATION,
  SYNC_LINKED_CHECKOUT_MUTATION,
} from "@trace/client-core";
import type { LinkedCheckoutActionResult } from "@trace/gql";
import { getClient } from "@/lib/urql";
import type { ConnectionLinkedCheckout } from "@/hooks/useConnections";

export type ConnectionSyncAction = "sync" | "commit" | "restore" | "toggle-auto-sync";

type Outcome = { ok: boolean; error: string | null };
type MutationData = {
  syncLinkedCheckout?: LinkedCheckoutActionResult | null;
  commitLinkedCheckoutChanges?: LinkedCheckoutActionResult | null;
  restoreLinkedCheckout?: LinkedCheckoutActionResult | null;
  setLinkedCheckoutAutoSync?: LinkedCheckoutActionResult | null;
};

export function useConnectionSyncActions({
  checkout,
  onChanged,
}: {
  checkout: ConnectionLinkedCheckout;
  onChanged: () => Promise<void>;
}) {
  const [status, setStatus] = useState(checkout);
  const [pendingAction, setPendingAction] = useState<ConnectionSyncAction | null>(null);
  const pendingRef = useRef<ConnectionSyncAction | null>(null);
  const sessionGroupId = status.attachedSessionGroupId ?? null;
  const branch =
    status.targetBranch ?? status.attachedSessionGroup?.branch ?? status.currentBranch ?? null;

  useEffect(() => setStatus(checkout), [checkout]);

  const runAction = useCallback(
    async (
      action: ConnectionSyncAction,
      perform: () => Promise<LinkedCheckoutActionResult | null>,
    ): Promise<Outcome> => {
      if (pendingRef.current) return { ok: false, error: "Another action is in progress." };
      pendingRef.current = action;
      setPendingAction(action);
      try {
        const payload = await perform();
        if (!payload) return { ok: false, error: "No response from server." };
        setStatus(payload.status as ConnectionLinkedCheckout);
        await onChanged();
        return { ok: payload.ok, error: payload.error ?? null };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      } finally {
        pendingRef.current = null;
        setPendingAction(null);
      }
    },
    [onChanged],
  );

  const sync = useCallback(async () => {
    if (!sessionGroupId || !branch) return { ok: false, error: "Missing branch." };
    return runAction("sync", async () => {
      const result = await getClient()
        .mutation(SYNC_LINKED_CHECKOUT_MUTATION, {
          sessionGroupId,
          repoId: status.repoId,
          branch,
          autoSyncEnabled: true,
        })
        .toPromise();
      if (result.error) throw result.error;
      return (result.data as MutationData | undefined)?.syncLinkedCheckout ?? null;
    });
  }, [branch, runAction, sessionGroupId, status.repoId]);

  const restore = useCallback(async () => {
    if (!sessionGroupId) return { ok: false, error: "Missing synced session." };
    return runAction("restore", async () => {
      const result = await getClient()
        .mutation(RESTORE_LINKED_CHECKOUT_MUTATION, { sessionGroupId, repoId: status.repoId })
        .toPromise();
      if (result.error) throw result.error;
      return (result.data as MutationData | undefined)?.restoreLinkedCheckout ?? null;
    });
  }, [runAction, sessionGroupId, status.repoId]);

  const commitChanges = useCallback(async () => {
    if (!sessionGroupId) return { ok: false, error: "Missing synced session." };
    return runAction("commit", async () => {
      const result = await getClient()
        .mutation(COMMIT_LINKED_CHECKOUT_CHANGES_MUTATION, {
          sessionGroupId,
          repoId: status.repoId,
        })
        .toPromise();
      if (result.error) throw result.error;
      return (result.data as MutationData | undefined)?.commitLinkedCheckoutChanges ?? null;
    });
  }, [runAction, sessionGroupId, status.repoId]);

  const toggleAutoSync = useCallback(async () => {
    if (!sessionGroupId) return { ok: false, error: "Missing synced session." };
    return runAction("toggle-auto-sync", async () => {
      const result = await getClient()
        .mutation(SET_LINKED_CHECKOUT_AUTO_SYNC_MUTATION, {
          sessionGroupId,
          repoId: status.repoId,
          enabled: !status.autoSyncEnabled,
        })
        .toPromise();
      if (result.error) throw result.error;
      return (result.data as MutationData | undefined)?.setLinkedCheckoutAutoSync ?? null;
    });
  }, [runAction, sessionGroupId, status.autoSyncEnabled, status.repoId]);

  return { status, branch, pendingAction, sync, commitChanges, restore, toggleAutoSync };
}
