import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/redis.js", async () => {
  const { createRedisMock } = await import("../../test/helpers.js");
  return { redis: createRedisMock() };
});

import { redis } from "../lib/redis.js";
import { EventAggregator, buildScopeKey } from "./aggregator.js";

const redisMock = redis as any;

function event(overrides: Record<string, unknown> = {}) {
  return {
    id: "evt-1",
    organizationId: "org-1",
    scopeType: "chat",
    scopeId: "chat-1",
    eventType: "message_sent",
    actorType: "user",
    actorId: "user-1",
    payload: {},
    timestamp: "2026-03-21T00:00:00.000Z",
    ...overrides,
  };
}

describe("EventAggregator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    redisMock.scan.mockResolvedValue(["0", []]);
    redisMock.set.mockResolvedValue("OK");
    redisMock.del.mockResolvedValue(1);
    redisMock.get.mockResolvedValue(null);
  });

  it("builds scope keys for chat threads and generic scopes", () => {
    expect(buildScopeKey(event({ payload: { parentMessageId: "msg-1" } }))).toBe(
      "chat:chat-1:thread:msg-1",
    );
    expect(buildScopeKey(event({ scopeType: "ticket", scopeId: "ticket-1" }))).toBe(
      "ticket:ticket-1",
    );
    expect(buildScopeKey(event({ scopeType: "channel", scopeId: "channel-1" }))).toBe(
      "channel:channel-1",
    );
  });

  it("emits direct-routed events immediately", async () => {
    const batches: Array<{ closeReason: string; events: unknown[] }> = [];
    const aggregator = new EventAggregator((batch) => {
      batches.push(batch);
    });

    await aggregator.ingest(event(), {
      decision: "direct",
      reason: "mention",
      maxTier: 2,
    });

    expect(batches).toHaveLength(1);
    expect(batches[0]).toMatchObject({
      closeReason: "direct",
      maxTier: 2,
    });
  });

  it("aggregates events and closes windows on silence", async () => {
    vi.useFakeTimers();
    const batches: Array<{ closeReason: string; events: unknown[] }> = [];
    const aggregator = new EventAggregator((batch) => {
      batches.push(batch);
    });

    await aggregator.start();
    await aggregator.ingest(event(), {
      decision: "aggregate",
      reason: "aggregate:message_sent",
      maxTier: 3,
    });

    expect(aggregator.openWindowCount).toBe(1);
    await vi.advanceTimersByTimeAsync(30_000);

    expect(aggregator.openWindowCount).toBe(0);
    expect(batches).toHaveLength(1);
    expect(batches[0]).toMatchObject({
      closeReason: "silence",
      events: [expect.objectContaining({ id: "evt-1" })],
    });

    await aggregator.stop();
  });

  it("recovers persisted windows and immediately flushes expired ones", async () => {
    const batches: Array<{ closeReason: string; scopeKey: string }> = [];
    const aggregator = new EventAggregator((batch) => {
      batches.push(batch);
    });

    redisMock.scan.mockResolvedValueOnce(["0", ["agent:aggregator:window:org-1:chat:chat-1"]]);
    redisMock.get.mockResolvedValueOnce(
      JSON.stringify({
        scopeKey: "chat:chat-1",
        organizationId: "org-1",
        events: [event()],
        maxTier: 2,
        openedAt: Date.now() - 6 * 60 * 1000,
        lastEventAt: Date.now() - 6 * 60 * 1000,
      }),
    );

    await aggregator.start();

    expect(redisMock.del).toHaveBeenCalled();
    expect(batches).toHaveLength(1);
    expect(batches[0].closeReason).toBe("max_wall_clock");

    await aggregator.stop();
  });
});
