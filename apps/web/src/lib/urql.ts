import { createGqlClient, type GqlClient } from "@trace/client-core";
import { useConnectionStore } from "../stores/connection";

const API_URL = import.meta.env.VITE_API_URL ?? "";
const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
const wsBase = API_URL
  ? API_URL.replace(/^https?:/, wsProtocol)
  : `${wsProtocol}//${window.location.host}`;

function buildClient(): GqlClient {
  return createGqlClient({
    httpUrl: `${API_URL}/graphql`,
    wsUrl: `${wsBase}/ws`,
    onConnectionChange: (connected) => {
      useConnectionStore.getState().setConnected(connected);
    },
  });
}

export let client = buildClient();

export function recreateClient(): GqlClient {
  const previous = client;
  client = buildClient();
  void previous.dispose().catch((err: unknown) => {
    console.warn("[urql] previous client dispose failed", err);
  });
  return client;
}
