import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { gql } from "@urql/core";
import type { Event, SessionTimelineItemKind, SessionTimelineMode } from "@trace/gql";
import {
  eventScopeKey,
  handleSessionEvent,
  upsertFetchedSessionEventsWithOptimisticResolution,
  useAuthStore,
  useScopedEventIds,
} from "@trace/client-core";
import { client } from "../lib/urql";
import { HIDDEN_SESSION_PAYLOAD_TYPES } from "../lib/session-event-filters";

const PAGE_SIZE = 100;
const SESSION_TIMELINE_QUERY = gql`
  query SessionTimeline(
    $organizationId: ID!
    $sessionId: ID!
    $limit: Int
    $before: DateTime
    $excludePayloadTypes: [String!]
  ) {
    sessionTimeline(
      organizationId: $organizationId
      sessionId: $sessionId
      limit: $limit
      before: $before
      excludePayloadTypes: $excludePayloadTypes
    ) {
      mode
      hasOlder
      items {
        id
        kind
        event {
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
        collapsed {
          id
          eventCount
          toolCallCount
          messageCount
          startTimestamp
          endTimestamp
        }
      }
    }
  }
`;

export const SESSION_EVENTS_QUERY = gql`
  query SessionEvents(
    $organizationId: ID!
    $scope: ScopeInput
    $limit: Int
    $after: DateTime
    $before: DateTime
    $excludePayloadTypes: [String!]
  ) {
    events(
      organizationId: $organizationId
      scope: $scope
      limit: $limit
      after: $after
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

export interface CollapsedSessionEventsSummary {
  id: string;
  eventCount: number;
  toolCallCount: number;
  messageCount: number;
  startTimestamp: string;
  endTimestamp: string;
}

export type SessionTimelineDisplayItem =
  | { kind: Extract<SessionTimelineItemKind, "event">; id: string }
  | {
      kind: Extract<SessionTimelineItemKind, "collapsed_events">;
      id: string;
      collapsed: CollapsedSessionEventsSummary;
    };

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asFetchedEvent(value: unknown): (Event & { id: string }) | null {
  const record = asRecord(value);
  return typeof record?.id === "string" ? (record as Event & { id: string }) : null;
}

function asCollapsedSummary(value: unknown): CollapsedSessionEventsSummary | null {
  const record = asRecord(value);
  if (
    typeof record?.id !== "string" ||
    typeof record.eventCount !== "number" ||
    typeof record.toolCallCount !== "number" ||
    typeof record.messageCount !== "number" ||
    typeof record.startTimestamp !== "string" ||
    typeof record.endTimestamp !== "string"
  ) {
    return null;
  }

  return {
    id: record.id,
    eventCount: record.eventCount,
    toolCallCount: record.toolCallCount,
    messageCount: record.messageCount,
    startTimestamp: record.startTimestamp,
    endTimestamp: record.endTimestamp,
  };
}

function payloadRecord(event: Event): Record<string, unknown> | null {
  return asRecord(event.payload);
}

function isCompletedSessionEvent(event: Event): boolean {
  if (event.eventType !== "session_terminated") return false;
  const payload = payloadRecord(event);
  return payload?.agentStatus === "done" && payload.sessionStatus !== "needs_input";
}

export function useSessionEvents(sessionId: string, options?: { skip?: boolean }) {
  const skip = options?.skip === true;
  const [loading, setLoading] = useState(!skip);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasOlder, setHasOlder] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timelineMode, setTimelineMode] = useState<SessionTimelineMode>("live");
  const [compactItems, setCompactItems] = useState<SessionTimelineDisplayItem[] | null>(null);
  const activeOrgId = useAuthStore((s: { activeOrgId: string | null }) => s.activeOrgId);
  const oldestTimestampRef = useRef<string | null>(null);
  const loadingOlderRef = useRef(false);
  const hasOlderRef = useRef(true);
  const timelineModeRef = useRef<SessionTimelineMode>("live");
  const scopeKey = eventScopeKey("session", sessionId);

  useEffect(() => {
    setTimelineMode("live");
    timelineModeRef.current = "live";
    setCompactItems(null);
    oldestTimestampRef.current = null;
    hasOlderRef.current = true;
  }, [sessionId]);

  // Fetch the most recent page of events on mount
  const fetchEvents = useCallback(async () => {
    if (skip || !activeOrgId) return;

    setError(null);
    const result = await client
      .query(SESSION_TIMELINE_QUERY, {
        organizationId: activeOrgId,
        sessionId,
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

    const page = asRecord(result.data?.sessionTimeline);
    const rawItems = Array.isArray(page?.items) ? page.items : [];
    const events: Array<Event & { id: string }> = [];
    const items: SessionTimelineDisplayItem[] = [];

    for (const rawItem of rawItems) {
      const item = asRecord(rawItem);
      if (item?.kind === "event") {
        const event = asFetchedEvent(item.event);
        if (!event) continue;
        events.push(event);
        items.push({ kind: "event", id: event.id });
      } else if (item?.kind === "collapsed_events") {
        const collapsed = asCollapsedSummary(item.collapsed);
        if (!collapsed) continue;
        items.push({ kind: "collapsed_events", id: collapsed.id, collapsed });
      }
    }

    if (events.length > 0) {
      upsertFetchedSessionEventsWithOptimisticResolution(sessionId, events);
    }

    if (page?.mode === "compact") {
      setTimelineMode("compact");
      timelineModeRef.current = "compact";
      setCompactItems(items);
      setHasOlder(false);
      hasOlderRef.current = false;
      oldestTimestampRef.current = null;
    } else {
      setTimelineMode("live");
      timelineModeRef.current = "live";
      setCompactItems(null);

      const pageHasOlder = page?.hasOlder === true;
      if (!pageHasOlder) {
        setHasOlder(false);
        hasOlderRef.current = false;
      } else {
        setHasOlder(true);
        hasOlderRef.current = true;
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
      setCompactItems(null);
      setTimelineMode("live");
      timelineModeRef.current = "live";
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

    const subscription = client
      .subscription(SESSION_EVENTS_SUBSCRIPTION, {
        sessionId,
        organizationId: activeOrgId,
      })
      .subscribe((result: { data?: Record<string, unknown> }) => {
        if (!result.data?.sessionEvents) return;
        const event = result.data.sessionEvents as Event & { id: string };
        handleSessionEvent(sessionId, event);

        if (isCompletedSessionEvent(event)) {
          void fetchEvents();
        } else if (timelineModeRef.current === "compact") {
          setTimelineMode("live");
          timelineModeRef.current = "live";
          setCompactItems(null);
          setHasOlder(true);
          hasOlderRef.current = true;
        }
      });

    return () => subscription.unsubscribe();
  }, [activeOrgId, fetchEvents, sessionId, skip]);

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
  const compactEventIds = useMemo(
    () => compactItems?.filter((item) => item.kind === "event").map((item) => item.id) ?? [],
    [compactItems],
  );
  const timelineItems = useMemo<SessionTimelineDisplayItem[]>(
    () =>
      timelineMode === "compact" && compactItems
        ? compactItems
        : eventIds.map((id) => ({ kind: "event" as const, id })),
    [compactItems, eventIds, timelineMode],
  );

  return {
    eventIds: timelineMode === "compact" ? compactEventIds : eventIds,
    timelineItems,
    timelineMode,
    loading,
    loadingOlder,
    hasOlder,
    error,
    fetchOlderEvents,
  };
}
