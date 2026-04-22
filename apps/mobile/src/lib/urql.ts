import { createGqlClient, type GqlClient } from "@trace/client-core";
import { HTTP_GRAPHQL_URL, WS_GRAPHQL_URL } from "@/lib/env";
import { useConnectionStore } from "@/stores/connection";

function build(): GqlClient {
  return createGqlClient({
    httpUrl: HTTP_GRAPHQL_URL,
    wsUrl: WS_GRAPHQL_URL,
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
  if (previous) {
    void previous.dispose().catch((err) => {
      console.warn("[urql] previous client dispose failed", err);
    });
  }
  return _client;
}
