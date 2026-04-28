import { registerHandler } from "@trace/client-core";
import type { Event } from "@trace/gql";

type BridgeAccessEventListener = (event: Event) => void;

const listeners = new Set<BridgeAccessEventListener>();

function publish(event: Event): void {
  for (const listener of listeners) {
    listener(event);
  }
}

export function subscribeBridgeAccessEvents(listener: BridgeAccessEventListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

registerHandler("bridge_access_requested", publish);
registerHandler("bridge_access_request_resolved", publish);
registerHandler("bridge_access_updated", publish);
registerHandler("bridge_access_revoked", publish);
