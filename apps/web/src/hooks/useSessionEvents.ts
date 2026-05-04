import { useEffect, useState, useCallback, useRef } from "react";
import { gql } from "@urql/core";
import type { Event } from "@trace/gql";
import {
  eventScopeKey,
  appendStreamingSessionOutput,
  handleSessionEvent,
  upsertFetchedSessionEventsWithOptimisticResolution,
  useAuthStore,
  useScopedEventIds,
} from "@trace/client-core";
import { client } from "../lib/urql";
import { HIDDEN_SESSION_PAYLOAD_TYPES } from "../lib/session-event-filters";

const PAGE_SIZE = 100;
const SESSION_EVENTS_QUERY = gql`
  query SessionEvents(
    $organizationId: ID!
    $scope: ScopeInput
    $limit: Int
    $before: DateTime
    $excludePayloadTypes: [String!]
  ) {
    events(
      organizationId: $organizationId
      scope: $scope
      limit: $limit
      before: $before
      excludePayloadTypes: $excludePayloadTypes
    ) {
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

const SESSION_OUTPUT_DELTAS_SUBSCRIPTION = gql`
  subscription SessionOutputDeltasLive($sessionId: ID!, $organizationId: ID!) {
    sessionOutputDeltas(sessionId: $sessionId, organizationId: $organizationId) {
      sessionId
      type
      text
    }
  }
`;

export function useSessionEvents(sessionId: string, options?: { skip?: boolean }) {
  const skip = options?.skip === true;
  const [loading, setLoading] = useState(!skip);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasOlder, setHasOlder] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const activeOrgId = useAuthStore((s: { activeOrgId: string | null }) => s.activeOrgId);
  const oldestTimestampRef = useRef<string | null>(null);
  const loadingOlderRef = useRef(false);
  const hasOlderRef = useRef(true);
  const scopeKey = eventScopeKey("session", sessionId);

  // Fetch the most recent page of events on mount
  const fetchEvents = useCallback(async () => {
    if (skip || !activeOrgId) return;

    setError(null);
    const result = await client
      .query(SESSION_EVENTS_QUERY, {
        organizationId: activeOrgId,
        scope: { type: "session", id: sessionId },
        limit: PAGE_SIZE,
        before: new Date().toISOString(),
        excludePayloadTypes: HIDDEN_SESSION_PAYLOAD_TYPES,
      })
      .toPromise();

    if (result.error) {
      setError(result.error.message);
      setLoading(false);
      return;
    }

    if (result.data?.events) {
      const events = result.data.events as Array<Event & { id: string }>;
      upsertFetchedSessionEventsWithOptimisticResolution(sessionId, events);

      if (events.length < PAGE_SIZE) {
        setHasOlder(false);
        hasOlderRef.current = false;
      }
      if (events.length > 0) {
        oldestTimestampRef.current = events[0].timestamp;
      }
    }
    setLoading(false);
  }, [activeOrgId, sessionId, skip]);

  useEffect(() => {
    if (skip) {
      setLoading(false);
      setHasOlder(false);
      hasOlderRef.current = false;
      setError(null);
      return;
    }
    fetchEvents();
  }, [fetchEvents, skip]);

  // Subscribe to session-scoped events for full payloads.
  // The org-wide subscription trims session_output payloads to metadata only;
  // this subscription delivers full content for the session being viewed.
  useEffect(() => {
    if (skip || !activeOrgId) return;

    const eventSubscription = client
      .subscription(SESSION_EVENTS_SUBSCRIPTION, {
        sessionId,
        organizationId: activeOrgId,
      })
      .subscribe((result: { data?: Record<string, unknown> }) => {
        if (!result.data?.sessionEvents) return;
        handleSessionEvent(sessionId, result.data.sessionEvents as Event & { id: string });
      });

    const deltaSubscription = client
      .subscription(SESSION_OUTPUT_DELTAS_SUBSCRIPTION, {
        sessionId,
        organizationId: activeOrgId,
      })
      .subscribe(
        (result: { data?: { sessionOutputDeltas?: { type?: string; text?: string } | null } }) => {
          const delta = result.data?.sessionOutputDeltas;
          if (delta?.type !== "assistant_text_delta" || typeof delta.text !== "string") return;
          appendStreamingSessionOutput(sessionId, delta.text, new Date().toISOString());
        },
      );

    return () => {
      eventSubscription.unsubscribe();
      deltaSubscription.unsubscribe();
    };
  }, [activeOrgId, sessionId, skip]);

  // Load an older page of events (called when user scrolls to top)
  const fetchOlderEvents = useCallback(async () => {
    if (
      skip ||
      !activeOrgId ||
      !oldestTimestampRef.current ||
      loadingOlderRef.current ||
      !hasOlderRef.current
    ) {
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
        excludePayloadTypes: HIDDEN_SESSION_PAYLOAD_TYPES,
      })
      .toPromise();

    if (result.error) {
      loadingOlderRef.current = false;
      setLoadingOlder(false);
      return;
    }

    if (result.data?.events) {
      const events = result.data.events as Array<Event & { id: string }>;
      upsertFetchedSessionEventsWithOptimisticResolution(sessionId, events);

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
  }, [activeOrgId, sessionId, skip]);

  // Derive eventIds from the scoped bucket — O(session events) not O(all events)
  const eventIds = useScopedEventIds(scopeKey);

  return { eventIds, loading, loadingOlder, hasOlder, error, fetchOlderEvents };
}
