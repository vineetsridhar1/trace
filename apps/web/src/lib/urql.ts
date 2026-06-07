import { createGqlClient, type GqlClient } from "@trace/client-core";
import { useConnectionStore } from "../stores/connection";

const API_URL = import.meta.env.VITE_API_URL ?? "";
const browserLocation =
  typeof window === "undefined" ? undefined : window.location;
const wsProtocol = browserLocation?.protocol === "https:" ? "wss:" : "ws:";
const wsBase = API_URL
  ? API_URL.replace(/^https?:/, wsProtocol)
  : `${wsProtocol}//${browserLocation?.host ?? "localhost:3000"}`;

function buildClient(): GqlClient {
  return createGqlClient({
    httpUrl: `${API_URL}/graphql`,
    wsUrl: `${wsBase}/ws`,
    onConnectionChange: (connected) => {
      useConnectionStore.getState().setConnected(connected);
    },
  });
}

let currentClient: GqlClient | null = null;

function getClient(): GqlClient {
  currentClient ??= buildClient();
  return currentClient;
}

export const client = new Proxy({} as GqlClient, {
  get(_target, property, receiver) {
    const value = Reflect.get(getClient(), property, receiver);
    return typeof value === "function" ? value.bind(getClient()) : value;
  },
});

export function recreateClient(): GqlClient {
  const previous = currentClient;
  currentClient = buildClient();
  if (previous) {
    void previous.dispose().catch((err: unknown) => {
      console.warn("[urql] previous client dispose failed", err);
    });
  }
  return currentClient;
}
