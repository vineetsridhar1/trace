import { create } from "zustand";
import type { MyBridgeSummary, SyncedCheckoutSummary } from "@/hooks/useMyBridges";

export interface AttachedCheckoutInfo {
  bridgeLabel: string;
  bridgeInstanceId: string;
  checkout: SyncedCheckoutSummary;
}

interface BridgesState {
  bridges: MyBridgeSummary[];
  loading: boolean;
  attachedByGroupId: Record<string, AttachedCheckoutInfo>;
  setBridges: (bridges: MyBridgeSummary[]) => void;
  setLoading: (loading: boolean) => void;
}

export const useBridgesStore = create<BridgesState>((set) => ({
  bridges: [],
  loading: false,
  attachedByGroupId: {},
  setBridges: (bridges) => {
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
  setLoading: (loading) => set({ loading }),
}));

export function useBridgeSummaries(): MyBridgeSummary[] {
  return useBridgesStore((s) => s.bridges);
}

export function useAttachedCheckoutForGroup(
  sessionGroupId: string | null | undefined,
): AttachedCheckoutInfo | null {
  return useBridgesStore((s) =>
    sessionGroupId ? (s.attachedByGroupId[sessionGroupId] ?? null) : null,
  );
}
