import { create } from "zustand";
import type { BridgeAccessCapability } from "@trace/gql";
import { isCloudMachineRuntimeId } from "@trace/shared";

type BridgeUser = {
  id: string;
  name?: string | null;
  avatarUrl?: string | null;
};

type BridgePendingRequest = {
  id: string;
  scopeType: "all_sessions" | "session_group";
  requestedExpiresAt?: string | null;
  requestedCapabilities?: BridgeAccessCapability[];
  status: "pending" | "approved" | "denied";
  sessionGroup?: { id: string; name?: string | null } | null;
};

export type BridgeRuntimeAccessInfo = {
  runtimeInstanceId: string;
  bridgeRuntimeId?: string | null;
  label?: string | null;
  hostingMode?: "cloud" | "local" | null;
  connected: boolean;
  ownerUser?: BridgeUser | null;
  allowed: boolean;
  isOwner: boolean;
  scopeType?: "all_sessions" | "session_group" | null;
  sessionGroupId?: string | null;
  capabilities?: BridgeAccessCapability[];
  expiresAt?: string | null;
  pendingRequest?: BridgePendingRequest | null;
};

export interface BridgeAccessEntry {
  access: BridgeRuntimeAccessInfo | null;
  loadState: "idle" | "loading" | "loaded" | "failed";
}

interface BridgeAccessState {
  entries: Record<string, BridgeAccessEntry>;
  setEntry: (key: string, entry: BridgeAccessEntry) => void;
  clearEntry: (key: string) => void;
}

export function bridgeAccessStoreKey(
  runtimeInstanceId?: string | null,
  sessionGroupId?: string | null,
): string | null {
  if (!runtimeInstanceId) return null;
  return `${runtimeInstanceId}::${sessionGroupId ?? ""}`;
}

export function buildFallbackBridgeAccess(runtimeInstanceId: string): BridgeRuntimeAccessInfo {
  const hostingMode = isCloudMachineRuntimeId(runtimeInstanceId) ? "cloud" : "local";
  const allowed = hostingMode !== "local";

  return {
    runtimeInstanceId,
    bridgeRuntimeId: null,
    label: null,
    hostingMode,
    connected: false,
    ownerUser: null,
    allowed,
    isOwner: allowed,
    scopeType: null,
    sessionGroupId: null,
    capabilities: allowed ? ["session", "terminal"] : [],
    expiresAt: null,
    pendingRequest: null,
  };
}

export const useBridgeAccessStore = create<BridgeAccessState>((set) => ({
  entries: {},
  setEntry: (key, entry) =>
    set((state) => ({
      entries: {
        ...state.entries,
        [key]: entry,
      },
    })),
  clearEntry: (key) =>
    set((state) => {
      const entries = { ...state.entries };
      delete entries[key];
      return { entries };
    }),
}));
