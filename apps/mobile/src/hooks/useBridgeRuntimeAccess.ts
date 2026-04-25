import { useCallback, useEffect } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { BRIDGE_RUNTIME_ACCESS_QUERY } from "@trace/client-core";
import { useConnectionStore } from "@/stores/connection";
import {
  buildFallbackBridgeAccess,
  bridgeAccessStoreKey,
  type BridgeRuntimeAccessInfo,
  useBridgeAccessStore,
} from "@/stores/bridge-access";
import { getClient } from "@/lib/urql";

const POLL_INTERVAL_MS = 10_000;
const inflightRefreshes = new Map<string, Promise<void>>();
const pollSubscriptions = new Map<
  string,
  {
    refCount: number;
    stop: () => void;
  }
>();

export function isBridgeInteractionAllowed(access: BridgeRuntimeAccessInfo | null): boolean {
  if (!access) return true;
  if (access.hostingMode !== "local") return true;
  if (access.allowed || access.isOwner) return true;
  return false;
}

async function fetchBridgeRuntimeAccess(
  key: string,
  runtimeInstanceId: string,
  sessionGroupId?: string | null,
): Promise<void> {
  const existing = inflightRefreshes.get(key);
  if (existing) return existing;

  useBridgeAccessStore.getState().setEntry(key, {
    access: useBridgeAccessStore.getState().entries[key]?.access ?? null,
    loadState: "loading",
  });

  const promise = getClient()
    .query(BRIDGE_RUNTIME_ACCESS_QUERY, {
      runtimeInstanceId,
      sessionGroupId: sessionGroupId ?? undefined,
    })
    .toPromise()
    .then((result) => {
      if (result.error) {
        useBridgeAccessStore.getState().setEntry(key, {
          access: useBridgeAccessStore.getState().entries[key]?.access ?? null,
          loadState: "failed",
        });
        return;
      }

      useBridgeAccessStore.getState().setEntry(key, {
        access: (result.data?.bridgeRuntimeAccess as BridgeRuntimeAccessInfo | undefined) ?? null,
        loadState: "loaded",
      });
    })
    .catch(() => {
      useBridgeAccessStore.getState().setEntry(key, {
        access: useBridgeAccessStore.getState().entries[key]?.access ?? null,
        loadState: "failed",
      });
    })
    .finally(() => {
      inflightRefreshes.delete(key);
    });

  inflightRefreshes.set(key, promise);
  return promise;
}

function retainBridgeAccessPolling(
  key: string,
  runtimeInstanceId: string,
  sessionGroupId?: string | null,
) {
  const existing = pollSubscriptions.get(key);
  if (existing) {
    existing.refCount += 1;
    return () => releaseBridgeAccessPolling(key);
  }

  const refresh = () => {
    if (AppState.currentState === "active") {
      void fetchBridgeRuntimeAccess(key, runtimeInstanceId, sessionGroupId);
    }
  };
  const intervalId = setInterval(refresh, POLL_INTERVAL_MS);
  const appStateSub = AppState.addEventListener("change", (state: AppStateStatus) => {
    if (state === "active") {
      void fetchBridgeRuntimeAccess(key, runtimeInstanceId, sessionGroupId);
    }
  });

  pollSubscriptions.set(key, {
    refCount: 1,
    stop: () => {
      clearInterval(intervalId);
      appStateSub.remove();
    },
  });

  return () => releaseBridgeAccessPolling(key);
}

function releaseBridgeAccessPolling(key: string) {
  const existing = pollSubscriptions.get(key);
  if (!existing) return;
  if (existing.refCount > 1) {
    existing.refCount -= 1;
    return;
  }
  existing.stop();
  pollSubscriptions.delete(key);
}

export function useBridgeRuntimeAccess(
  runtimeInstanceId?: string | null,
  sessionGroupId?: string | null,
) {
  const key = bridgeAccessStoreKey(runtimeInstanceId, sessionGroupId);
  const entry = useBridgeAccessStore((state) =>
    key
      ? (state.entries[key] ?? {
          access: null,
          loadState: "idle",
        })
      : { access: null, loadState: "idle" },
  );
  const reconnectCounter = useConnectionStore((s) => s.reconnectCounter);

  const refresh = useCallback(async () => {
    if (!runtimeInstanceId || !key) return;
    await fetchBridgeRuntimeAccess(key, runtimeInstanceId, sessionGroupId);
  }, [key, runtimeInstanceId, sessionGroupId]);

  useEffect(() => {
    if (!runtimeInstanceId || !key) return;
    if (entry.loadState === "idle") {
      void refresh();
    }
  }, [entry.loadState, key, refresh, runtimeInstanceId]);

  useEffect(() => {
    if (!runtimeInstanceId || !key) return;
    return retainBridgeAccessPolling(key, runtimeInstanceId, sessionGroupId);
  }, [key, runtimeInstanceId, sessionGroupId]);

  useEffect(() => {
    if (!runtimeInstanceId || reconnectCounter === 0) return;
    void refresh();
  }, [reconnectCounter, refresh, runtimeInstanceId]);

  const fallbackAccess = runtimeInstanceId ? buildFallbackBridgeAccess(runtimeInstanceId) : null;
  const effectiveAccess =
    entry.access && entry.access.hostingMode !== null
      ? entry.access
      : entry.loadState === "failed" || entry.loadState === "loaded"
        ? fallbackAccess
        : null;

  return {
    access: effectiveAccess,
    loading: entry.loadState === "loading",
    unreachable: entry.loadState === "failed" && entry.access === null,
    refresh,
  };
}
