import { useCallback, useEffect, useState } from "react";
import { client } from "../../lib/urql";
import { BRIDGE_RUNTIME_ACCESS_QUERY } from "../../lib/mutations";

type BridgeUser = {
  id: string;
  name?: string | null;
  avatarUrl?: string | null;
};

type BridgePendingRequest = {
  id: string;
  scopeType: "all_sessions" | "session_group";
  requestedExpiresAt?: string | null;
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
  expiresAt?: string | null;
  pendingRequest?: BridgePendingRequest | null;
};

export function useBridgeRuntimeAccess(
  runtimeInstanceId?: string | null,
  sessionGroupId?: string | null,
) {
  const [access, setAccess] = useState<BridgeRuntimeAccessInfo | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!runtimeInstanceId) {
      setAccess(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const result = await client
        .query(BRIDGE_RUNTIME_ACCESS_QUERY, {
          runtimeInstanceId,
          sessionGroupId: sessionGroupId ?? undefined,
        })
        .toPromise();
      setAccess((result.data?.bridgeRuntimeAccess as BridgeRuntimeAccessInfo | undefined) ?? null);
    } catch {
      setAccess(null);
    } finally {
      setLoading(false);
    }
  }, [runtimeInstanceId, sessionGroupId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { access, loading, refresh };
}
