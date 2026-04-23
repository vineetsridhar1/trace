import { describe, expect, it } from "vitest";
import type { Event } from "@trace/gql";
import { SessionEventBuffer, type PendingFetchedEvents } from "./session-events-buffer";

function makeEvent(id: string, timestamp: string): Event & { id: string } {
  return {
    id,
    timestamp,
    eventType: "message_sent",
    payload: {},
    scopeId: "session-1",
    scopeType: "session",
    actor: {
      id: "user-1",
      type: "user",
    },
  };
}

function makeFetched(ids: string[], oldestTimestamp: string): PendingFetchedEvents {
  return {
    events: ids.map((id, index) => makeEvent(id, `2026-04-22T00:00:0${index}Z`)),
    hasOlder: ids.length > 1,
    oldestTimestamp,
  };
}

describe("SessionEventBuffer", () => {
  it("drops a buffered fetch once that request has been invalidated", () => {
    const buffer = new SessionEventBuffer();
    const requestToken = buffer.beginFetch();

    buffer.invalidateFetches();

    expect(buffer.storeFetched(requestToken, makeFetched(["stale"], "2026-04-22T00:00:00Z"))).toBe(
      false,
    );
    expect(buffer.flush()).toEqual({
      fetched: null,
      error: null,
      liveEvents: [],
    });
  });

  it("keeps the newest overlapping fetch and ignores an older response that arrives later", () => {
    const buffer = new SessionEventBuffer();
    const olderRequest = buffer.beginFetch();
    const newerRequest = buffer.beginFetch();
    const newerFetched = makeFetched(["newer"], "2026-04-22T00:00:01Z");

    expect(buffer.storeFetched(newerRequest, newerFetched)).toBe(true);
    expect(buffer.storeFetched(olderRequest, makeFetched(["older"], "2026-04-22T00:00:00Z"))).toBe(
      false,
    );
    expect(buffer.flush()).toEqual({
      fetched: newerFetched,
      error: null,
      liveEvents: [],
    });
  });

  it("flushes buffered live events alongside the latest buffered fetch", () => {
    const buffer = new SessionEventBuffer();
    const requestToken = buffer.beginFetch();
    const pendingFetched = makeFetched(["page"], "2026-04-22T00:00:00Z");
    const liveEvent = makeEvent("live-1", "2026-04-22T00:00:02Z");

    expect(buffer.storeFetched(requestToken, pendingFetched)).toBe(true);
    buffer.storeLiveEvent(liveEvent);

    expect(buffer.flush()).toEqual({
      fetched: pendingFetched,
      error: null,
      liveEvents: [liveEvent],
    });
    expect(buffer.flush()).toEqual({
      fetched: null,
      error: null,
      liveEvents: [],
    });
  });

  it("replaces a buffered fetch with a buffered error for the same request", () => {
    const buffer = new SessionEventBuffer();
    const requestToken = buffer.beginFetch();

    expect(buffer.storeFetched(requestToken, makeFetched(["page"], "2026-04-22T00:00:00Z"))).toBe(
      true,
    );
    expect(buffer.storeError(requestToken, "network failed")).toBe(true);

    expect(buffer.flush()).toEqual({
      fetched: null,
      error: "network failed",
      liveEvents: [],
    });
  });
});
