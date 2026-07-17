import { createGqlClient, type GqlClient } from "@trace/client-core";
import { create } from "zustand";
import { getGraphqlUrls } from "@/lib/connection-target";
import { useConnectionStore } from "@/stores/connection";

interface GqlClientState {
  generation: number;
  incrementGeneration: () => void;
}

const useGqlClientStore = create<GqlClientState>((set) => ({
  generation: 0,
  incrementGeneration: () => set((state) => ({ generation: state.generation + 1 })),
}));

/** Re-renders subscription hooks whenever the shared client is replaced. */
export function useGqlClientGeneration(): number {
  return useGqlClientStore((state) => state.generation);
}

function build(): GqlClient {
  const { httpUrl, wsUrl } = getGraphqlUrls();
  return createGqlClient({
    httpUrl,
    wsUrl,
    onConnectionChange: (connected: boolean) => {
      useConnectionStore.getState().setConnected(connected);
    },
  });
}

// Lazy: defer client construction until first use so that the platform
// adapter (set by `index.js`) is registered before `getPlatform()` runs
// inside `createGqlClient`.
let _client: GqlClient | null = null;

export function getClient(): GqlClient {
  if (!_client) _client = build();
  return _client;
}

/**
 * Dispose the current client and build a fresh one. Used after org-switch so
 * the WS handshake resends `X-Organization-Id` and the entity store can
 * rebuild against the new org cleanly. Callers must trigger a re-render
 * (e.g. by changing `activeOrgId`) so consumers re-pull `getClient()`.
 */
export function recreateClient(): GqlClient {
  const previous = _client;
  _client = build();
  useGqlClientStore.getState().incrementGeneration();
  if (previous) {
    void previous.dispose().catch((err) => {
      console.warn("[urql] previous client dispose failed", err);
    });
  }
  return _client;
}
