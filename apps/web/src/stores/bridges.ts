import { create } from "zustand";
import type { MyBridgeSummary, SyncedCheckoutSummary } from "../hooks/useMyBridges";

export interface AttachedCheckoutInfo {
  bridgeLabel: string;
  bridgeInstanceId: string;
  checkout: SyncedCheckoutSummary;
}

interface BridgesState {
  bridges: MyBridgeSummary[];
  /**
   * Linked-checkout attachments keyed by `sessionGroupId`. O(1) lookup for
   * "is this session group currently synced to one of my bridges?"
   */
  attachedByGroupId: Record<string, AttachedCheckoutInfo>;
  setBridges: (bridges: MyBridgeSummary[]) => void;
}

export const useBridgesStore = create<BridgesState>((set) => ({
  bridges: [],
  attachedByGroupId: {},
  setBridges: (bridges: MyBridgeSummary[]) => {
    // Invariant: a session group is bound to exactly one runtime (via
    // `SessionGroup.connection.runtimeInstanceId`), so the same groupId
    // can't legitimately appear in two bridges' linkedCheckouts. If it does
    // (data corruption / race), last-write-wins — which bridge wins is
    // arbitrary, so don't rely on this collision behavior.
    const attachedByGroupId: Record<string, AttachedCheckoutInfo> = {};
    for (const bridge of bridges) {
      if (!bridge.connected) continue;
      for (const checkout of bridge.linkedCheckouts) {
        attachedByGroupId[checkout.sessionGroup.id] = {
          bridgeLabel: bridge.label,
          bridgeInstanceId: bridge.instanceId,
          checkout,
        };
      }
    }
    set({ bridges, attachedByGroupId });
  },
}));

/**
 * Returns the attached-checkout info for a given session group, if it's
 * currently synced on one of the user's connected bridges. Stable identity —
 * only re-renders when the specific group's attachment changes.
 */
export function useAttachedCheckoutForGroup(
  sessionGroupId: string | null | undefined,
): AttachedCheckoutInfo | null {
  return useBridgesStore((s: BridgesState) =>
    sessionGroupId ? (s.attachedByGroupId[sessionGroupId] ?? null) : null,
  );
}

export function usePreferredLinkedCheckoutBridge(
  repoId: string | null | undefined,
  sessionGroupId: string | null | undefined,
): MyBridgeSummary | null {
  return useBridgesStore((s: BridgesState) => {
    const connectedLocalBridges = s.bridges.filter(
      (bridge) => bridge.connected && bridge.hostingMode === "local",
    );
    if (connectedLocalBridges.length === 0) return null;

    if (sessionGroupId) {
      const attached = connectedLocalBridges.find((bridge) =>
        bridge.linkedCheckouts.some((checkout) => checkout.sessionGroup.id === sessionGroupId),
      );
      if (attached) return attached;
    }

    if (repoId) {
      const repoLinked = connectedLocalBridges.find((bridge) =>
        bridge.registeredRepoIds.includes(repoId),
      );
      if (repoLinked) return repoLinked;
    }

    return connectedLocalBridges[0] ?? null;
  });
}
