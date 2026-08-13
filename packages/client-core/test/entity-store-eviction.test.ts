import { beforeEach, describe, expect, it } from "vitest";
import type { Event } from "@trace/gql";
import {
  MAX_EVENT_SCOPES,
  retainScopedEvents,
  useEntityStore,
} from "../src/stores/entity.js";

function event(id: string, timestamp: string, parentId?: string): Event & { id: string } {
  return {
    id,
    eventType: "message_sent",
    scopeType: "session",
    scopeId: "session-1",
    timestamp,
    payload: {},
    actor: { id: "user-1", type: "user", name: "Test user", avatarUrl: null },
    metadata: {},
    parentId: parentId ?? null,
  } as Event & { id: string };
}

describe("scoped event cache eviction", () => {
  beforeEach(() => useEntityStore.getState().reset());

  it("preserves older paginated events in an active scope", () => {
    const scopeKey = "session:session-1";
    const eventCount = 2_001;
    for (let index = 0; index < eventCount; index++) {
      const id = `event-${String(index).padStart(4, "0")}`;
      useEntityStore
        .getState()
        .upsertScopedEvent(
          scopeKey,
          id,
          event(id, new Date(index * 1_000).toISOString(), "parent-1"),
        );
    }

    const state = useEntityStore.getState();
    expect(Object.keys(state.eventsByScope[scopeKey] ?? {})).toHaveLength(eventCount);
    expect(state.eventsByScope[scopeKey]?.["event-0000"]).toBeDefined();
    expect(state._eventIdsByParentId["parent-1"]).toContain("event-0000");
  });

  it("evicts the least recently touched inactive scope when scope capacity is exceeded", () => {
    for (let index = 0; index <= MAX_EVENT_SCOPES; index++) {
      const scopeKey = `session:session-${index}`;
      const id = `event-${index}`;
      useEntityStore
        .getState()
        .upsertScopedEvent(scopeKey, id, event(id, new Date(index * 1_000).toISOString()));
    }

    const buckets = useEntityStore.getState().eventsByScope;
    expect(Object.keys(buckets)).toHaveLength(MAX_EVENT_SCOPES);
    expect(buckets["session:session-0"]).toBeUndefined();
    expect(buckets[`session:session-${MAX_EVENT_SCOPES}`]).toBeDefined();
  });

  it("does not evict a retained scope", () => {
    const release = retainScopedEvents("session:retained");
    for (let index = 0; index <= MAX_EVENT_SCOPES; index++) {
      const scopeKey = index === 0 ? "session:retained" : `session:session-${index}`;
      const id = `event-${index}`;
      useEntityStore
        .getState()
        .upsertScopedEvent(scopeKey, id, event(id, new Date(index * 1_000).toISOString()));
    }

    expect(useEntityStore.getState().eventsByScope["session:retained"]).toBeDefined();
    release();
  });
});
