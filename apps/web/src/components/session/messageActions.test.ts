import { describe, expect, it } from "vitest";
import { findMessageActionsEventIds } from "./messageActions";

function assistantText(text: string) {
  return {
    eventType: "session_output",
    payload: { type: "assistant", message: { content: [{ type: "text", text }] } },
  };
}

function assistantToolUse() {
  return {
    eventType: "session_output",
    payload: { type: "assistant", message: { content: [{ type: "tool_use", name: "Read" }] } },
  };
}

function userMessage(text: string) {
  return { eventType: "message_sent", payload: { text } };
}

function actionIds(eventIds: string[], events: Parameters<typeof findMessageActionsEventIds>[1]) {
  return [...findMessageActionsEventIds(eventIds, events)].sort();
}

describe("findMessageActionsEventIds", () => {
  it("marks the final assistant text after tool use in each user turn", () => {
    const events = {
      user1: userMessage("first"),
      intermediate1: assistantText("I will inspect files"),
      tool1: assistantToolUse(),
      final1: assistantText("Done with first"),
      user2: userMessage("second"),
      intermediate2: assistantText("Checking"),
      tool2: assistantToolUse(),
      final2: assistantText("Done with second"),
    };

    expect(
      actionIds(
        ["user1", "intermediate1", "tool1", "final1", "user2", "intermediate2", "tool2", "final2"],
        events,
      ),
    ).toEqual(["final1", "final2"]);
  });

  it("keeps consecutive assistant text replies final when no later tool use makes them intermediate", () => {
    const events = {
      user1: userMessage("first"),
      final1a: assistantText("Part one"),
      final1b: assistantText("Part two"),
      user2: userMessage("second"),
    };

    expect(actionIds(["user1", "final1a", "final1b", "user2"], events)).toEqual([
      "final1a",
      "final1b",
    ]);
  });

  it("keeps earlier completed assistant replies marked after the next user message", () => {
    const events = {
      user1: userMessage("first"),
      final1: assistantText("Done"),
      user2: userMessage("second"),
    };

    expect(actionIds(["user1", "final1", "user2"], events)).toEqual(["final1"]);
  });
});
