import { useCallback, useEffect, useRef, useState } from "react";
import { MY_CONNECTIONS_QUERY, useAuthStore } from "@trace/client-core";
import type { BridgeAccessCapability, HostingMode } from "@trace/gql";
import { client } from "../lib/urql";

export interface ConnectionRunScript {
  name: string;
  command: string;
}

export interface ConnectionSessionGroup {
  id: string;
  name: string;
  slug?: string | null;
  branch?: string | null;
  channel?: { id: string; name: string } | null;
}

export interface ConnectionLinkedCheckout {
  repoId: string;
  repoPath?: string | null;
  isAttached: boolean;
  attachedSessionGroupId?: string | null;
  attachedSessionGroup?: ConnectionSessionGroup | null;
  targetBranch?: string | null;
  autoSyncEnabled: boolean;
  currentBranch?: string | null;
  currentCommitSha?: string | null;
  lastSyncedCommitSha?: string | null;
  lastSyncError?: string | null;
  restoreBranch?: string | null;
  restoreCommitSha?: string | null;
}

export interface ConnectionRepoEntry {
  repo: { id: string; name: string; defaultBranch?: string | null };
  channel: { id: string; name: string; baseBranch?: string | null };
  runScripts?: unknown;
  linkedCheckout?: ConnectionLinkedCheckout | null;
}

interface BridgeUser {
  id: string;
  name?: string | null;
  email?: string | null;
}

export interface ConnectionBridge {
  bridge: {
    id: string;
    instanceId: string;
    label: string;
    hostingMode: HostingMode;
    lastSeenAt: string;
    connected: boolean;
    ownerUser: BridgeUser;
    accessRequests: Array<{ id: string }>;
    accessGrants: Array<{ id: string; capabilities?: BridgeAccessCapability[] | null }>;
  };
  repos: ConnectionRepoEntry[];
  canTerminal: boolean;
}

interface ConnectionsQueryResult {
  myConnections?: ConnectionBridge[];
}

const POLL_INTERVAL_MS = 10_000;

export function useConnections(): {
  connections: ConnectionBridge[];
  loading: boolean;
  refresh: () => Promise<void>;
} {
  const userId = useAuthStore((s) => s.user?.id);
  const activeOrgId = useAuthStore((s) => s.activeOrgId);
  const [connections, setConnections] = useState<ConnectionBridge[]>([]);
  const [loading, setLoading] = useState(false);
  const cancelledRef = useRef(false);

  const fetchOnce = useCallback(
    async (showLoading: boolean) => {
      if (!activeOrgId) return;
      if (showLoading) setLoading(true);
      try {
        const result = await client
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
      if (!document.hidden) void fetchOnce(false);
    }, POLL_INTERVAL_MS);
    const onVisible = () => {
      if (!document.hidden) void fetchOnce(false);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelledRef.current = true;
      clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [activeOrgId, fetchOnce, userId]);

  return { connections, loading, refresh: useCallback(() => fetchOnce(false), [fetchOnce]) };
}

export function parseRunScripts(value: unknown): ConnectionRunScript[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is ConnectionRunScript => {
    if (!item || typeof item !== "object") return false;
    const candidate = item as { name?: unknown; command?: unknown };
    return typeof candidate.name === "string" && typeof candidate.command === "string";
  });
}
