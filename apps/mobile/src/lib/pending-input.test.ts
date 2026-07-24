import { describe, expect, it } from "vitest";
import type { Event } from "@trace/gql";
import { findMostRecentPendingInput } from "./pending-input";

function makeEvent(id: string, eventType: string, payload: Record<string, unknown>): Event {
  return {
    id,
    scopeType: "session",
    scopeId: "session-1",
    eventType,
    actorType: "system",
    actorId: "system",
    parentId: null,
    timestamp: `2026-07-24T12:00:0${id.length}.000Z`,
    metadata: {},
    payload,
    organizationId: "org-1",
  } as unknown as Event;
}

describe("findMostRecentPendingInput", () => {
  it("surfaces a canonical plan file when it is ready", () => {
    const ready = makeEvent("ready", "session_output", {
      type: "plan_file_ready",
      planContent: "# Plan\n\n- Implement it",
    });

    expect(findMostRecentPendingInput([ready.id], { [ready.id]: ready })).toEqual({
      kind: "plan",
      eventId: "ready",
      planContent: "# Plan\n\n- Implement it",
      timestamp: ready.timestamp,
    });
  });

  it("dismisses the ready plan after a user response", () => {
    const ready = makeEvent("ready", "session_output", {
      type: "plan_file_ready",
      planContent: "# Plan",
    });
    const response = makeEvent("response", "message_sent", { text: "Approved" });

    expect(
      findMostRecentPendingInput([ready.id, response.id], {
        [ready.id]: ready,
        [response.id]: response,
      }),
    ).toBeNull();
  });
});
