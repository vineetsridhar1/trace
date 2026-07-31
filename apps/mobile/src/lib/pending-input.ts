import type { Event } from "@trace/gql";
import { asJsonObject, parseQuestion, type Question } from "@trace/shared";

export type PendingInputData =
  | {
      kind: "question";
      eventId: string;
      questions: Question[];
      timestamp: string;
      /**
       * True when an earlier assistant event in the same session contains a
       * `plan` block. Mirrors web's `activePlan`-gated `interactionMode:
       * "plan"` forwarding so a question answered during plan mode keeps
       * the plan context on the wire.
       */
      hasActivePlan: boolean;
    }
  | {
      kind: "plan";
      eventId: string;
      planContent: string;
      timestamp: string;
    };

/**
 * Walk events backwards to find the most recent assistant event that
 * carries a question or plan block. If a `message_sent` event appears
 * before any pending block, the user has already answered — return null
 * so the bar dismisses without waiting on a server-side `sessionStatus`
 * flip (which can lag the question event by a tick on cold-open).
 *
 * Once a pending block is found, we keep scanning past `message_sent` to
 * see if any earlier plan block is still in play — answering a question
 * asked during plan mode must carry `interactionMode: "plan"` on the
 * response (matches web's `SessionDetailView` behavior).
 *
 * Mirrors the detection in `packages/client-core/src/session/nodes.ts` so
 * the bar always surfaces the same block the in-stream node represents.
 */
export function findMostRecentPendingInput(
  eventIds: string[],
  events: Record<string, Event>,
): PendingInputData | null {
  let latestQuestion: { eventId: string; questions: Question[]; timestamp: string } | null = null;
  let latestPlan: { eventId: string; planContent: string; timestamp: string } | null = null;

  for (let i = eventIds.length - 1; i >= 0; i--) {
    const id = eventIds[i];
    if (!id) continue;
    const ev = events[id];
    if (!ev) continue;
    if (ev.eventType === "message_sent") {
      if (!latestQuestion && !latestPlan) return null;
      continue;
    }
    if (ev.eventType !== "session_output") continue;
    const payload = asJsonObject(ev.payload);
    if (!payload || payload.type !== "assistant") continue;
    const message = asJsonObject(payload.message);
    const blocks = message?.content;
    if (!Array.isArray(blocks)) continue;
    for (const rawBlock of blocks) {
      const block = asJsonObject(rawBlock);
      if (!block) continue;
      if (block.type === "plan" && !latestPlan) {
        latestPlan = {
          eventId: ev.id,
          planContent: String(block.content ?? ""),
          timestamp: ev.timestamp,
        };
      } else if (block.type === "question" && !latestQuestion) {
        latestQuestion = {
          eventId: ev.id,
          questions: (Array.isArray(block.questions) ? block.questions : []).map(parseQuestion),
          timestamp: ev.timestamp,
        };
      }
    }
    if (latestQuestion && latestPlan) break;
  }

  if (!latestPlan && !latestQuestion) return null;

  // Plan wins when it's the most recent (or the only) pending block.
  if (latestPlan && (!latestQuestion || latestPlan.timestamp >= latestQuestion.timestamp)) {
    return { kind: "plan", ...latestPlan };
  }

  return {
    kind: "question",
    ...latestQuestion!,
    hasActivePlan: !!latestPlan,
  };
}
