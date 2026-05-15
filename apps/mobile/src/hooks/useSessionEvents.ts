import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  HIDDEN_SESSION_PAYLOAD_TYPES,
  handleSessionEvent,
  upsertFetchedSessionEventsWithOptimisticResolution,
  useAuthStore,
  useEntityStore,
  type AuthState,
} from "@trace/client-core";
import type { Event, Session, SessionTimelineMode } from "@trace/gql";
import { handleUnauthorized, isUnauthorized } from "@/lib/auth";
import { timedEventIngest } from "@/lib/perf";
import { getClient } from "@/lib/urql";
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
    hasOlder: timelineMode === "compact" ? false : page?.hasOlder === true,
    oldestTimestamp: timelineMode === "compact" ? null : (events[0]?.timestamp ?? null),
  };
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
  const oldestTimestampRef = useRef<string | null>(null);
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
      oldestTimestampRef.current = pending.oldestTimestamp;
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

  const flushBufferedEvents = useCallback(() => {
    const flushed = eventBufferRef.current.flush();
    if (flushed.fetched) {
      commitFetchedEvents(flushed.fetched);
    }

    if (flushed.error) {
      setError(flushed.error);
    }

    for (const event of flushed.liveEvents) {
      commitLiveEvent(event);
    }
  }, [commitFetchedEvents, commitLiveEvent]);

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
          commitLiveEvent(event);
          if (isCompletedSessionEvent(event)) {
            void fetchEvents();
          } else if (timelineModeRef.current === "compact") {
            setTimelineMode("live");
            timelineModeRef.current = "live";
            setTimelineItems(EMPTY_TIMELINE_ITEMS);
            setHasOlder(true);
            hasOlderRef.current = true;
          }
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
  }, [activeOrgId, commitLiveEvent, fetchEnabled, fetchEvents, sessionId]);

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
      !oldestTimestampRef.current ||
      loadingOlderRef.current ||
      !hasOlderRef.current
    ) {
      return;
    }

    loadingOlderRef.current = true;
    setLoadingOlder(true);

    const result = await getClient()
      .query(SESSION_EVENTS_QUERY, {
        organizationId: activeOrgId,
        scope: { type: "session", id: sessionId },
        limit: PAGE_SIZE,
        before: oldestTimestampRef.current,
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
        oldestTimestampRef.current = events[0].timestamp;
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
