import { createGqlClient } from "@trace/client-core";
import { useConnectionStore } from "../stores/connection";

const API_URL = import.meta.env.VITE_API_URL ?? "";
const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
const wsBase = API_URL
  ? API_URL.replace(/^https?:/, wsProtocol)
  : `${wsProtocol}//${window.location.host}`;

export const client = createGqlClient({
  httpUrl: `${API_URL}/graphql`,
  wsUrl: `${wsBase}/ws`,
  onConnectionChange: (connected) => {
    useConnectionStore.getState().setConnected(connected);
  },
});
