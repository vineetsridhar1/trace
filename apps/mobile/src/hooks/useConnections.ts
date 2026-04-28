import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { MY_CONNECTIONS_QUERY, useAuthStore, type AuthState } from "@trace/client-core";
import type {
  BridgeAccessCapability,
  Channel,
  HostingMode,
  LinkedCheckoutStatus,
  Repo,
  SessionGroup,
} from "@trace/gql";
import { userFacingError } from "@/lib/requestError";
import { getClient } from "@/lib/urql";
import { subscribeBridgeAccessEvents } from "@/lib/bridge-access-events";

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

type ConnectionAttachedSessionGroup = Pick<SessionGroup, "id" | "name" | "branch">;

export type ConnectionLinkedCheckout = Pick<
  LinkedCheckoutStatus,
  | "repoId"
  | "isAttached"
  | "attachedSessionGroupId"
  | "targetBranch"
  | "autoSyncEnabled"
  | "hasUncommittedChanges"
  | "currentBranch"
  | "currentCommitSha"
  | "lastSyncedCommitSha"
  | "lastSyncError"
> & {
  attachedSessionGroup?: ConnectionAttachedSessionGroup | null;
};

export interface ConnectionRepoEntry {
  repo: Pick<Repo, "id" | "name" | "defaultBranch">;
  channel: Pick<Channel, "id" | "name" | "baseBranch">;
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
  error: string | null;
  refresh: () => Promise<void>;
} {
  const userId = useAuthStore((s: AuthState) => s.user?.id);
  const activeOrgId = useAuthStore((s: AuthState) => s.activeOrgId);
  const [connections, setConnections] = useState<ConnectionBridge[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
          setError(userFacingError(result.error, "Couldn't load bridges."));
          return;
        }
        setError(null);
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
      setError(null);
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

  useEffect(() => {
    if (!userId || !activeOrgId) return;
    return subscribeBridgeAccessEvents(() => {
      if (AppState.currentState === "active") void fetchOnce(false);
    });
  }, [activeOrgId, fetchOnce, userId]);

  return {
    connections,
    loading,
    error,
    refresh: useCallback(() => fetchOnce(false), [fetchOnce]),
  };
}
