import { describe, expect, it } from "vitest";
import type { Event } from "@trace/gql";
import type { SessionNode } from "./groupReadGlob";
import { buildCompactChatSummary } from "./compact-chat-summary";

function sessionEvent(id: string, eventType: Event["eventType"], payload: Event["payload"]): Event {
  return {
    id,
    scopeType: "session",
    scopeId: "session-1",
    eventType,
    payload,
    actor: { type: "agent", id: "agent-1", name: null, avatarUrl: null },
    parentId: null,
    timestamp: "2026-08-03T00:00:00.000Z",
    metadata: null,
  };
}

describe("buildCompactChatSummary", () => {
  it("shows only the latest user turn and its activity", () => {
    const events: Record<string, Event> = {
      user1: sessionEvent("user1", "message_sent", { text: "First request" }),
      answer1: sessionEvent("answer1", "session_output", {
        type: "assistant",
        message: { content: [{ type: "text", text: "First answer" }] },
      }),
      user2: sessionEvent("user2", "message_sent", { text: "Latest request" }),
      work2: sessionEvent("work2", "session_output", {
        type: "assistant",
        message: {
          content: [
            { type: "tool_use", name: "Read" },
            { type: "tool_use", name: "Edit" },
          ],
        },
      }),
      answer2: sessionEvent("answer2", "session_output", {
        type: "assistant",
        message: { content: [{ type: "text", text: "Latest answer" }] },
      }),
    };
    const nodes: SessionNode[] = ["user1", "answer1", "user2", "work2", "answer2"].map(
      (id) => ({ kind: "event", id }),
    );

    expect(buildCompactChatSummary(nodes, events)).toEqual({
      userText: "Latest request",
      assistantText: "Latest answer",
      actionCount: 2,
    });
  });

  it("counts grouped file reads as individual actions", () => {
    const nodes: SessionNode[] = [
      {
        kind: "readglob-group",
        items: [
          { id: "read1", toolName: "Read", filePath: "a.ts", timestamp: "" },
          { id: "read2", toolName: "Read", filePath: "b.ts", timestamp: "" },
        ],
      },
    ];

    expect(buildCompactChatSummary(nodes, {})).toEqual({
      userText: null,
      assistantText: null,
      actionCount: 2,
    });
  });
});
