import { describe, expect, it } from "vitest";
import type { Event } from "@trace/gql";
import { findMostRecentPendingInput } from "./pending-input";

describe("findMostRecentPendingInput", () => {
  it("surfaces portable Trace questions emitted in text blocks", () => {
    const event: Event = {
      id: "question-event",
      eventType: "session_output",
      scopeType: "session",
      scopeId: "session-1",
      timestamp: "2026-08-08T00:00:00.000Z",
      parentId: null,
      metadata: null,
      actor: { type: "agent", id: "agent-1", name: null, avatarUrl: null },
      payload: {
        type: "assistant",
        message: {
          content: [
            {
              type: "text",
              text: '<trace:request-input id="season" type="single-select"><header>Single choice</header><question>Pick a favorite season.</question><option id="spring" description="Mild weather.">Spring</option></trace:request-input>',
            },
          ],
        },
      },
    };

    expect(findMostRecentPendingInput([event.id], { [event.id]: event })).toMatchObject({
      kind: "question",
      questions: [{ id: "season", question: "Pick a favorite season." }],
    });
  });
});
