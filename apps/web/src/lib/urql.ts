import { createGqlClient, type GqlClient } from "@trace/client-core";
import { useConnectionStore } from "../stores/connection";

const API_URL = import.meta.env.VITE_API_URL ?? "";
const browserLocation =
  typeof window !== "undefined" ? window.location : { protocol: "http:", host: "localhost" };
const wsProtocol = browserLocation.protocol === "https:" ? "wss:" : "ws:";
const wsBase = API_URL
  ? API_URL.replace(/^https?:/, wsProtocol)
  : `${wsProtocol}//${browserLocation.host}`;

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
