import { describe, expect, it } from "vitest";
import type { Event } from "@trace/gql";
import { mergeCompactTailEventItems, type SessionTimelineDisplayItem } from "./useSessionEvents";

function sessionEvent(
  partial: Partial<Event> & { id: string; timestamp: string },
): Event & { id: string } {
  return {
    id: partial.id,
    scopeType: partial.scopeType ?? "session",
    scopeId: partial.scopeId ?? "session-1",
    eventType: partial.eventType ?? "session_output",
    payload: partial.payload ?? {},
    actor: partial.actor ?? {
      type: "agent",
      id: "agent-1",
      name: null,
      avatarUrl: null,
    },
    parentId: partial.parentId ?? null,
    timestamp: partial.timestamp,
    metadata: partial.metadata ?? null,
  };
}

describe("mergeCompactTailEventItems", () => {
  it("does not reinsert hidden thinking events from existing collapsed ranges", () => {
    const user = sessionEvent({
      id: "user-1",
      eventType: "message_sent",
      payload: { text: "Implement this" },
      timestamp: "2026-05-19T10:00:00.000Z",
    });
    const hiddenTool = sessionEvent({
      id: "hidden-tool",
      payload: {
        type: "assistant",
        message: {
          content: [{ type: "tool_use", id: "tool-1", name: "Read", input: {} }],
        },
      },
      timestamp: "2026-05-19T10:01:00.000Z",
    });
    const finalAssistant = sessionEvent({
      id: "assistant-final",
      payload: {
        type: "assistant",
        message: { content: [{ type: "text", text: "Done." }] },
      },
      timestamp: "2026-05-19T10:02:00.000Z",
    });
    const newMessage = sessionEvent({
      id: "user-2",
      eventType: "message_sent",
      payload: { text: "create pr" },
      timestamp: "2026-05-19T10:03:00.000Z",
    });
    const scopedEvents: Record<string, Event> = {
      [user.id]: user,
      [hiddenTool.id]: hiddenTool,
      [finalAssistant.id]: finalAssistant,
      [newMessage.id]: newMessage,
    };
    const current: SessionTimelineDisplayItem[] = [
      { kind: "event", id: user.id },
      {
        kind: "collapsed_events",
        id: "collapsed:user-1:assistant-final",
        collapsed: {
          id: "collapsed:user-1:assistant-final",
          startEventId: user.id,
          startTimestamp: user.timestamp,
          endEventId: finalAssistant.id,
          endTimestamp: finalAssistant.timestamp,
        },
      },
      { kind: "event", id: finalAssistant.id },
    ];

    const merged = mergeCompactTailEventItems(
      current,
      [hiddenTool, finalAssistant, newMessage],
      scopedEvents,
    );

    expect(merged.map((item) => item.id)).toEqual([
      user.id,
      "collapsed:user-1:assistant-final",
      finalAssistant.id,
      newMessage.id,
    ]);
  });

  it("keeps compact items unchanged when a live refresh has no tail events", () => {
    const user = sessionEvent({
      id: "user-1",
      eventType: "message_sent",
      payload: { text: "Implement this" },
      timestamp: "2026-05-19T10:00:00.000Z",
    });
    const finalAssistant = sessionEvent({
      id: "assistant-final",
      payload: {
        type: "assistant",
        message: { content: [{ type: "text", text: "Done." }] },
      },
      timestamp: "2026-05-19T10:02:00.000Z",
    });
    const current: SessionTimelineDisplayItem[] = [
      { kind: "event", id: user.id },
      { kind: "event", id: finalAssistant.id },
    ];

    const merged = mergeCompactTailEventItems(current, [user, finalAssistant], {
      [user.id]: user,
      [finalAssistant.id]: finalAssistant,
    });

    expect(merged).toBe(current);
  });
});
