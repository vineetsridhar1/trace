import { useMemo } from "react";
import {
  eventScopeKey,
  useScopedEventIds,
  useScopedEvents,
} from "@trace/client-core";
import type { Event } from "@trace/gql";
import { findMostRecentPendingInput } from "@/lib/pending-input";
import { PendingInputPlan } from "./PendingInputPlan";
import { PendingInputQuestion } from "./PendingInputQuestion";

interface PendingInputBarProps {
  sessionId: string;
  keyboardVisible?: boolean;
}

/**
 * Bottom-pinned bar that takes over the composer area when the agent's
 * most recent output is an unanswered question or plan block. Renders the
 * plan-review surface or the question surface accordingly. Driven purely
 * off the event stream — no `sessionStatus` gate — so the bar appears as
 * soon as the events scope is hydrated, even if the server-side status
 * flip arrives a tick later. Disappears once the user (or any teammate)
 * sends a follow-up `message_sent` event.
 */
export function PendingInputBar({
  sessionId,
  keyboardVisible = false,
}: PendingInputBarProps) {
  const scopeKey = eventScopeKey("session", sessionId);
  const eventIds = useScopedEventIds(scopeKey, byTimestamp);
  const events = useScopedEvents(scopeKey);
  const pending = useMemo(
    () => findMostRecentPendingInput(eventIds, events),
    [eventIds, events],
  );

  if (!pending) return null;

  if (pending.kind === "plan") {
    return (
      <PendingInputPlan
        sessionId={sessionId}
        planContent={pending.planContent}
        planFilePath={pending.planFilePath}
        keyboardVisible={keyboardVisible}
      />
    );
  }

  return (
    <PendingInputQuestion
      sessionId={sessionId}
      questions={pending.questions}
      hasActivePlan={pending.hasActivePlan}
      keyboardVisible={keyboardVisible}
    />
  );
}

function byTimestamp(a: Event, b: Event): number {
  return a.timestamp.localeCompare(b.timestamp);
}
