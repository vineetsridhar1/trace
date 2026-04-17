import { useEffect, useState, useCallback, useRef } from "react";
import { gql } from "@urql/core";
import { asJsonObject } from "@trace/shared";
import type { Event } from "@trace/gql";
import { client } from "../lib/urql";
import { useScopedEventIds, eventScopeKey, useEntityStore, type SessionEntity } from "../stores/entity";
import { useAuthStore } from "../stores/auth";
import { HIDDEN_SESSION_PAYLOAD_TYPES } from "../lib/session-event-filters";
import {
  upsertFetchedSessionEventsWithOptimisticResolution,
  upsertSessionEventWithOptimisticResolution,
} from "../lib/optimistic-message";

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

function getLastMessagePatch(event: Event): Partial<SessionEntity> | null {
  if (event.eventType === "message_sent") {
    return {
      _lastMessageAt: event.timestamp,
      lastMessageAt: event.timestamp,
      ...(event.actor?.type === "user" ? { lastUserMessageAt: event.timestamp } : {}),
    };
  }

  if (event.eventType !== "session_output") return null;
  const payload = asJsonObject(event.payload);
  if (payload?.type !== "assistant") return null;

  return {
    _lastMessageAt: event.timestamp,
    lastMessageAt: event.timestamp,
  };
}

function getPatchLastMessageTimestamp(patch: Partial<SessionEntity> | null): string | null {
  if (!patch) return null;
  return patch._lastMessageAt ?? patch.lastMessageAt ?? patch.lastUserMessageAt ?? null;
}

function getCurrentLastMessageTimestamp(sessionId: string): string | null {
  const session = useEntityStore.getState().sessions[sessionId];
  return session?._lastMessageAt ?? session?.lastMessageAt ?? session?.lastUserMessageAt ?? null;
}

function patchSessionLastMessageFromEvents(sessionId: string, events: Event[]) {
  for (let i = events.length - 1; i >= 0; i--) {
    const patch = getLastMessagePatch(events[i] as Event);
    if (!patch) continue;
    const nextTimestamp = getPatchLastMessageTimestamp(patch);
    const currentTimestamp = getCurrentLastMessageTimestamp(sessionId);
    if (
      nextTimestamp &&
      currentTimestamp &&
      new Date(nextTimestamp).getTime() <= new Date(currentTimestamp).getTime()
    ) {
      return;
    }
    useEntityStore.getState().patch("sessions", sessionId, patch);
    return;
  }
}

export function useSessionEvents(sessionId: string) {
  const [loading, setLoading] = useState(true);
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
    if (!activeOrgId) return;

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
      patchSessionLastMessageFromEvents(sessionId, events);

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

  // Subscribe to session-scoped events for full payloads.
  // The org-wide subscription trims session_output payloads to metadata only;
  // this subscription delivers full content for the session being viewed.
  useEffect(() => {
    if (!activeOrgId) return;

    const subscription = client
      .subscription(SESSION_EVENTS_SUBSCRIPTION, {
        sessionId,
        organizationId: activeOrgId,
      })
      .subscribe((result: { data?: Record<string, unknown> }) => {
        if (!result.data?.sessionEvents) return;
        const event = result.data.sessionEvents as Event & { id: string };
        upsertSessionEventWithOptimisticResolution(sessionId, event);
        patchSessionLastMessageFromEvents(sessionId, [event]);
      });

    return () => subscription.unsubscribe();
  }, [activeOrgId, sessionId]);

  // Load an older page of events (called when user scrolls to top)
  const fetchOlderEvents = useCallback(async () => {
    if (
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
      patchSessionLastMessageFromEvents(sessionId, events);

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
  const eventIds = useScopedEventIds(scopeKey, (a, b) => a.timestamp.localeCompare(b.timestamp));

  return { eventIds, loading, loadingOlder, hasOlder, error, fetchOlderEvents };
}
