import { useMemo } from "react";
import { eventScopeKey, useScopedEventIds, useScopedEvents } from "@trace/client-core";
import type { Event } from "@trace/gql";
import { findMostRecentPendingInput, type PendingInputData } from "@/lib/pending-input";

const DISABLED_SCOPE_KEY = "__session_pending_input_disabled__";

export function useSessionPendingInput(
  sessionId: string,
  options: { enabled?: boolean } = {},
): PendingInputData | null {
  const enabled = options.enabled ?? true;
  const scopeKey = enabled ? eventScopeKey("session", sessionId) : DISABLED_SCOPE_KEY;
  const eventIds = useScopedEventIds(scopeKey, byTimestamp);
  const events = useScopedEvents(scopeKey);

  return useMemo(() => {
    if (!enabled) return null;
    return findMostRecentPendingInput(eventIds, events);
  }, [enabled, eventIds, events]);
}

function byTimestamp(a: Event, b: Event): number {
  return a.timestamp.localeCompare(b.timestamp);
}
