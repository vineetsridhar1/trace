import { useEffect, useState, useCallback, useRef } from "react";
import { gql } from "@urql/core";
import type { Event } from "@trace/gql";
import { client } from "../lib/urql";
import { useEntityStore, useScopedEventIds, eventScopeKey } from "../stores/entity";
import { useAuthStore } from "../stores/auth";
import { SESSION_INVISIBLE_PAYLOAD_TYPES } from "../lib/session-constants";

const PAGE_SIZE = 100;

const SESSION_EVENTS_QUERY = gql`
  query SessionEvents($organizationId: ID!, $scope: ScopeInput, $limit: Int, $before: DateTime, $excludePayloadTypes: [String!]) {
    events(organizationId: $organizationId, scope: $scope, limit: $limit, before: $before, excludePayloadTypes: $excludePayloadTypes) {
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

const SESSION_EVENTS_SUBSCRIPTION = gql`
  subscription SessionEventsLive($sessionId: ID!, $organizationId: ID!) {
    sessionEvents(sessionId: $sessionId, organizationId: $organizationId) {
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
  const scopeKey = eventScopeKey("session", sessionId);

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
        excludePayloadTypes: SESSION_INVISIBLE_PAYLOAD_TYPES,
      })
      .toPromise();

    if (result.error) {
      setError(result.error.message);
      setLoading(false);
      return;
    }

    if (result.data?.events) {
      const events = result.data.events as Array<Event & { id: string }>;
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
  }, [activeOrgId, sessionId, scopeKey]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // Subscribe to session-scoped events for full payloads.
  // The org-wide subscription trims session_output payloads to metadata only;
  // this subscription delivers full content for the session being viewed.
  // Note: this subscription does NOT filter by payload type — invisible events
  // are upserted into the store and filtered out client-side in buildSessionNodes().
  // This keeps the subscription simple and ensures we don't miss events if the
  // invisible list changes without a subscription reconnect.
  useEffect(() => {
    if (!activeOrgId) return;

    const subscription = client
      .subscription(SESSION_EVENTS_SUBSCRIPTION, {
        sessionId,
        organizationId: activeOrgId,
      })
      .subscribe((result) => {
        if (!result.data?.sessionEvents) return;
        const event = result.data.sessionEvents as Event & { id: string };
        useEntityStore.getState().upsertScopedEvent(scopeKey, event.id, event);
      });

    return () => subscription.unsubscribe();
  }, [activeOrgId, sessionId, scopeKey]);

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
        excludePayloadTypes: SESSION_INVISIBLE_PAYLOAD_TYPES,
      })
      .toPromise();

    if (result.error) {
      loadingOlderRef.current = false;
      setLoadingOlder(false);
      return;
    }

    if (result.data?.events) {
      const events = result.data.events as Array<Event & { id: string }>;
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
  }, [activeOrgId, sessionId, scopeKey]);

  // Derive eventIds from the scoped bucket — O(session events) not O(all events)
  const eventIds = useScopedEventIds(
    scopeKey,
    (a, b) => a.timestamp.localeCompare(b.timestamp),
  );

  return { eventIds, loading, loadingOlder, hasOlder, error, fetchOlderEvents };
}
