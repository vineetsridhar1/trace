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

function makeEvent(id: string, timestamp: string): Event & { id: string } {
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
  };
}

function upsertEvent(id: string, timestamp: string): void {
  const event = makeEvent(id, timestamp);
  useEntityStore.getState().upsertScopedEvent(SCOPE_KEY, event.id, event);
}

function eventNodeIds(nodes: SessionNode[] | undefined): string[] {
  return (nodes ?? []).flatMap((node) => (node.kind === "event" ? [node.id] : []));
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

    expect(eventNodeIds(latest?.nodes)).toEqual(["event-1"]);

    act(() => {
      renderer.update(<Probe frozen={true} />);
    });

    const frozenNodes = latest?.nodes;
    const frozenEvents = latest?.events;
    renders = 0;

    act(() => {
      upsertEvent("event-2", "2026-04-25T10:00:01.000Z");
    });

    expect(renders).toBe(0);
    expect(latest?.nodes).toBe(frozenNodes);
    expect(latest?.events).toBe(frozenEvents);
    expect(eventNodeIds(latest?.nodes)).toEqual(["event-1"]);

    act(() => {
      renderer.update(<Probe frozen={false} />);
    });

    expect(eventNodeIds(latest?.nodes)).toEqual(["event-1", "event-2"]);
  });
});
