import { createClient, fetchExchange, subscriptionExchange } from "@urql/core";
import { createClient as createWSClient } from "graphql-ws";

const API_URL = import.meta.env.VITE_API_URL ?? "";
const wsBase = API_URL
  ? API_URL.replace(/^http/, "ws")
  : `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}`;

const wsClient = createWSClient({
  url: `${wsBase}/ws`,
});

export const client = createClient({
  url: `${API_URL}/graphql`,
  fetchOptions: { credentials: "include" },
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
