import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Event } from "@trace/gql";
import {
  beginLatencyInteraction,
  clearLatencySamples,
  expectLatencyEvent,
  markLatencyEventHandled,
  markLatencyEventReceived,
  recentLatencySamples,
  recordLatencyMark,
  registerLatencyClientMutation,
  summarizeLatencySamples,
} from "../src/latency.js";

function makeEvent(init?: Partial<Event>): Event {
  return {
    id: init?.id ?? "event-1",
    scopeType: init?.scopeType ?? "session",
    scopeId: init?.scopeId ?? "session-1",
    eventType: init?.eventType ?? "message_sent",
    payload: init?.payload ?? {},
    actor: init?.actor ?? { type: "user", id: "user-1", name: null, avatarUrl: null },
    parentId: init?.parentId ?? null,
    timestamp: init?.timestamp ?? "2026-01-01T00:00:00.000Z",
    metadata: init?.metadata ?? null,
  } as Event;
}

beforeEach(() => {
  clearLatencySamples();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
});

describe("latency instrumentation", () => {
  it("correlates subscription and store-flush marks by clientMutationId", () => {
    const interactionId = beginLatencyInteraction("send-session-message", { sessionId: "s1" });
    registerLatencyClientMutation("cmid-1", interactionId);
    recordLatencyMark(interactionId, "optimistic-store-write");

    const event = makeEvent({ payload: { clientMutationId: "cmid-1" } });
    markLatencyEventReceived(event, "session");
    markLatencyEventHandled(event, 1.23);

    expect(recentLatencySamples().map((sample) => sample.phase)).toEqual([
      "submit",
      "optimistic-store-write",
      "subscription-event-received",
      "event-handler-store-flush",
    ]);
    expect(recentLatencySamples().at(-1)?.meta).toMatchObject({ handlerMs: 1.23 });
  });

  it("correlates events by expected scope and event type when no clientMutationId exists", () => {
    const interactionId = beginLatencyInteraction("rename-session-group");
    expectLatencyEvent({
      interactionId,
      action: "rename-session-group",
      scopeType: "session",
      eventType: "session_group_renamed",
    });

    markLatencyEventReceived(
      makeEvent({ eventType: "session_group_renamed", payload: { sessionGroupId: "group-1" } }),
      "org",
    );

    expect(recentLatencySamples().map((sample) => sample.phase)).toEqual([
      "submit",
      "subscription-event-received",
    ]);
  });

  it("summarizes p95 marks by action", () => {
    const first = beginLatencyInteraction("start-session");
    recordLatencyMark(first, "optimistic-store-write");
    recordLatencyMark(first, "event-handler-store-flush");
    const second = beginLatencyInteraction("start-session");
    recordLatencyMark(second, "optimistic-store-write");
    recordLatencyMark(second, "event-handler-store-flush");

    expect(summarizeLatencySamples()).toEqual([
      expect.objectContaining({
        action: "start-session",
        count: 2,
        optimisticP95Ms: expect.any(Number),
        canonicalP95Ms: expect.any(Number),
      }),
    ]);
  });
});
