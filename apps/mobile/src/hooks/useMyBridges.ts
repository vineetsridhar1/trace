import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { MY_BRIDGE_RUNTIMES_FOR_HOME_QUERY } from "@trace/client-core";
import type { HostingMode } from "@trace/gql";
import { getClient } from "@/lib/urql";

export interface SyncedSessionGroupSummary {
  id: string;
  name: string;
  slug?: string | null;
  branch?: string | null;
  channel?: { id: string; name: string } | null;
}

export interface SyncedCheckoutSummary {
  repoId: string;
  repo?: { id: string; name: string } | null;
  branch: string | null;
  currentCommitSha: string | null;
  lastSyncedCommitSha: string | null;
  autoSyncEnabled: boolean;
  sessionGroup: SyncedSessionGroupSummary;
}

export interface MyBridgeSummary {
  id: string;
  instanceId: string;
  label: string;
  hostingMode: HostingMode;
  connected: boolean;
  lastSeenAt: string;
  /** Currently-attached linked checkouts on this bridge — at most one per repo. */
  linkedCheckouts: SyncedCheckoutSummary[];
}

interface BridgesQueryResult {
  myBridgeRuntimes?: Array<{
    id: string;
    instanceId: string;
    label: string;
    hostingMode: HostingMode;
    lastSeenAt: string;
    connected: boolean;
    linkedCheckouts?: Array<{
      repoId: string;
      currentBranch?: string | null;
      currentCommitSha?: string | null;
      lastSyncedCommitSha?: string | null;
      autoSyncEnabled: boolean;
      attachedSessionGroupId?: string | null;
      repo?: { id: string; name: string } | null;
      attachedSessionGroup?: SyncedSessionGroupSummary | null;
    }>;
  }>;
}

const POLL_INTERVAL_MS = 10_000;

/**
 * Polls the user's owned bridges plus the linked-checkout currently attached
 * on each of their repos. The server caches checkout status in-memory and
 * warms it on bridge connect, so this is a single cheap query per poll.
 */
export function useMyBridges(activeOrgId: string | null): {
  bridges: MyBridgeSummary[];
  loading: boolean;
  refresh: () => Promise<void>;
} {
  const [bridges, setBridges] = useState<MyBridgeSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const cancelledRef = useRef(false);

  const fetchOnce = useCallback(
    async (showLoading: boolean): Promise<void> => {
      if (!activeOrgId) return;
      if (showLoading) setLoading(true);
      try {
        const result = await getClient()
          .query<BridgesQueryResult>(
            MY_BRIDGE_RUNTIMES_FOR_HOME_QUERY,
            {},
            { requestPolicy: "network-only" },
          )
          .toPromise();
        if (cancelledRef.current) return;
        if (result.error) {
          console.warn("[useMyBridges] query failed", result.error);
          return;
        }
        setBridges(toBridgeSummaries(result.data?.myBridgeRuntimes ?? []));
      } finally {
        if (!cancelledRef.current && showLoading) setLoading(false);
      }
    },
    [activeOrgId],
  );

  useEffect(() => {
    cancelledRef.current = false;
    if (!activeOrgId) {
      setBridges([]);
      return () => {
        cancelledRef.current = true;
      };
    }

    void fetchOnce(true);
    const intervalId = setInterval(() => {
      if (AppState.currentState === "active") void fetchOnce(false);
    }, POLL_INTERVAL_MS);

    const appStateSub = AppState.addEventListener(
      "change",
      (state: AppStateStatus) => {
        if (state === "active") void fetchOnce(false);
      },
    );

    return () => {
      cancelledRef.current = true;
      clearInterval(intervalId);
      appStateSub.remove();
    };
  }, [activeOrgId, fetchOnce]);

  const refresh = useCallback(() => fetchOnce(false), [fetchOnce]);

  return { bridges, loading, refresh };
}

function toBridgeSummaries(
  bridges: NonNullable<BridgesQueryResult["myBridgeRuntimes"]>,
): MyBridgeSummary[] {
  return bridges.map((bridge) => ({
    id: bridge.id,
    instanceId: bridge.instanceId,
    label: bridge.label,
    hostingMode: bridge.hostingMode,
    connected: bridge.connected,
    lastSeenAt: bridge.lastSeenAt,
    linkedCheckouts: (bridge.linkedCheckouts ?? [])
      .map((checkout): SyncedCheckoutSummary | null => {
        const sessionGroup = checkout.attachedSessionGroup;
        if (!sessionGroup) return null;
        return {
          repoId: checkout.repoId,
          repo: checkout.repo ?? null,
          // Prefer the bridge's actual checked-out branch; fall back to the
          // session group's branch if the bridge hasn't reported it yet
          // (transient state immediately after sync).
          branch: checkout.currentBranch ?? sessionGroup.branch ?? null,
          currentCommitSha: checkout.currentCommitSha ?? null,
          lastSyncedCommitSha: checkout.lastSyncedCommitSha ?? null,
          autoSyncEnabled: checkout.autoSyncEnabled,
          sessionGroup,
        };
      })
      .filter((c): c is SyncedCheckoutSummary => c !== null),
  }));
}
