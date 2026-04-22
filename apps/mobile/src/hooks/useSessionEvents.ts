import { useCallback, useEffect, useRef, useState } from "react";
import {
  HIDDEN_SESSION_PAYLOAD_TYPES,
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
import {
  SESSION_EVENTS_QUERY,
  SESSION_EVENTS_SUBSCRIPTION,
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

/**
 * Mirrors web's useSessionEvents: fetches the most recent page on mount,
 * subscribes to live session events (full payloads) and session status updates,
 * and paginates older events via `before: timestamp`.
 *
 * Subscriptions tear down when the hook unmounts (screen blur in expo-router
 * unmounts the screen component, so useEffect cleanup is the correct unit).
 */
export function useSessionEvents(sessionId: string): UseSessionEventsResult {
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasOlder, setHasOlder] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const activeOrgId = useAuthStore((s: AuthState) => s.activeOrgId);
  const oldestTimestampRef = useRef<string | null>(null);
  const loadingOlderRef = useRef(false);
  const hasOlderRef = useRef(true);

  const fetchEvents = useCallback(async () => {
    if (!activeOrgId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    const result = await getClient()
      .query(SESSION_EVENTS_QUERY, {
        organizationId: activeOrgId,
        scope: { type: "session", id: sessionId },
        limit: PAGE_SIZE,
        before: new Date().toISOString(),
        excludePayloadTypes: HIDDEN_SESSION_PAYLOAD_TYPES,
      })
      .toPromise();

    if (isUnauthorized(result.error)) {
      setLoading(false);
      void handleUnauthorized();
      return;
    }
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
  }, [activeOrgId, sessionId]);

  useEffect(() => {
    void fetchEvents();
  }, [fetchEvents]);

  useEffect(() => {
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
        timedEventIngest(event.eventType, () => {
          handleSessionEvent(sessionId, event);
        });
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
  }, [activeOrgId, sessionId]);

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
  }, [activeOrgId, sessionId]);

  return { loading, loadingOlder, hasOlder, error, fetchEvents, fetchOlderEvents };
}
