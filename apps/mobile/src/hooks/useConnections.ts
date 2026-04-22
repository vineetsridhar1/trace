import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { MY_CONNECTIONS_QUERY, useAuthStore, type AuthState } from "@trace/client-core";
import type { BridgeAccessCapability, HostingMode } from "@trace/gql";
import { getClient } from "@/lib/urql";

export interface ConnectionUser {
  id: string;
  name?: string | null;
  email?: string | null;
}

export interface ConnectionAccessRequest {
  id: string;
  scopeType: "all_sessions" | "session_group";
  requestedExpiresAt?: string | null;
  requestedCapabilities?: BridgeAccessCapability[] | null;
  status: "pending" | "approved" | "denied";
  createdAt: string;
  requesterUser: ConnectionUser;
  sessionGroup?: { id: string; name?: string | null } | null;
}

export interface ConnectionAccessGrant {
  id: string;
  scopeType: "all_sessions" | "session_group";
  capabilities?: BridgeAccessCapability[] | null;
  expiresAt?: string | null;
  revokedAt?: string | null;
  createdAt: string;
  granteeUser: ConnectionUser;
  sessionGroup?: { id: string; name?: string | null } | null;
}

export interface ConnectionLinkedCheckout {
  repoId: string;
  isAttached: boolean;
  attachedSessionGroupId?: string | null;
  targetBranch?: string | null;
  autoSyncEnabled: boolean;
  currentBranch?: string | null;
  currentCommitSha?: string | null;
  lastSyncedCommitSha?: string | null;
  lastSyncError?: string | null;
  attachedSessionGroup?: { id: string; name: string; branch?: string | null } | null;
}

export interface ConnectionRepoEntry {
  repo: { id: string; name: string; defaultBranch?: string | null };
  channel: { id: string; name: string; baseBranch?: string | null };
  linkedCheckout?: ConnectionLinkedCheckout | null;
}

export interface ConnectionBridge {
  bridge: {
    id: string;
    instanceId: string;
    label: string;
    hostingMode: HostingMode;
    lastSeenAt: string;
    connected: boolean;
    ownerUser: ConnectionUser;
    accessRequests: ConnectionAccessRequest[];
    accessGrants: ConnectionAccessGrant[];
  };
  repos: ConnectionRepoEntry[];
}

type ConnectionsQueryResult = { myConnections?: ConnectionBridge[] };
const POLL_INTERVAL_MS = 10_000;

export function useConnections(): {
  connections: ConnectionBridge[];
  loading: boolean;
  refresh: () => Promise<void>;
} {
  const userId = useAuthStore((s: AuthState) => s.user?.id);
  const activeOrgId = useAuthStore((s: AuthState) => s.activeOrgId);
  const [connections, setConnections] = useState<ConnectionBridge[]>([]);
  const [loading, setLoading] = useState(false);
  const cancelledRef = useRef(false);

  const fetchOnce = useCallback(
    async (showLoading: boolean) => {
      if (!activeOrgId) return;
      if (showLoading) setLoading(true);
      try {
        const result = await getClient()
          .query<ConnectionsQueryResult>(
            MY_CONNECTIONS_QUERY,
            {},
            { requestPolicy: "network-only" },
          )
          .toPromise();
        if (cancelledRef.current) return;
        if (result.error) {
          console.warn("[useConnections] query failed", result.error);
          return;
        }
        setConnections(result.data?.myConnections ?? []);
      } finally {
        if (!cancelledRef.current && showLoading) setLoading(false);
      }
    },
    [activeOrgId],
  );

  useEffect(() => {
    cancelledRef.current = false;
    if (!userId || !activeOrgId) {
      setConnections([]);
      return () => {
        cancelledRef.current = true;
      };
    }
    void fetchOnce(true);
    const intervalId = setInterval(() => {
      if (AppState.currentState === "active") void fetchOnce(false);
    }, POLL_INTERVAL_MS);
    const appStateSub = AppState.addEventListener("change", (state: AppStateStatus) => {
      if (state === "active") void fetchOnce(false);
    });
    return () => {
      cancelledRef.current = true;
      clearInterval(intervalId);
      appStateSub.remove();
    };
  }, [activeOrgId, fetchOnce, userId]);

  return { connections, loading, refresh: useCallback(() => fetchOnce(false), [fetchOnce]) };
}
