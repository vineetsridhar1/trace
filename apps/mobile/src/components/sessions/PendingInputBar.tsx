import { useMemo } from "react";
import {
  eventScopeKey,
  useEntityField,
  useScopedEventIds,
  useScopedEvents,
} from "@trace/client-core";
import type { Event } from "@trace/gql";
import { findMostRecentPendingInput } from "@/lib/pending-input";
import { PendingInputPlan } from "./PendingInputPlan";
import { PendingInputQuestion } from "./PendingInputQuestion";

interface PendingInputBarProps {
  sessionId: string;
}

/**
 * Bottom-pinned bar that takes over the composer area when the session is
 * waiting on the user (`session.sessionStatus === "needs_input"`). Renders
 * the plan-review surface or the question surface depending on the most
 * recent pending block. The bar dismounts itself once the session leaves
 * the needs-input state.
 */
export function PendingInputBar({ sessionId }: PendingInputBarProps) {
  const sessionStatus = useEntityField("sessions", sessionId, "sessionStatus") as
    | string
    | null
    | undefined;
  const scopeKey = eventScopeKey("session", sessionId);
  const eventIds = useScopedEventIds(scopeKey, byTimestamp);
  const events = useScopedEvents(scopeKey);
  const pending = useMemo(
    () => findMostRecentPendingInput(eventIds, events),
    [eventIds, events],
  );

  if (sessionStatus !== "needs_input" || !pending) return null;

  if (pending.kind === "plan") {
    return (
      <PendingInputPlan
        sessionId={sessionId}
        planContent={pending.planContent}
        planFilePath={pending.planFilePath}
      />
    );
  }

  return (
    <PendingInputQuestion
      sessionId={sessionId}
      questions={pending.questions}
    />
  );
}

function byTimestamp(a: Event, b: Event): number {
  return a.timestamp.localeCompare(b.timestamp);
}
