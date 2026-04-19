import { createGqlClient } from "@trace/client-core";
import type { Client } from "@urql/core";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "";
const wsBase = API_URL.replace(/^https?:/, API_URL.startsWith("https") ? "wss:" : "ws:");

function build(): Client {
  return createGqlClient({
    httpUrl: `${API_URL}/graphql`,
    wsUrl: `${wsBase}/ws`,
  });
}

// Lazy: defer client construction until first use so that the platform
// adapter (set by `app/_layout.tsx`) is registered before `getPlatform()`
// runs inside `createGqlClient`.
let _client: Client | null = null;
let _epoch = 0;
const listeners = new Set<() => void>();

export function getClient(): Client {
  if (!_client) _client = build();
  return _client;
}

export function getClientEpoch(): number {
  return _epoch;
}

export function subscribeClientEpoch(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/**
 * Dispose the current client and build a fresh one. Used after org-switch so
 * the WS handshake resends `X-Organization-Id` and the entity store can
 * rebuild against the new org cleanly.
 */
export function recreateClient(): Client {
  _client = build();
  _epoch++;
  for (const cb of listeners) cb();
  return _client;
}
