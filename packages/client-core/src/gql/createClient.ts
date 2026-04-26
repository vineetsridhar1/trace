import {
  createClient as createUrqlClient,
  fetchExchange,
  subscriptionExchange,
  type Client,
} from "@urql/core";
import { createClient as createWSClient } from "graphql-ws";
import { getAuthHeaders, useAuthStore } from "../stores/auth.js";
import { getPlatform, type Platform } from "../platform.js";

export interface CreateGqlClientOptions {
  httpUrl: string;
  wsUrl: string;
  /** Notified when the WebSocket transport connects or disconnects. */
  onConnectionChange?: (connected: boolean) => void;
}

interface GraphqlWsWebSocketImpl {
  new (url: string, protocols?: string | string[]): WebSocket;
  readonly CONNECTING: number;
  readonly OPEN: number;
  readonly CLOSING: number;
  readonly CLOSED: number;
}

function normalizeWebSocketProtocols(protocols?: string | string[]): string[] | undefined {
  if (!protocols) return undefined;
  return Array.isArray(protocols) ? protocols : [protocols];
}

function createPlatformWebSocketImpl(platform: Platform): GraphqlWsWebSocketImpl {
  function PlatformWebSocket(this: unknown, url: string, protocols?: string | string[]): WebSocket {
    return platform.createWebSocket(url, normalizeWebSocketProtocols(protocols));
  }

  return Object.assign(PlatformWebSocket, {
    CONNECTING: 0,
    OPEN: 1,
    CLOSING: 2,
    CLOSED: 3,
  }) as unknown as GraphqlWsWebSocketImpl;
}

/** A urql `Client` augmented with a `dispose()` that closes the underlying graphql-ws transport. */
export type GqlClient = Client & { dispose: () => Promise<void> };

/**
 * Build a urql `Client` configured for the Trace platform: cache disabled
 * (Zustand owns state), graphql-ws WebSocket transport with retry, and auth
 * headers injected per request. The returned client carries a `dispose()`
 * method that closes the WebSocket — call it when tearing down the client
 * (e.g. on org switch) so the socket isn't left dangling for GC.
 */
export function createGqlClient(options: CreateGqlClientOptions): GqlClient {
  const platform = getPlatform();
  const usesBearerAuth = platform.authMode === "bearer";

  const wsClient = createWSClient({
    url: options.wsUrl,
    webSocketImpl: createPlatformWebSocketImpl(platform),
    connectionParams: () => {
      const { token, activeOrgId } = useAuthStore.getState();
      return {
        ...(usesBearerAuth && token ? { token } : {}),
        ...(activeOrgId ? { organizationId: activeOrgId } : {}),
      };
    },
    shouldRetry: () => true,
    retryAttempts: Infinity,
    retryWait: async (retries: number) => {
      const delay = Math.min(1000 * 2 ** retries, 30_000);
      await new Promise((resolve) => setTimeout(resolve, delay));
    },
    on: {
      connected: () => {
        options.onConnectionChange?.(true);
      },
      closed: () => {
        options.onConnectionChange?.(false);
      },
      error: (error: unknown) => {
        console.debug("[ws] error", error);
      },
    },
  });

  const client = createUrqlClient({
    url: options.httpUrl,
    fetch: platform.fetch,
    fetchOptions: () => ({
      credentials: "include" as const,
      headers: getAuthHeaders(),
    }),
    exchanges: [
      fetchExchange,
      subscriptionExchange({
        forwardSubscription(request: { query: unknown }) {
          const input = { ...request, query: request.query || "" };
          return {
            subscribe(sink: {
              next: (value: unknown) => void;
              error: (error: unknown) => void;
              complete: () => void;
            }) {
              const unsubscribe = wsClient.subscribe(input, sink);
              return { unsubscribe };
            },
          };
        },
      }),
    ],
  });

  return Object.assign(client, {
    dispose: async () => {
      await wsClient.dispose();
    },
  });
}
