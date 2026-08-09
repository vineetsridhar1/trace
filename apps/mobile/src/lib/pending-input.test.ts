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

  it("clears a question after a newer user message", () => {
    const question = makeEvent("question", "session_output", "2026-08-08T00:00:00.000Z", {
      type: "assistant",
      message: {
        content: [
          {
            type: "question",
            questions: [
              {
                question: "Proceed?",
                header: "Confirmation",
                options: [{ id: "yes", label: "Yes" }],
              },
            ],
          },
        ],
      },
    });
    const answer = makeEvent("answer", "message_sent", "2026-08-08T00:01:00.000Z", {
      text: "Yes",
    });

    expect(
      findMostRecentPendingInput([question.id, answer.id], {
        [question.id]: question,
        [answer.id]: answer,
      }),
    ).toBeNull();
  });

  it("retains plan mode for a later unanswered question", () => {
    const plan = makeEvent("plan", "session_output", "2026-08-08T00:00:00.000Z", {
      type: "assistant",
      message: { content: [{ type: "plan", content: "Implementation plan" }] },
    });
    const question = makeEvent("question", "session_output", "2026-08-08T00:01:00.000Z", {
      type: "assistant",
      message: {
        content: [
          {
            type: "question",
            questions: [
              {
                question: "Proceed?",
                header: "Confirmation",
                options: [{ id: "yes", label: "Yes" }],
              },
            ],
          },
        ],
      },
    });

    expect(
      findMostRecentPendingInput([plan.id, question.id], {
        [plan.id]: plan,
        [question.id]: question,
      }),
    ).toMatchObject({ kind: "question", eventId: "question", hasActivePlan: true });
  });
});

function makeEvent(
  id: string,
  eventType: Event["eventType"],
  timestamp: string,
  payload: Event["payload"],
): Event {
  return {
    id,
    eventType,
    scopeType: "session",
    scopeId: "session-1",
    timestamp,
    parentId: null,
    metadata: null,
    actor: { type: "agent", id: "agent-1", name: null, avatarUrl: null },
    payload,
  };
}
