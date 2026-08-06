import type { Event } from "@trace/gql";
import type { SessionNode } from "./groupReadGlob";

export function findReplacedQuestionIds(
  nodes: readonly SessionNode[],
  events: Readonly<Record<string, Event | undefined>>,
): ReadonlySet<string> {
  const replaced = new Set<string>();
  let pendingQuestionId: string | null = null;

  for (const node of nodes) {
    if (node.kind === "ask-user-question") {
      if (pendingQuestionId) replaced.add(pendingQuestionId);
      pendingQuestionId = node.id;
      continue;
    }
    if (node.kind === "plan-review") {
      if (pendingQuestionId) replaced.add(pendingQuestionId);
      pendingQuestionId = null;
      continue;
    }
    if (node.kind === "event" && events[node.id]?.eventType === "message_sent") {
      pendingQuestionId = null;
    }
  }

  return replaced;
}
