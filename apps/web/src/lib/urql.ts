import { createClient, fetchExchange, subscriptionExchange } from "@urql/core";
import { createClient as createWSClient } from "graphql-ws";
import { getAuthHeaders, useAuthStore } from "@trace/client-core";
import { useConnectionStore } from "../stores/connection";

const API_URL = import.meta.env.VITE_API_URL ?? "";
const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
const wsBase = API_URL
  ? API_URL.replace(/^https?:/, wsProtocol)
  : `${wsProtocol}//${window.location.host}`;

const wsClient = createWSClient({
  url: `${wsBase}/ws`,
  connectionParams: () => {
    const { token, activeOrgId } = useAuthStore.getState();
    return {
      ...(token ? { token } : {}),
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
      console.debug("[ws] connected");
      useConnectionStore.getState().setConnected(true);
    },
    closed: (event: unknown) => {
      console.debug("[ws] closed", event);
      useConnectionStore.getState().setConnected(false);
    },
    error: (error: unknown) => {
      console.debug("[ws] error", error);
    },
  },
});

// When the app regains visibility, verify the socket is still alive.
// The graphql-ws client exposes a `dispose` method but no direct readiness check,
// so we rely on the `connected`/`closed` callbacks above as the source of truth.
// Previously this handler forced `setConnected(false)`, which broke desktop/Electron
// because the socket stays open when the window loses focus — the `connected` callback
// never re-fires, leaving the badge permanently red.
// Now we do nothing here; the wsClient's own lifecycle callbacks keep the store accurate.

export const client = createClient({
  url: `${API_URL}/graphql`,
  fetchOptions: () => ({
    credentials: "include" as const,
    headers: getAuthHeaders(),
  }),
  exchanges: [
    fetchExchange,
    subscriptionExchange({
      forwardSubscription(request) {
        const input = { ...request, query: request.query || "" };
        return {
          subscribe(sink: { next: (value: unknown) => void; error: (error: unknown) => void; complete: () => void }) {
            const unsubscribe = wsClient.subscribe(input, sink);
            return { unsubscribe };
          },
        };
      },
    }),
  ],
});
