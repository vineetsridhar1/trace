import { createClient, fetchExchange, subscriptionExchange } from "@urql/core";
import { createClient as createWSClient } from "graphql-ws";
import { getAuthHeaders } from "../stores/auth";

const API_URL = import.meta.env.VITE_API_URL ?? "";
const wsBase = API_URL
  ? API_URL.replace(/^http/, "ws")
  : `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}`;

const wsClient = createWSClient({
  url: `${wsBase}/ws`,
  connectionParams: () => {
    const token = localStorage.getItem("trace_token");
    return token ? { token } : {};
  },
  retryAttempts: Infinity,
  retryWait: async (retries) => {
    const delay = Math.min(1000 * 2 ** retries, 30_000);
    await new Promise((resolve) => setTimeout(resolve, delay));
  },
});

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
          subscribe(sink) {
            const unsubscribe = wsClient.subscribe(input, sink);
            return { unsubscribe };
          },
        };
      },
    }),
  ],
});
