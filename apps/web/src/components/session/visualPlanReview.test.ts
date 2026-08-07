import type { Event } from "@trace/gql";
import { describe, expect, it } from "vitest";
import { findLatestTimelineInputRequest } from "./visualPlanReview";

function artifactEvent(id: string, type = "trace.visual-plan.v1"): Event {
  return {
    id: `event-${id}`,
    scopeType: "session",
    scopeId: "session-1",
    eventType: "artifact_created",
    payload: {
      artifact: {
        id,
        sessionId: "session-1",
        type,
        key: "primary",
        createdAt: `2026-08-02T00:00:0${id}.000Z`,
        manifest: {
          schemaVersion: 1,
          files: [
            {
              path: "implementation-approach.html",
              mediaType: "text/html",
              size: 1,
              digest: "digest",
            },
          ],
        },
      },
    },
    actor: { type: "agent", id: "agent-1", name: null, avatarUrl: null },
    parentId: null,
    timestamp: `2026-08-02T00:00:0${id}.000Z`,
    metadata: null,
  };
}

function questionEvent(id: string): Event {
  return {
    ...artifactEvent(id),
    id: `question-${id}`,
    eventType: "session_output",
    payload: {
      type: "assistant",
      message: { content: [{ type: "question", questions: [] }] },
    },
  };
}

function messageEvent(id: string): Event {
  return {
    ...artifactEvent(id),
    id: `message-${id}`,
    eventType: "message_sent",
    payload: { text: "Continue with a different direction" },
    actor: { type: "user", id: "user-1", name: null, avatarUrl: null },
  };
}

describe("findLatestTimelineInputRequest", () => {
  it("finds the newest plan directly from timeline events", () => {
    const first = artifactEvent("1");
    const image = artifactEvent("2", "trace.image.v1");
    const latest = artifactEvent("3");
    const events = { [first.id]: first, [image.id]: image, [latest.id]: latest };

    expect(findLatestTimelineInputRequest([first.id, image.id, latest.id], events)).toMatchObject({
      kind: "visual-plan",
      artifact: { id: "3" },
    });
  });

  it("returns the newer question instead of a historical plan", () => {
    const plan = artifactEvent("1");
    const question = questionEvent("2");

    expect(
      findLatestTimelineInputRequest([plan.id, question.id], {
        [plan.id]: plan,
        [question.id]: question,
      }),
    ).toEqual({ kind: "question" });
  });

  it("returns null when the timeline has no input request", () => {
    const image = artifactEvent("1", "trace.image.v1");

    expect(findLatestTimelineInputRequest([image.id], { [image.id]: image })).toBeNull();
  });

  it("keeps a question pending until a later user message makes it stale", () => {
    const question = questionEvent("1");
    const message = messageEvent("2");

    expect(
      findLatestTimelineInputRequest([question.id], {
        [question.id]: question,
      }),
    ).toEqual({ kind: "question" });
    expect(
      findLatestTimelineInputRequest([question.id, message.id], {
        [question.id]: question,
        [message.id]: message,
      }),
    ).toBeNull();
  });
});
