import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { gql } from "@urql/core";
import type { Event, SessionTimelineMode } from "@trace/gql";
import { hasVisibleUserSessionContent } from "@trace/shared";
import {
  eventScopeKey,
  handleSessionEvent,
  upsertFetchedSessionEventsWithOptimisticResolution,
  useAuthStore,
  useScopedEvents,
  useScopedEventIds,
} from "@trace/client-core";
import { client } from "../lib/urql";
import {
  HIDDEN_SESSION_PAYLOAD_TYPES,
  HIDDEN_SESSION_PAYLOAD_TYPE_SET,
} from "../lib/session-event-filters";

const PAGE_SIZE = 100;
const SESSION_TIMELINE_QUERY = gql`
  query SessionTimeline(
    $organizationId: ID!
    $sessionId: ID!
    $limit: Int
    $before: DateTime
    $beforeEventId: ID
    $excludePayloadTypes: [String!]
  ) {
    sessionTimeline(
      organizationId: $organizationId
      sessionId: $sessionId
      limit: $limit
      before: $before
      beforeEventId: $beforeEventId
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
          startEventId
          startTimestamp
          endEventId
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
    $afterEventId: ID
    $before: DateTime
    $beforeEventId: ID
    $excludePayloadTypes: [String!]
  ) {
    events(
      organizationId: $organizationId
      scope: $scope
      limit: $limit
      after: $after
      afterEventId: $afterEventId
      before: $before
      beforeEventId: $beforeEventId
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
  startEventId: string;
  startTimestamp: string;
  endEventId: string;
  endTimestamp: string;
}

interface EventCursor {
  timestamp: string;
  eventId: string;
}

export type SessionTimelineDisplayItem =
  | { kind: "event"; id: string }
  | {
      kind: "collapsed_events";
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
    typeof record.startEventId !== "string" ||
    typeof record.startTimestamp !== "string" ||
    typeof record.endEventId !== "string" ||
    typeof record.endTimestamp !== "string"
  ) {
    return null;
  }

  return {
    id: record.id,
    startEventId: record.startEventId,
    startTimestamp: record.startTimestamp,
    endEventId: record.endEventId,
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

function isPrLifecycleEvent(event: Event): boolean {
  return (
    event.eventType === "session_pr_opened" ||
    event.eventType === "session_pr_merged" ||
    event.eventType === "session_pr_closed"
  );
}

function hasRenderableContentBlock(payload: Record<string, unknown>): boolean {
  const message = asRecord(payload.message);
  const content = message?.content;
  if (!Array.isArray(content)) return false;

  return content.some((rawBlock) => {
    const block = asRecord(rawBlock);
    if (!block) return false;
    if (block.type === "text") {
      return typeof block.text === "string" && block.text.trim() !== "";
    }
    return block.type === "tool_use" || block.type === "plan" || block.type === "question";
  });
}

function isRenderableCompactEvent(event: Event | undefined): event is Event & { id: string } {
  if (!event || event.parentId) return false;

  if (event.eventType === "session_started" || event.eventType === "message_sent") {
    return hasVisibleUserSessionContent(event.eventType, event.payload);
  }
  if (isPrLifecycleEvent(event)) return true;
  if (event.eventType !== "session_output") return false;

  const payload = payloadRecord(event);
  if (!payload) return false;
  const type = payload.type;
  if (typeof type === "string" && HIDDEN_SESSION_PAYLOAD_TYPE_SET.has(type)) return false;
  if (type === "assistant" || type === "user") return hasRenderableContentBlock(payload);
  return type === "result" || type === "error";
}

interface ParsedSessionTimelinePage {
  mode: SessionTimelineMode;
  hasOlder: boolean;
  items: SessionTimelineDisplayItem[];
  events: Array<Event & { id: string }>;
}

function parseSessionTimelinePage(value: unknown): ParsedSessionTimelinePage {
  const page = asRecord(value);
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

  return {
    mode: page?.mode === "compact" ? "compact" : "live",
    hasOlder: page?.hasOlder === true,
    items,
    events,
  };
}

function appendEventItem(
  current: SessionTimelineDisplayItem[] | null,
  event: Event & { id: string },
): SessionTimelineDisplayItem[] {
  if (!isRenderableCompactEvent(event)) return current ?? [];
  const items = current ?? [];
  if (items.some((item) => item.kind === "event" && item.id === event.id)) return items;
  return [...items, { kind: "event" as const, id: event.id }];
}

function timelineItemEndCursor(
  item: SessionTimelineDisplayItem,
  events: Record<string, Event>,
): EventCursor | null {
  if (item.kind === "collapsed_events") {
    return { timestamp: item.collapsed.endTimestamp, eventId: item.collapsed.endEventId };
  }
  const event = events[item.id];
  return event ? { timestamp: event.timestamp, eventId: item.id } : null;
}

function eventCursor(event: (Event & { id: string }) | undefined): EventCursor | null {
  return event ? { timestamp: event.timestamp, eventId: event.id } : null;
}

function compareCursor(a: EventCursor, b: EventCursor): number {
  const timestampDiff = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
  if (timestampDiff !== 0) return timestampDiff;
  return a.eventId.localeCompare(b.eventId);
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
  const oldestCursorRef = useRef<EventCursor | null>(null);
  const loadingOlderRef = useRef(false);
  const hasOlderRef = useRef(true);
  const timelineModeRef = useRef<SessionTimelineMode>("live");
  const scopeKey = eventScopeKey("session", sessionId);
  const scopedEvents = useScopedEvents(scopeKey);

  useEffect(() => {
    setTimelineMode("live");
    timelineModeRef.current = "live";
    setCompactItems(null);
    oldestCursorRef.current = null;
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

    const page = parseSessionTimelinePage(result.data?.sessionTimeline);

    if (page.events.length > 0) {
      upsertFetchedSessionEventsWithOptimisticResolution(sessionId, page.events);
    }

    if (page.mode === "compact") {
      setTimelineMode("compact");
      timelineModeRef.current = "compact";
      setCompactItems(page.items);
      setHasOlder(page.hasOlder);
      hasOlderRef.current = page.hasOlder;
      oldestCursorRef.current = eventCursor(page.events[0]);
    } else {
      setTimelineMode("live");
      timelineModeRef.current = "live";
      setCompactItems(null);

      if (!page.hasOlder) {
        setHasOlder(false);
        hasOlderRef.current = false;
      } else {
        setHasOlder(true);
        hasOlderRef.current = true;
      }
      if (page.events.length > 0) {
        oldestCursorRef.current = eventCursor(page.events[0]);
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
      oldestCursorRef.current = null;
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
          setCompactItems((current) => appendEventItem(current, event));
        }
      });

    return () => subscription.unsubscribe();
  }, [activeOrgId, fetchEvents, sessionId, skip]);

  // Load an older page of events (called when user scrolls to top)
  const fetchOlderEvents = useCallback(async () => {
    if (
      skip ||
      !activeOrgId ||
      !oldestCursorRef.current ||
      loadingOlderRef.current ||
      !hasOlderRef.current
    ) {
      return;
    }

    loadingOlderRef.current = true;
    setLoadingOlder(true);

    if (timelineModeRef.current === "compact") {
      const result = await client
        .query(SESSION_TIMELINE_QUERY, {
          organizationId: activeOrgId,
          sessionId,
          limit: PAGE_SIZE,
          before: oldestCursorRef.current.timestamp,
          beforeEventId: oldestCursorRef.current.eventId,
          excludePayloadTypes: HIDDEN_SESSION_PAYLOAD_TYPES,
        })
        .toPromise();

      if (result.error) {
        loadingOlderRef.current = false;
        setLoadingOlder(false);
        return;
      }

      const page = parseSessionTimelinePage(result.data?.sessionTimeline);
      if (page.events.length > 0) {
        upsertFetchedSessionEventsWithOptimisticResolution(sessionId, page.events);
      }

      if (page.mode === "compact") {
        setCompactItems((current) => [...page.items, ...(current ?? [])]);
        setHasOlder(page.hasOlder);
        hasOlderRef.current = page.hasOlder;
        oldestCursorRef.current = eventCursor(page.events[0]);
      } else {
        setTimelineMode("live");
        timelineModeRef.current = "live";
        setCompactItems(null);
        setHasOlder(page.hasOlder);
        hasOlderRef.current = page.hasOlder;
        oldestCursorRef.current = eventCursor(page.events[0]);
      }

      loadingOlderRef.current = false;
      setLoadingOlder(false);
      return;
    }

    const result = await client
      .query(SESSION_EVENTS_QUERY, {
        organizationId: activeOrgId,
        scope: { type: "session", id: sessionId },
        limit: PAGE_SIZE,
        before: oldestCursorRef.current.timestamp,
        beforeEventId: oldestCursorRef.current.eventId,
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
        oldestCursorRef.current = eventCursor(events[0]);
      }
    }
    loadingOlderRef.current = false;
    setLoadingOlder(false);
  }, [activeOrgId, sessionId, skip]);

  // Derive eventIds from the scoped bucket — O(session events) not O(all events)
  const eventIds = useScopedEventIds(scopeKey);
  const compactEventIdSet = useMemo(() => {
    if (!compactItems) return null;
    const ids = new Set<string>();
    for (const item of compactItems) {
      if (item.kind === "event") ids.add(item.id);
    }
    return ids;
  }, [compactItems]);
  const compactTailCursor = useMemo(() => {
    if (!compactItems || compactItems.length === 0) return null;
    for (let i = compactItems.length - 1; i >= 0; i--) {
      const cursor = timelineItemEndCursor(compactItems[i], scopedEvents);
      if (cursor) return cursor;
    }
    return null;
  }, [compactItems, scopedEvents]);
  const compactLiveTailItems = useMemo<SessionTimelineDisplayItem[]>(() => {
    if (timelineMode !== "compact" || !compactEventIdSet || !compactTailCursor) return [];

    const items: SessionTimelineDisplayItem[] = [];
    for (const id of eventIds) {
      if (compactEventIdSet.has(id)) continue;
      const event = scopedEvents[id];
      if (!isRenderableCompactEvent(event)) continue;
      if (compareCursor({ timestamp: event.timestamp, eventId: id }, compactTailCursor) <= 0) {
        continue;
      }
      items.push({ kind: "event", id });
    }
    return items;
  }, [compactEventIdSet, compactTailCursor, eventIds, scopedEvents, timelineMode]);
  const displayCompactItems = useMemo(
    () =>
      compactItems
        ? compactLiveTailItems.length > 0
          ? [...compactItems, ...compactLiveTailItems]
          : compactItems
        : null,
    [compactItems, compactLiveTailItems],
  );
  const compactEventIds = useMemo(
    () => displayCompactItems?.filter((item) => item.kind === "event").map((item) => item.id) ?? [],
    [displayCompactItems],
  );
  const timelineItems = useMemo<SessionTimelineDisplayItem[]>(
    () =>
      timelineMode === "compact" && displayCompactItems
        ? displayCompactItems
        : eventIds.map((id) => ({ kind: "event" as const, id })),
    [displayCompactItems, eventIds, timelineMode],
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
