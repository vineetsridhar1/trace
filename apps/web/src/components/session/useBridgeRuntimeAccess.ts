import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { client } from "../../lib/urql";
import { BRIDGE_RUNTIME_ACCESS_QUERY } from "@trace/client-core";
import { useUIStore } from "../../stores/ui";
import { isCloudMachineRuntimeId } from "@trace/shared";
import type { BridgeAccessCapability } from "@trace/gql";

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

function buildFallbackAccess(runtimeInstanceId: string): BridgeRuntimeAccessInfo {
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

export function useBridgeRuntimeAccess(
  runtimeInstanceId?: string | null,
  sessionGroupId?: string | null,
) {
  const [access, setAccess] = useState<BridgeRuntimeAccessInfo | null>(null);
  const [loadState, setLoadState] = useState<"idle" | "loading" | "loaded" | "failed">("idle");
  const requestIdRef = useRef(0);
  const fallbackAccess = useMemo(
    () => (runtimeInstanceId ? buildFallbackAccess(runtimeInstanceId) : null),
    [runtimeInstanceId],
  );

  const refresh = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    if (!runtimeInstanceId) {
      setAccess(null);
      setLoadState("idle");
      return;
    }

    setLoadState("loading");
    try {
      const result = await client
        .query(BRIDGE_RUNTIME_ACCESS_QUERY, {
          runtimeInstanceId,
          sessionGroupId: sessionGroupId ?? undefined,
        })
        .toPromise();
      if (requestId !== requestIdRef.current) return;
      if (result.error) {
        // Keep previous access so a transient failure doesn't flip the UI to locked.
        setLoadState("failed");
        return;
      }
      setAccess((result.data?.bridgeRuntimeAccess as BridgeRuntimeAccessInfo | undefined) ?? null);
      setLoadState("loaded");
    } catch {
      if (requestId !== requestIdRef.current) return;
      setLoadState("failed");
    }
  }, [runtimeInstanceId, sessionGroupId]);

  const refreshTick = useUIStore((s: { refreshTick: number }) => s.refreshTick);
  const lastRuntimeInstanceIdRef = useRef<string | null | undefined>(runtimeInstanceId);

  useEffect(() => {
    if (lastRuntimeInstanceIdRef.current !== runtimeInstanceId) {
      setAccess(null);
      lastRuntimeInstanceIdRef.current = runtimeInstanceId;
    }
    if (!runtimeInstanceId) {
      setLoadState("idle");
      return;
    }
    void refresh();
  }, [refresh, runtimeInstanceId, refreshTick]);

  const effectiveAccess =
    access && access.hostingMode !== null
      ? access
      : loadState === "failed" || loadState === "loaded"
        ? fallbackAccess
        : null;

  return {
    access: effectiveAccess,
    loading: loadState === "loading",
    // True only when the initial fetch failed and no cached access is available.
    // On a later refetch failure we keep the last successful access silently.
    unreachable: loadState === "failed" && access === null,
    refresh,
  };
}
