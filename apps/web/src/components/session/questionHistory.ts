import type { Event } from "@trace/gql";
import type { SessionNode } from "./groupReadGlob";

export function findActiveQuestion(
  nodes: readonly SessionNode[],
  sessionStatus: string | undefined,
  latestInputKind: "question" | "native-plan" | "visual-plan" | null,
): { node: Extract<SessionNode, { kind: "ask-user-question" }>; index: number } | null {
  if (sessionStatus !== "needs_input" || latestInputKind !== "question") return null;
  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    const node = nodes[index];
    if (node.kind === "ask-user-question") return { node, index };
  }
  return null;
}

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
