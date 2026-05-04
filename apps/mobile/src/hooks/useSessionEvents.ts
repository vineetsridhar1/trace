import { useCallback, useEffect, useRef, useState } from "react";
import {
  HIDDEN_SESSION_PAYLOAD_TYPES,
  appendStreamingSessionOutput,
  handleSessionEvent,
  upsertFetchedSessionEventsWithOptimisticResolution,
  useAuthStore,
  useEntityStore,
  type AuthState,
} from "@trace/client-core";
import type { Event, Session } from "@trace/gql";
import { handleUnauthorized, isUnauthorized } from "@/lib/auth";
import { timedEventIngest } from "@/lib/perf";
import { getClient } from "@/lib/urql";
import { useConnectionStore, type ConnectionState } from "@/stores/connection";
import { PendingFetchedEvents, SessionEventBuffer } from "./session-events-buffer";
import {
  SESSION_EVENTS_QUERY,
  SESSION_EVENTS_SUBSCRIPTION,
  SESSION_OUTPUT_DELTAS_SUBSCRIPTION,
  SESSION_STATUS_SUBSCRIPTION,
} from "./session-events-gql";

const PAGE_SIZE = 100;

interface UseSessionEventsResult {
  loading: boolean;
  loadingOlder: boolean;
  hasOlder: boolean;
  error: string | null;
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
  const activeOrgId = useAuthStore((s: AuthState) => s.activeOrgId);
  const oldestTimestampRef = useRef<string | null>(null);
  const loadingOlderRef = useRef(false);
  const hasOlderRef = useRef(true);
  const fetchEnabledRef = useRef(fetchEnabled);
  const commitEnabledRef = useRef(commitEnabled);
  const eventBufferRef = useRef(new SessionEventBuffer());

  const commitFetchedEvents = useCallback(
    (pending: PendingFetchedEvents) => {
      upsertFetchedSessionEventsWithOptimisticResolution(sessionId, pending.events);
      setHasOlder(pending.hasOlder);
      hasOlderRef.current = pending.hasOlder;
      oldestTimestampRef.current = pending.oldestTimestamp;
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
      .query(SESSION_EVENTS_QUERY, {
        organizationId: activeOrgId,
        scope: { type: "session", id: sessionId },
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

    if (result.data?.events) {
      const events = result.data.events as Array<Event & { id: string }>;
      const pending = {
        events,
        hasOlder: events.length >= PAGE_SIZE,
        oldestTimestamp: events[0]?.timestamp ?? null,
      };
      if (commitEnabledRef.current) {
        commitFetchedEvents(pending);
      } else {
        eventBufferRef.current.storeFetched(requestToken, pending);
      }
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

    const deltaSub = client
      .subscription(SESSION_OUTPUT_DELTAS_SUBSCRIPTION, { sessionId, organizationId: activeOrgId })
      .subscribe(
        (result: {
          error?: unknown;
          data?: { sessionOutputDeltas?: { type?: string; text?: string } | null };
        }) => {
          if (isUnauthorized(result.error)) {
            void handleUnauthorized();
            return;
          }
          if (result.error) {
            console.error("[sessionOutputDeltas] subscription error:", result.error);
            return;
          }
          const delta = result.data?.sessionOutputDeltas;
          if (delta?.type !== "assistant_text_delta" || typeof delta.text !== "string") return;
          appendStreamingSessionOutput(sessionId, delta.text, new Date().toISOString());
        },
      );

    return () => {
      eventSub.unsubscribe();
      statusSub.unsubscribe();
      deltaSub.unsubscribe();
    };
  }, [activeOrgId, commitLiveEvent, fetchEnabled, sessionId]);

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

  return {
    loading: fetchEnabled ? loading : true,
    loadingOlder,
    hasOlder,
    error: fetchEnabled ? error : null,
    fetchEvents,
    fetchOlderEvents,
  };
}
