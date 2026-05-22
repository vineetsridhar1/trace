import { createGqlClient, type GqlClient } from "@trace/client-core";
import { useConnectionStore } from "../stores/connection";

const API_URL = import.meta.env.VITE_API_URL ?? "";
const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
const wsBase = API_URL
  ? API_URL.replace(/^https?:/, wsProtocol)
  : `${wsProtocol}//${window.location.host}`;

function buildClient(revision: number): GqlClient {
  return createGqlClient({
    httpUrl: `${API_URL}/graphql`,
    wsUrl: `${wsBase}/ws`,
    onConnectionChange: (connected) => {
      if (revision !== clientRevision) return;
      useConnectionStore.getState().setConnected(connected);
    },
  });
}

let clientRevision = 0;
export let client = buildClient(clientRevision);
const clientRevisionListeners = new Set<() => void>();

export function getClientRevision(): number {
  return clientRevision;
}

export function subscribeClientRevision(listener: () => void): () => void {
  clientRevisionListeners.add(listener);
  return () => clientRevisionListeners.delete(listener);
}

function notifyClientRevisionListeners(): void {
  for (const listener of clientRevisionListeners) {
    listener();
  }
}

export function recreateClient(): GqlClient {
  const previous = client;
  const nextRevision = clientRevision + 1;
  client = buildClient(nextRevision);
  clientRevision = nextRevision;
  useConnectionStore.getState().setConnected(false);
  notifyClientRevisionListeners();
  void previous.dispose().catch((err: unknown) => {
    console.warn("[urql] previous client dispose failed", err);
  });
  return client;
}
