import { useEffect, useState, useCallback } from "react";
import { gql } from "@urql/core";
import type { Event } from "@trace/gql";
import { client } from "../lib/urql";
import { useEntityStore, useEntityIds } from "../stores/entity";
import { useAuthStore } from "../stores/auth";

const SESSION_EVENTS_QUERY = gql`
  query SessionEvents($organizationId: ID!, $scope: ScopeInput, $limit: Int) {
    events(organizationId: $organizationId, scope: $scope, limit: $limit) {
      id
      scopeType
      scopeId
      eventType
      payload
      actor {
        type
        id
        name
      }
      parentId
      timestamp
      metadata
    }
  }
`;

export function useSessionEvents(sessionId: string) {
  const [loading, setLoading] = useState(true);
  const activeOrgId = useAuthStore((s) => s.activeOrgId);

  // Fetch existing events on mount
  const fetchEvents = useCallback(async () => {
    if (!activeOrgId) return;

    const result = await client
      .query(SESSION_EVENTS_QUERY, {
        organizationId: activeOrgId,
        scope: { type: "session", id: sessionId },
        limit: 500,
      })
      .toPromise();

    if (result.data?.events) {
      const events = result.data.events as Array<Event & { id: string }>;
      useEntityStore.getState().upsertMany("events", events);
    }
    setLoading(false);
  }, [activeOrgId, sessionId]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // Derive eventIds from the entity store — useOrgEvents already upserts
  // all incoming events, so no separate subscription is needed.
  const eventIds = useEntityIds(
    "events",
    (e) => e.scopeType === "session" && e.scopeId === sessionId,
    (a, b) => a.timestamp.localeCompare(b.timestamp),
  );

  return { eventIds, loading };
}
