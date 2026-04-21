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
  /**
   * Optional callback to focus the main composer with a prefill string.
   * The plan variant uses this for "Send feedback"; the question variant
   * uses it for free-form responses too long for the inline input. Wired
   * by the composer in ticket 23 — until then the affordance no-ops.
   */
  onRequestComposerPrefill?: (text: string) => void;
}

/**
 * Pinned bar above the session stream that surfaces the most recent
 * `question_pending` or `plan_pending` block when the session is waiting on
 * the user. The bar dismounts itself when the session leaves `needs_input`.
 */
export function PendingInputBar({
  sessionId,
  onRequestComposerPrefill,
}: PendingInputBarProps) {
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
        onRequestFeedback={onRequestComposerPrefill}
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
