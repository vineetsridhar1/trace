import { useEffect, useState, useCallback, useRef } from "react";
import { gql } from "@urql/core";
import type { Event } from "@trace/gql";
import { client } from "../lib/urql";
import { useEntityStore } from "../stores/entity";
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
      }
      parentId
      timestamp
      metadata
    }
  }
`;

const SESSION_EVENTS_SUBSCRIPTION = gql`
  subscription SessionEvents($sessionId: ID!, $organizationId: ID!) {
    sessionEvents(sessionId: $sessionId, organizationId: $organizationId) {
      id
      scopeType
      scopeId
      eventType
      payload
      actor {
        type
        id
      }
      parentId
      timestamp
      metadata
    }
  }
`;

export function useSessionEvents(sessionId: string) {
  const [eventIds, setEventIds] = useState<string[]>([]);
  const seenRef = useRef(new Set<string>());
  const [loading, setLoading] = useState(true);
  const activeOrgId = useAuthStore((s) => s.activeOrgId);

  // Fetch existing events
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
      const ids = events.map((e) => e.id);
      seenRef.current = new Set(ids);
      setEventIds(ids);
    }
    setLoading(false);
  }, [activeOrgId, sessionId]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // Subscribe to new events
  useEffect(() => {
    if (!activeOrgId) return;

    const subscription = client
      .subscription(SESSION_EVENTS_SUBSCRIPTION, {
        sessionId,
        organizationId: activeOrgId,
      })
      .subscribe((result) => {
        if (result.data?.sessionEvents) {
          const event = result.data.sessionEvents as Event;
          if (seenRef.current.has(event.id)) return;
          seenRef.current.add(event.id);
          useEntityStore.getState().upsert("events", event.id, event);
          setEventIds((prev) => [...prev, event.id]);
        }
      });

    return () => subscription.unsubscribe();
  }, [activeOrgId, sessionId]);

  return { eventIds, loading };
}
