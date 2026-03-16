import { useEffect, useState, useCallback, useRef } from "react";
import { gql } from "@urql/core";
import type { Event } from "@trace/gql";
import { client } from "../lib/urql";
import { useEntityStore, useEntityIds } from "../stores/entity";
import { useAuthStore } from "../stores/auth";

const PAGE_SIZE = 100;

const SESSION_EVENTS_QUERY = gql`
  query SessionEvents($organizationId: ID!, $scope: ScopeInput, $limit: Int, $before: DateTime) {
    events(organizationId: $organizationId, scope: $scope, limit: $limit, before: $before) {
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
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasOlder, setHasOlder] = useState(true);
  const activeOrgId = useAuthStore((s) => s.activeOrgId);
  const oldestTimestampRef = useRef<string | null>(null);

  // Fetch the most recent page of events on mount
  const fetchEvents = useCallback(async () => {
    if (!activeOrgId) return;

    const result = await client
      .query(SESSION_EVENTS_QUERY, {
        organizationId: activeOrgId,
        scope: { type: "session", id: sessionId },
        limit: PAGE_SIZE,
        before: new Date().toISOString(),
      })
      .toPromise();

    if (result.data?.events) {
      const events = result.data.events as Array<Event & { id: string }>;
      useEntityStore.getState().upsertMany("events", events);

      if (events.length < PAGE_SIZE) {
        setHasOlder(false);
      }
      if (events.length > 0) {
        oldestTimestampRef.current = events[0].timestamp;
      }
    }
    setLoading(false);
  }, [activeOrgId, sessionId]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // Load an older page of events (called when user scrolls to top)
  const fetchOlderEvents = useCallback(async () => {
    if (!activeOrgId || !oldestTimestampRef.current || loadingOlder || !hasOlder) {
      return;
    }

    setLoadingOlder(true);

    const result = await client
      .query(SESSION_EVENTS_QUERY, {
        organizationId: activeOrgId,
        scope: { type: "session", id: sessionId },
        limit: PAGE_SIZE,
        before: oldestTimestampRef.current,
      })
      .toPromise();

    if (result.data?.events) {
      const events = result.data.events as Array<Event & { id: string }>;
      useEntityStore.getState().upsertMany("events", events);

      if (events.length < PAGE_SIZE) {
        setHasOlder(false);
      }
      if (events.length > 0) {
        oldestTimestampRef.current = events[0].timestamp;
      }
    }
    setLoadingOlder(false);
  }, [activeOrgId, sessionId, loadingOlder, hasOlder]);

  // Derive eventIds from the entity store — useOrgEvents already upserts
  // all incoming events, so no separate subscription is needed.
  const eventIds = useEntityIds(
    "events",
    (e) => e.scopeType === "session" && e.scopeId === sessionId,
    (a, b) => a.timestamp.localeCompare(b.timestamp),
  );

  return { eventIds, loading, loadingOlder, hasOlder, fetchOlderEvents };
}
