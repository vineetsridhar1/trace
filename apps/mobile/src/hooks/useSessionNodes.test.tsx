import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it } from "vitest";
import { eventScopeKey, useEntityStore, type SessionNode } from "@trace/client-core";
import type { Event } from "@trace/gql";
import { useSessionNodes, type UseSessionNodesResult } from "./useSessionNodes";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const SESSION_ID = "session-1";
const SCOPE_KEY = eventScopeKey("session", SESSION_ID);

function makeEvent(
  id: string,
  timestamp: string,
  overrides: Partial<Event> = {},
): Event & { id: string } {
  return {
    id,
    timestamp,
    eventType: "message_sent",
    payload: { text: id },
    scopeId: SESSION_ID,
    scopeType: "session",
    actor: {
      id: "user-1",
      type: "user",
    },
    ...overrides,
  };
}

function upsertEvent(id: string, timestamp: string): void {
  const event = makeEvent(id, timestamp);
  useEntityStore.getState().upsertScopedEvent(SCOPE_KEY, event.id, event);
}

function upsertEventRecord(event: Event & { id: string }): void {
  useEntityStore.getState().upsertScopedEvent(SCOPE_KEY, event.id, event);
}

function eventNodeIds(nodes: SessionNode[] | undefined): string[] {
  return (nodes ?? []).flatMap((node) => (node.kind === "event" ? [node.id] : []));
}

function requireLatest(value: UseSessionNodesResult | null): UseSessionNodesResult {
  expect(value).not.toBeNull();
  return value as UseSessionNodesResult;
}

describe("useSessionNodes", () => {
  beforeEach(() => {
    useEntityStore.getState().reset();
  });

  it("keeps a stable snapshot while frozen and catches up when unfrozen", () => {
    let latest: UseSessionNodesResult | null = null;
    let renders = 0;

    function Probe({ frozen }: { frozen: boolean }) {
      latest = useSessionNodes(SESSION_ID, { frozen });
      renders += 1;
      return null;
    }

    upsertEvent("event-1", "2026-04-25T10:00:00.000Z");

    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<Probe frozen={false} />);
    });

    expect(eventNodeIds(requireLatest(latest).nodes)).toEqual(["event-1"]);

    act(() => {
      renderer.update(<Probe frozen={true} />);
    });

    const frozenSnapshot = requireLatest(latest);
    const frozenNodes = frozenSnapshot.nodes;
    const frozenEvents = frozenSnapshot.events;
    renders = 0;

    act(() => {
      upsertEvent("event-2", "2026-04-25T10:00:01.000Z");
    });

    expect(renders).toBe(0);
    expect(requireLatest(latest).nodes).toBe(frozenNodes);
    expect(requireLatest(latest).events).toBe(frozenEvents);
    expect(eventNodeIds(requireLatest(latest).nodes)).toEqual(["event-1"]);

    act(() => {
      renderer.update(<Probe frozen={false} />);
    });

    expect(eventNodeIds(requireLatest(latest).nodes)).toEqual(["event-1", "event-2"]);

    act(() => {
      renderer.unmount();
    });
  });

  it("keeps visible terminal and infrastructure rows after mobile render filtering", () => {
    let latest: UseSessionNodesResult | null = null;

    function Probe() {
      latest = useSessionNodes(SESSION_ID);
      return null;
    }

    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<Probe />);
    });

    act(() => {
      upsertEventRecord(
        makeEvent("message-1", "2026-04-25T10:00:00.000Z", {
          eventType: "message_sent",
          payload: { text: "hello" },
        }),
      );
      upsertEventRecord(
        makeEvent("error-1", "2026-04-25T10:00:01.000Z", {
          eventType: "session_output",
          payload: { type: "error", message: "runtime error" },
        }),
      );
      upsertEventRecord(
        makeEvent("recovery-1", "2026-04-25T10:00:02.000Z", {
          eventType: "session_output",
          payload: {
            type: "recovery_failed",
            reason: "home_runtime_offline",
            connection: { lastError: "OD4MPKT-M is offline" },
          },
        }),
      );
      upsertEventRecord(
        makeEvent("terminated-1", "2026-04-25T10:00:03.000Z", {
          eventType: "session_terminated",
          payload: { reason: "manual_stop", agentStatus: "done" },
        }),
      );
    });

    expect(eventNodeIds(requireLatest(latest).nodes)).toEqual([
      "message-1",
      "error-1",
      "recovery-1",
      "terminated-1",
    ]);

    act(() => {
      renderer.unmount();
    });
  });
});
