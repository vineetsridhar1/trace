import { useEffect, useRef } from "react";
import { gql } from "@urql/core";
import { client } from "../lib/urql";
import { useAuthStore } from "../stores/auth";
import {
  scheduleAutoSyncLinkedCheckout,
  useLinkedCheckoutStore,
} from "../stores/linked-checkout";
import { useUIStore, type UIState } from "../stores/ui";

const AUTO_SYNC_RECONCILE_INTERVAL_MS = 15_000;

const LINKED_CHECKOUT_AUTO_SYNC_QUERY = gql`
  query LinkedCheckoutAutoSync($sessionGroupId: ID!) {
    sessionGroup(id: $sessionGroupId) {
      id
      branch
    }
    sessionGroupLatestCheckpoint(sessionGroupId: $sessionGroupId) {
      id
      sessionGroupId
      repoId
      commitSha
      committedAt
      createdAt
    }
  }
`;

type LinkedCheckoutAutoSyncQueryData = {
  sessionGroup?: {
    id: string;
    branch?: string | null;
  } | null;
  sessionGroupLatestCheckpoint?: {
    id: string;
    sessionGroupId: string;
    repoId: string;
    commitSha: string;
    committedAt: string;
    createdAt: string;
  } | null;
};

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
  const fetchesByGroupRef = useRef(
    new Map<string, Promise<LinkedCheckoutAutoSyncQueryData | null>>(),
  );
  const reconcileInFlightRef = useRef(false);

  // Reconcile reads `statusByKey` via getState() inside the closure, so the
  // effect intentionally does NOT depend on it — otherwise the 15s interval
  // would be torn down and recreated on every linked-checkout state change.
  useEffect(() => {
    if (!currentUserId) return;

    let cancelled = false;

    const fetchGroupSyncState = async (
      sessionGroupId: string,
    ): Promise<LinkedCheckoutAutoSyncQueryData | null> => {
      const existing = fetchesByGroupRef.current.get(sessionGroupId);
      if (existing) {
        return existing;
      }

      const promise = client
        .query(
          LINKED_CHECKOUT_AUTO_SYNC_QUERY,
          { sessionGroupId },
          { requestPolicy: "network-only" },
        )
        .toPromise()
        .then((result) => {
          if (result.error) {
            throw result.error;
          }
          return (result.data as LinkedCheckoutAutoSyncQueryData | undefined) ?? null;
        })
        .catch(() => null)
        .finally(() => {
          fetchesByGroupRef.current.delete(sessionGroupId);
        });

      fetchesByGroupRef.current.set(sessionGroupId, promise);
      return promise;
    };

    const reconcile = async () => {
      if (reconcileInFlightRef.current) return;
      reconcileInFlightRef.current = true;

      try {
        const candidates = Object.entries(useLinkedCheckoutStore.getState().statusByKey)
          .map(([key, status]) => {
            const parsed = parseLinkedCheckoutStoreKey(key);
            if (!parsed || !status?.isAttached || !status.autoSyncEnabled) {
              return null;
            }

            if (
              !status.attachedSessionGroupId ||
              !status.repoId ||
              useLinkedCheckoutStore.getState().pendingByKey[key]
            ) {
              return null;
            }

            return {
              key,
              runtimeInstanceId: parsed.runtimeInstanceId,
              repoId: status.repoId,
              sessionGroupId: status.attachedSessionGroupId,
            };
          })
          .filter(
            (
              candidate,
            ): candidate is {
              key: string;
              runtimeInstanceId: string;
              repoId: string;
              sessionGroupId: string;
            } => candidate !== null,
          );

        await Promise.all(
          candidates.map(async ({ key, runtimeInstanceId, repoId, sessionGroupId }) => {
            const syncState = await fetchGroupSyncState(sessionGroupId);
            if (cancelled || !syncState?.sessionGroupLatestCheckpoint) {
              return;
            }

            const currentStatus = useLinkedCheckoutStore.getState().statusByKey[key];
            if (
              !currentStatus?.isAttached ||
              !currentStatus.autoSyncEnabled ||
              currentStatus.attachedSessionGroupId !== sessionGroupId ||
              useLinkedCheckoutStore.getState().pendingByKey[key]
            ) {
              return;
            }

            const latestCheckpoint = syncState.sessionGroupLatestCheckpoint;
            const targetBranch =
              currentStatus.targetBranch ??
              (typeof syncState.sessionGroup?.branch === "string"
                ? syncState.sessionGroup.branch
                : null);

            if (!targetBranch || latestCheckpoint.repoId !== repoId) {
              return;
            }

            if (
              currentStatus.lastSyncedCommitSha === latestCheckpoint.commitSha ||
              currentStatus.currentCommitSha === latestCheckpoint.commitSha
            ) {
              return;
            }

            scheduleAutoSyncLinkedCheckout({
              repoId,
              sessionGroupId,
              runtimeInstanceId,
              branch: targetBranch,
              commitSha: latestCheckpoint.commitSha,
              autoSyncEnabled: currentStatus.autoSyncEnabled,
              source: "auto",
            });
          }),
        );
      } finally {
        reconcileInFlightRef.current = false;
      }
    };

    void reconcile();

    const interval = window.setInterval(() => {
      void reconcile();
    }, AUTO_SYNC_RECONCILE_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [currentUserId, refreshTick]);
}
