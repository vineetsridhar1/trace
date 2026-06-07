import { useEffect } from "react";
import { create } from "zustand";
import type { MyBridgeSummary, SyncedCheckoutSummary } from "../hooks/useMyBridges";

export interface AttachedCheckoutInfo {
  bridgeLabel: string;
  bridgeInstanceId: string;
  checkout: SyncedCheckoutSummary;
}

export interface BridgesState {
  bridges: MyBridgeSummary[];
  desktopBridgeInfo: DesktopBridgeInfo | null | undefined;
  /**
   * Linked-checkout attachments keyed by `sessionGroupId`. O(1) lookup for
   * "is this session group currently synced to one of my bridges?"
   */
  attachedByGroupId: Record<string, AttachedCheckoutInfo>;
  attachedListByGroupId: Record<string, AttachedCheckoutInfo[]>;
  setBridges: (bridges: MyBridgeSummary[]) => void;
  loadDesktopBridgeInfo: () => Promise<void>;
}

const EMPTY_ATTACHED_CHECKOUTS: AttachedCheckoutInfo[] = [];
let desktopBridgeInfoLoad: Promise<void> | null = null;

function canReadDesktopBridgeInfo(): boolean {
  return typeof window !== "undefined" && typeof window.trace?.getBridgeInfo === "function";
}

export const useBridgesStore = create<BridgesState>((set) => ({
  bridges: [],
  desktopBridgeInfo: undefined,
  attachedByGroupId: {},
  attachedListByGroupId: {},
  setBridges: (bridges: MyBridgeSummary[]) => {
    // Invariant: a session group is bound to exactly one runtime (via
    // `SessionGroup.connection.runtimeInstanceId`), so the same groupId
    // can't legitimately appear in two bridges' linkedCheckouts. If it does
    // (data corruption / race), last-write-wins — which bridge wins is
    // arbitrary, so don't rely on this collision behavior.
    const attachedByGroupId: Record<string, AttachedCheckoutInfo> = {};
    const attachedListByGroupId: Record<string, AttachedCheckoutInfo[]> = {};
    for (const bridge of bridges) {
      if (!bridge.connected) continue;
      for (const checkout of bridge.linkedCheckouts) {
        const attached: AttachedCheckoutInfo = {
          bridgeLabel: bridge.label,
          bridgeInstanceId: bridge.instanceId,
          checkout,
        };
        attachedByGroupId[checkout.sessionGroup.id] = attached;
        attachedListByGroupId[checkout.sessionGroup.id] = [
          ...(attachedListByGroupId[checkout.sessionGroup.id] ?? []),
          attached,
        ];
      }
    }
    set({ bridges, attachedByGroupId, attachedListByGroupId });
  },
  loadDesktopBridgeInfo: () => {
    if (!canReadDesktopBridgeInfo()) {
      set({ desktopBridgeInfo: null });
      return Promise.resolve();
    }
    if (desktopBridgeInfoLoad) return desktopBridgeInfoLoad;
    desktopBridgeInfoLoad = window.trace!.getBridgeInfo()
      .then((info) => {
        set({ desktopBridgeInfo: info ?? null });
      })
      .catch(() => {
        set({ desktopBridgeInfo: null });
      })
      .finally(() => {
        desktopBridgeInfoLoad = null;
      });
    return desktopBridgeInfoLoad;
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

export function useAttachedCheckoutsForGroup(
  sessionGroupId: string | null | undefined,
): AttachedCheckoutInfo[] {
  return useBridgesStore((s: BridgesState) =>
    sessionGroupId
      ? (s.attachedListByGroupId[sessionGroupId] ?? EMPTY_ATTACHED_CHECKOUTS)
      : EMPTY_ATTACHED_CHECKOUTS,
  );
}

export function useDesktopBridgeInfo(): DesktopBridgeInfo | null | undefined {
  const desktopBridgeInfo = useBridgesStore((s: BridgesState) => s.desktopBridgeInfo);
  const loadDesktopBridgeInfo = useBridgesStore((s: BridgesState) => s.loadDesktopBridgeInfo);

  useEffect(() => {
    if (desktopBridgeInfo !== undefined) return;
    void loadDesktopBridgeInfo();
  }, [desktopBridgeInfo, loadDesktopBridgeInfo]);

  return desktopBridgeInfo;
}
