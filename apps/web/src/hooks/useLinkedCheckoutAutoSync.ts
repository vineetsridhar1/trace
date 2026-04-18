import { useEffect } from "react";
import { useAuthStore } from "../stores/auth";
import {
  scheduleAutoSyncLinkedCheckout,
  useLinkedCheckoutStore,
} from "../stores/linked-checkout";
import { useUIStore, type UIState } from "../stores/ui";

const AUTO_SYNC_RECONCILE_INTERVAL_MS = 15_000;

// Inverse of `getStoreKey()` in stores/linked-checkout.ts (`${runtimeInstanceId}:${repoId}`).
// Splits on the first colon, which assumes runtimeInstanceId never contains one
// (true today: UUIDs from local bridges, `cloud-machine-<id>` from Fly).
function parseLinkedCheckoutStoreKey(
  key: string,
): { runtimeInstanceId: string; repoId: string } | null {
  const separatorIndex = key.indexOf(":");
  if (separatorIndex <= 0 || separatorIndex === key.length - 1) {
    return null;
  }

  return {
    runtimeInstanceId: key.slice(0, separatorIndex),
    repoId: key.slice(separatorIndex + 1),
  };
}

export function useLinkedCheckoutAutoSync() {
  const currentUserId = useAuthStore((s: { user: { id: string } | null }) => s.user?.id ?? null);
  const refreshTick = useUIStore((s: UIState) => s.refreshTick);

  // Reconcile reads `statusByKey` via getState() inside the closure, so the
  // effect intentionally does NOT depend on it — otherwise the 15s interval
  // would be torn down and recreated on every linked-checkout state change.
  useEffect(() => {
    if (!currentUserId) return;

    const reconcile = () => {
      for (const [key, status] of Object.entries(
        useLinkedCheckoutStore.getState().statusByKey,
      )) {
        const parsed = parseLinkedCheckoutStoreKey(key);
        if (
          !parsed ||
          !status?.isAttached ||
          !status.autoSyncEnabled ||
          !status.attachedSessionGroupId ||
          !status.repoId ||
          !status.targetBranch ||
          useLinkedCheckoutStore.getState().pendingByKey[key]
        ) {
          continue;
        }

        scheduleAutoSyncLinkedCheckout({
          repoId: status.repoId,
          sessionGroupId: status.attachedSessionGroupId,
          runtimeInstanceId: parsed.runtimeInstanceId,
          branch: status.targetBranch,
          autoSyncEnabled: status.autoSyncEnabled,
          source: "auto",
        });
      }
    };

    reconcile();

    const interval = window.setInterval(reconcile, AUTO_SYNC_RECONCILE_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [currentUserId, refreshTick]);
}
