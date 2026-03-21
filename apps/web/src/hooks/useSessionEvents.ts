import { useEffect, useState, useCallback, useRef } from "react";
import { gql } from "@urql/core";
import type { Event } from "@trace/gql";
import { client } from "../lib/urql";
import { useEntityStore, useScopedEventIds, eventScopeKey } from "../stores/entity";
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
        avatarUrl
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
  const [error, setError] = useState<string | null>(null);
  const activeOrgId = useAuthStore((s) => s.activeOrgId);
  const oldestTimestampRef = useRef<string | null>(null);
  const loadingOlderRef = useRef(false);
  const hasOlderRef = useRef(true);

  // Fetch the most recent page of events on mount
  const fetchEvents = useCallback(async () => {
    if (!activeOrgId) return;

    setError(null);
    const result = await client
      .query(SESSION_EVENTS_QUERY, {
        organizationId: activeOrgId,
        scope: { type: "session", id: sessionId },
        limit: PAGE_SIZE,
        before: new Date().toISOString(),
      })
      .toPromise();

    if (result.error) {
      setError(result.error.message);
      setLoading(false);
      return;
    }

    if (result.data?.events) {
      const events = result.data.events as Array<Event & { id: string }>;
      const scopeKey = eventScopeKey("session", sessionId);
      useEntityStore.getState().upsertManyScopedEvents(scopeKey, events);

      if (events.length < PAGE_SIZE) {
        setHasOlder(false);
        hasOlderRef.current = false;
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
    if (!activeOrgId || !oldestTimestampRef.current || loadingOlderRef.current || !hasOlderRef.current) {
      return;
    }

    loadingOlderRef.current = true;
    setLoadingOlder(true);

    const result = await client
      .query(SESSION_EVENTS_QUERY, {
        organizationId: activeOrgId,
        scope: { type: "session", id: sessionId },
        limit: PAGE_SIZE,
        before: oldestTimestampRef.current,
      })
      .toPromise();

    if (result.error) {
      loadingOlderRef.current = false;
      setLoadingOlder(false);
      return;
    }

    if (result.data?.events) {
      const events = result.data.events as Array<Event & { id: string }>;
      const scopeKey = eventScopeKey("session", sessionId);
      useEntityStore.getState().upsertManyScopedEvents(scopeKey, events);

      if (events.length < PAGE_SIZE) {
        setHasOlder(false);
        hasOlderRef.current = false;
      }
      if (events.length > 0) {
        oldestTimestampRef.current = events[0].timestamp;
      }
    }
    loadingOlderRef.current = false;
    setLoadingOlder(false);
  }, [activeOrgId, sessionId]);

  // Derive eventIds from the scoped bucket — O(session events) not O(all events)
  const scopeKey = eventScopeKey("session", sessionId);
  const eventIds = useScopedEventIds(
    scopeKey,
    (a, b) => a.timestamp.localeCompare(b.timestamp),
  );

  return { eventIds, loading, loadingOlder, hasOlder, error, fetchOlderEvents };
}
