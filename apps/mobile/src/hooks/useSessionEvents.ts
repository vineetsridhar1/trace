import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  HIDDEN_SESSION_PAYLOAD_TYPES,
  HIDDEN_SESSION_PAYLOAD_TYPE_SET,
  handleSessionEvent,
  upsertFetchedSessionEventsWithOptimisticResolution,
  useAuthStore,
  useEntityStore,
  type AuthState,
} from "@trace/client-core";
import type { Event, Session, SessionTimelineMode } from "@trace/gql";
import { handleUnauthorized, isUnauthorized } from "@/lib/auth";
import { timedEventIngest } from "@/lib/perf";
import { getClient, useGqlClientGeneration } from "@/lib/urql";
import { useConnectionStore, type ConnectionState } from "@/stores/connection";
import { PendingFetchedEvents, SessionEventBuffer } from "./session-events-buffer";
import {
  SESSION_EVENTS_QUERY,
  SESSION_EVENTS_SUBSCRIPTION,
  SESSION_TIMELINE_QUERY,
  SESSION_STATUS_SUBSCRIPTION,
} from "./session-events-gql";
import {
  asCollapsedSummary,
  asFetchedEvent,
  asRecord,
  type EventCursor,
  type SessionTimelineDisplayItem,
} from "./session-events-timeline";

const PAGE_SIZE = 100;
const EMPTY_TIMELINE_ITEMS: SessionTimelineDisplayItem[] = [];

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

  if (event.eventType === "session_started") {
    const payload = payloadRecord(event);
    return typeof payload?.prompt === "string" && payload.prompt.trim() !== "";
  }
  if (event.eventType === "message_sent") {
    const payload = payloadRecord(event);
    return typeof payload?.text === "string" && payload.text.trim() !== "";
  }
  if (isPrLifecycleEvent(event)) return true;
  if (event.eventType !== "session_output") return false;

  const payload = payloadRecord(event);
  if (!payload) return false;
  const type = payload.type;
  if (typeof type === "string" && HIDDEN_SESSION_PAYLOAD_TYPE_SET.has(type)) return false;
  if (type === "assistant" || type === "user") return hasRenderableContentBlock(payload);
  return type === "result" || type === "error" || type === "workspace_restored_from_base";
}

function pendingFromTimelinePage(value: unknown): PendingFetchedEvents {
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

  const timelineMode: SessionTimelineMode = page?.mode === "compact" ? "compact" : "live";
  return {
    events,
    timelineMode,
    timelineItems: items,
    hasOlder: page?.hasOlder === true,
    oldestCursor: eventCursor(events[0]),
  };
}

function eventCursor(event: (Event & { id: string }) | undefined): EventCursor | null {
  return event ? { timestamp: event.timestamp, eventId: event.id } : null;
}

function appendEventItem(
  current: SessionTimelineDisplayItem[],
  event: Event & { id: string },
): SessionTimelineDisplayItem[] {
  if (!isRenderableCompactEvent(event)) return current;
  if (current.some((item) => item.kind === "event" && item.id === event.id)) return current;
  return [...current, { kind: "event" as const, id: event.id }];
}

interface UseSessionEventsResult {
  loading: boolean;
  loadingOlder: boolean;
  hasOlder: boolean;
  error: string | null;
  eventIds: string[];
  timelineMode: SessionTimelineMode;
  timelineItems: SessionTimelineDisplayItem[];
  fetchEvents: () => Promise<void>;
  fetchOlderEvents: () => Promise<void>;
}

interface UseSessionEventsOptions {
  /** Starts network work. When false, fetches/subscriptions are stopped. */
  fetchEnabled?: boolean;
  /** Allows fetched/live events to enter Zustand. When false, events are buffered. */
  commitEnabled?: boolean;
}

/**
 * Mirrors web's useSessionEvents: fetches the most recent page on mount,
 * subscribes to live session events (full payloads) and session status updates,
 * and paginates older events via `before: timestamp`.
 *
 * Subscriptions tear down when the hook unmounts (screen blur in expo-router
 * unmounts the screen component, so useEffect cleanup is the correct unit).
 */
export function useSessionEvents(
  sessionId: string,
  options: UseSessionEventsOptions = {},
): UseSessionEventsResult {
  const fetchEnabled = options.fetchEnabled ?? true;
  const commitEnabled = options.commitEnabled ?? fetchEnabled;
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasOlder, setHasOlder] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timelineMode, setTimelineMode] = useState<SessionTimelineMode>("live");
  const [timelineItems, setTimelineItems] =
    useState<SessionTimelineDisplayItem[]>(EMPTY_TIMELINE_ITEMS);
  const activeOrgId = useAuthStore((s: AuthState) => s.activeOrgId);
  const clientGeneration = useGqlClientGeneration();
  const oldestCursorRef = useRef<EventCursor | null>(null);
  const loadingOlderRef = useRef(false);
  const hasOlderRef = useRef(true);
  const timelineModeRef = useRef<SessionTimelineMode>("live");
  const fetchEnabledRef = useRef(fetchEnabled);
  const commitEnabledRef = useRef(commitEnabled);
  const eventBufferRef = useRef(new SessionEventBuffer());

  const commitFetchedEvents = useCallback(
    (pending: PendingFetchedEvents) => {
      upsertFetchedSessionEventsWithOptimisticResolution(sessionId, pending.events);
      setHasOlder(pending.hasOlder);
      hasOlderRef.current = pending.hasOlder;
      oldestCursorRef.current = pending.oldestCursor;
      setTimelineMode(pending.timelineMode);
      timelineModeRef.current = pending.timelineMode;
      setTimelineItems(pending.timelineItems);
      setError(null);
    },
    [sessionId],
  );

  const commitLiveEvent = useCallback(
    (event: Event & { id: string }) => {
      timedEventIngest(event.eventType, () => {
        handleSessionEvent(sessionId, event);
      });
    },
    [sessionId],
  );

  const fetchEvents = useCallback(async () => {
    if (!fetchEnabled) return;
    if (!activeOrgId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    eventBufferRef.current.clearError();
    const requestToken = eventBufferRef.current.beginFetch();
    const result = await getClient()
      .query(SESSION_TIMELINE_QUERY, {
        organizationId: activeOrgId,
        sessionId,
        limit: PAGE_SIZE,
        before: new Date().toISOString(),
        excludePayloadTypes: HIDDEN_SESSION_PAYLOAD_TYPES,
      })
      .toPromise();

    if (!fetchEnabledRef.current || !eventBufferRef.current.isCurrentRequest(requestToken)) {
      return;
    }
    if (isUnauthorized(result.error)) {
      setLoading(false);
      void handleUnauthorized();
      return;
    }
    if (result.error) {
      if (commitEnabledRef.current) {
        setError(result.error.message);
      } else {
        eventBufferRef.current.storeError(requestToken, result.error.message);
      }
      setLoading(false);
      return;
    }

    const pending = pendingFromTimelinePage(result.data?.sessionTimeline);
    if (commitEnabledRef.current) {
      commitFetchedEvents(pending);
    } else {
      eventBufferRef.current.storeFetched(requestToken, pending);
    }
    setLoading(false);
  }, [activeOrgId, commitFetchedEvents, fetchEnabled, sessionId]);

  const commitLiveEventWithTimeline = useCallback(
    (event: Event & { id: string }) => {
      commitLiveEvent(event);
      if (isCompletedSessionEvent(event)) {
        void fetchEvents();
      } else if (timelineModeRef.current === "compact") {
        setTimelineItems((current) => appendEventItem(current, event));
      }
    },
    [commitLiveEvent, fetchEvents],
  );

  const flushBufferedEvents = useCallback(() => {
    const flushed = eventBufferRef.current.flush();
    if (flushed.fetched) {
      commitFetchedEvents(flushed.fetched);
    }

    if (flushed.error) {
      setError(flushed.error);
    }

    for (const event of flushed.liveEvents) {
      commitLiveEventWithTimeline(event);
    }
  }, [commitFetchedEvents, commitLiveEventWithTimeline]);

  useEffect(() => {
    commitEnabledRef.current = commitEnabled;
    if (commitEnabled) flushBufferedEvents();
  }, [commitEnabled, flushBufferedEvents]);

  useEffect(() => {
    fetchEnabledRef.current = fetchEnabled;
  }, [fetchEnabled]);

  useEffect(() => {
    if (!fetchEnabled) {
      eventBufferRef.current.invalidateFetches();
      setLoading(true);
      setError(null);
      setTimelineMode("live");
      timelineModeRef.current = "live";
      setTimelineItems(EMPTY_TIMELINE_ITEMS);
      oldestCursorRef.current = null;
      return;
    }
    void fetchEvents();
  }, [fetchEnabled, fetchEvents]);

  useEffect(() => {
    if (!fetchEnabled) return;
    if (!activeOrgId) return;

    const client = getClient();
    // On 401: sign the user out. The auth reset unmounts this screen, which
    // triggers the useEffect cleanup below and unsubscribes both streams.
    const eventSub = client
      .subscription(SESSION_EVENTS_SUBSCRIPTION, { sessionId, organizationId: activeOrgId })
      .subscribe((result: { error?: unknown; data?: { sessionEvents?: Event } }) => {
        if (isUnauthorized(result.error)) {
          void handleUnauthorized();
          return;
        }
        if (result.error) {
          console.error("[sessionEvents] subscription error:", result.error);
          return;
        }
        if (!result.data?.sessionEvents) return;
        const event = result.data.sessionEvents as Event & { id: string };
        if (commitEnabledRef.current) {
          commitLiveEventWithTimeline(event);
        } else {
          eventBufferRef.current.storeLiveEvent(event);
        }
      });

    const statusSub = client
      .subscription(SESSION_STATUS_SUBSCRIPTION, { sessionId, organizationId: activeOrgId })
      .subscribe((result: { error?: unknown; data?: { sessionStatusChanged?: Session } }) => {
        if (isUnauthorized(result.error)) {
          void handleUnauthorized();
          return;
        }
        if (result.error) {
          console.error("[sessionStatusChanged] subscription error:", result.error);
          return;
        }
        const next = result.data?.sessionStatusChanged;
        if (!next?.id) return;
        useEntityStore.getState().patch("sessions", next.id, next);
      });

    return () => {
      eventSub.unsubscribe();
      statusSub.unsubscribe();
    };
  }, [activeOrgId, clientGeneration, commitLiveEventWithTimeline, fetchEnabled, sessionId]);

  // Catch up missed events after a WS reconnect: the server's pubsub has no
  // replay, so anything the agent emitted while we were disconnected is lost
  // to the live subscription and must be re-queried over HTTP.
  const reconnectCounter = useConnectionStore((s: ConnectionState) => s.reconnectCounter);
  const baselineReconnectCounter = useRef(reconnectCounter);
  useEffect(() => {
    if (!fetchEnabled) return;
    if (reconnectCounter <= baselineReconnectCounter.current) return;
    baselineReconnectCounter.current = reconnectCounter;
    void fetchEvents();
  }, [fetchEnabled, reconnectCounter, fetchEvents]);

  useEffect(
    () => () => {
      fetchEnabledRef.current = false;
      eventBufferRef.current.invalidateFetches();
    },
    [],
  );

  const fetchOlderEvents = useCallback(async () => {
    if (
      !fetchEnabled ||
      !commitEnabled ||
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
      const result = await getClient()
        .query(SESSION_TIMELINE_QUERY, {
          organizationId: activeOrgId,
          sessionId,
          limit: PAGE_SIZE,
          before: oldestCursorRef.current.timestamp,
          beforeEventId: oldestCursorRef.current.eventId,
          excludePayloadTypes: HIDDEN_SESSION_PAYLOAD_TYPES,
        })
        .toPromise();

      if (isUnauthorized(result.error)) {
        loadingOlderRef.current = false;
        setLoadingOlder(false);
        void handleUnauthorized();
        return;
      }
      if (result.error) {
        loadingOlderRef.current = false;
        setLoadingOlder(false);
        return;
      }

      const pending = pendingFromTimelinePage(result.data?.sessionTimeline);
      if (pending.events.length > 0) {
        upsertFetchedSessionEventsWithOptimisticResolution(sessionId, pending.events);
      }

      if (pending.timelineMode === "compact") {
        setTimelineItems((current) => [...pending.timelineItems, ...current]);
        setHasOlder(pending.hasOlder);
        hasOlderRef.current = pending.hasOlder;
        oldestCursorRef.current = pending.oldestCursor;
      } else {
        setTimelineMode("live");
        timelineModeRef.current = "live";
        setTimelineItems(EMPTY_TIMELINE_ITEMS);
        setHasOlder(pending.hasOlder);
        hasOlderRef.current = pending.hasOlder;
        oldestCursorRef.current = pending.oldestCursor;
      }

      loadingOlderRef.current = false;
      setLoadingOlder(false);
      return;
    }

    const result = await getClient()
      .query(SESSION_EVENTS_QUERY, {
        organizationId: activeOrgId,
        scope: { type: "session", id: sessionId },
        limit: PAGE_SIZE,
        before: oldestCursorRef.current.timestamp,
        beforeEventId: oldestCursorRef.current.eventId,
        excludePayloadTypes: HIDDEN_SESSION_PAYLOAD_TYPES,
      })
      .toPromise();

    if (isUnauthorized(result.error)) {
      loadingOlderRef.current = false;
      setLoadingOlder(false);
      void handleUnauthorized();
      return;
    }
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
  }, [activeOrgId, commitEnabled, fetchEnabled, sessionId]);

  const eventIds = useMemo(
    () => timelineItems.filter((item) => item.kind === "event").map((item) => item.id),
    [timelineItems],
  );

  return {
    loading: fetchEnabled ? loading : true,
    loadingOlder,
    hasOlder,
    error: fetchEnabled ? error : null,
    eventIds,
    timelineMode,
    timelineItems,
    fetchEvents,
    fetchOlderEvents,
  };
}
