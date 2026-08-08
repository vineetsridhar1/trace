import type { Event } from "@trace/gql";
import type { SessionNode } from "./groupReadGlob";
import { describe, expect, it } from "vitest";
import { findActiveQuestion, findReplacedQuestionIds } from "./questionHistory";

function question(id: string): SessionNode {
  return { kind: "ask-user-question", id, questions: [], timestamp: "2026-08-06T00:00:00Z" };
}

function message(id: string): Event {
  return {
    id,
    scopeType: "session",
    scopeId: "session-1",
    eventType: "message_sent",
    payload: { text: "Answer" },
    actor: { type: "user", id: "user-1", name: null, avatarUrl: null },
    parentId: null,
    timestamp: "2026-08-06T00:00:00Z",
    metadata: null,
  };
}

describe("findReplacedQuestionIds", () => {
  it("marks an unanswered question replaced regardless of reused request ids", () => {
    const nodes: SessionNode[] = [question("first"), question("second")];

    expect(findReplacedQuestionIds(nodes, {})).toEqual(new Set(["first"]));
  });

  it("does not mark a question replaced after the user answers it", () => {
    const userMessage = message("answer");
    const nodes: SessionNode[] = [
      question("first"),
      { kind: "event", id: userMessage.id },
      question("second"),
    ];

    expect(findReplacedQuestionIds(nodes, { [userMessage.id]: userMessage })).toEqual(new Set());
  });
});

describe("findActiveQuestion", () => {
  it("keeps a pending question resumable only while the session needs input", () => {
    const nodes: SessionNode[] = [question("pending")];

    expect(findActiveQuestion(nodes, "needs_input", "question")).toMatchObject({
      node: { id: "pending" },
      index: 0,
    });
    expect(findActiveQuestion(nodes, "in_progress", "question")).toBeNull();
  });
});
