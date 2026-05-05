import { describe, expect, it } from "vitest";
import type { Event } from "@trace/gql";
import { buildSessionNodes } from "../src/session/nodes.js";

function makeEvent(overrides: Partial<Event> = {}): Event {
  return {
    id: "event-1",
    scopeType: "session",
    scopeId: "session-1",
    eventType: "session_started",
    actorType: "user",
    actorId: "user-1",
    parentId: null,
    timestamp: "2026-01-01T00:00:00.000Z",
    metadata: {},
    payload: {},
    organizationId: "org-1",
    ...overrides,
  } as Event;
}

describe("buildSessionNodes", () => {
  it("keeps runtime move markers even without a prompt", () => {
    const event = makeEvent({
      payload: {
        type: "runtime_move",
        targetHosting: "cloud",
      },
    });

    const result = buildSessionNodes([event.id], { [event.id]: event });

    expect(result.nodes).toEqual([{ kind: "event", id: event.id }]);
  });

  it("still hides prompt-less session_started events without a move marker", () => {
    const event = makeEvent();

    const result = buildSessionNodes([event.id], { [event.id]: event });

    expect(result.nodes).toEqual([]);
  });
});
