import { useMemo } from "react";
import {
  buildSessionNodes,
  eventScopeKey,
  useScopedEventIds,
  useScopedEvents,
  type SessionNode,
} from "@trace/client-core";

export interface UseSessionNodesResult {
  nodes: SessionNode[];
}

/**
 * Derive the renderable SessionNode[] for a session from its scoped events,
 * identical to web's node model so ticket 21's renderers match their web
 * counterparts. The node builder is a pure function shared via client-core.
 */
export function useSessionNodes(sessionId: string): UseSessionNodesResult {
  const scopeKey = eventScopeKey("session", sessionId);
  const eventIds = useScopedEventIds(scopeKey, (a, b) => a.timestamp.localeCompare(b.timestamp));
  const events = useScopedEvents(scopeKey);
  return useMemo(() => {
    const { nodes } = buildSessionNodes(eventIds, events);
    return { nodes };
  }, [eventIds, events]);
}
