import React, { useRef } from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionNode } from "@trace/client-core";
import { useNewActivityTracker } from "./useNewActivityTracker";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

type UseNewActivityTrackerResult = ReturnType<typeof useNewActivityTracker>;

function eventNode(id: string): SessionNode {
  return { kind: "event", id };
}

interface ProbeProps {
  nodes: SessionNode[];
  followLatest: boolean;
  scrollToEnd: (params?: { animated?: boolean }) => void;
  onResult: (result: UseNewActivityTrackerResult) => void;
}

function Probe({ nodes, followLatest, scrollToEnd, onResult }: ProbeProps) {
  const listRef = useRef({ scrollToEnd });
  const followLatestRef = useRef(followLatest);
  listRef.current = { scrollToEnd };
  followLatestRef.current = followLatest;
  onResult(useNewActivityTracker(nodes, listRef, followLatestRef));
  return null;
}

function requireLatest(result: UseNewActivityTrackerResult | null): UseNewActivityTrackerResult {
  expect(result).not.toBeNull();
  return result as UseNewActivityTrackerResult;
}

describe("useNewActivityTracker", () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn((callback: FrameRequestCallback) => {
        callback(0);
        return 1;
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("scrolls to the new tail while following latest output", () => {
    const scrollToEnd = vi.fn();
    let latest: ReturnType<typeof useNewActivityTracker> | null = null;

    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <Probe
          nodes={[eventNode("event-1")]}
          followLatest={true}
          scrollToEnd={scrollToEnd}
          onResult={(result) => {
            latest = result;
          }}
        />,
      );
    });

    act(() => {
      renderer.update(
        <Probe
          nodes={[eventNode("event-1"), eventNode("event-2")]}
          followLatest={true}
          scrollToEnd={scrollToEnd}
          onResult={(result) => {
            latest = result;
          }}
        />,
      );
    });

    expect(scrollToEnd).toHaveBeenCalledWith({ animated: true });
    expect(requireLatest(latest).newActivityCount).toBe(0);
  });

  it("counts new tail activity without scrolling when follow mode is paused", () => {
    const scrollToEnd = vi.fn();
    let latest: ReturnType<typeof useNewActivityTracker> | null = null;

    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <Probe
          nodes={[eventNode("event-1")]}
          followLatest={false}
          scrollToEnd={scrollToEnd}
          onResult={(result) => {
            latest = result;
          }}
        />,
      );
    });

    act(() => {
      renderer.update(
        <Probe
          nodes={[eventNode("event-1"), eventNode("event-2")]}
          followLatest={false}
          scrollToEnd={scrollToEnd}
          onResult={(result) => {
            latest = result;
          }}
        />,
      );
    });

    expect(scrollToEnd).not.toHaveBeenCalled();
    expect(requireLatest(latest).newActivityCount).toBe(1);
  });

  it("ignores prepended older events because the tail did not change", () => {
    const scrollToEnd = vi.fn();
    let latest: ReturnType<typeof useNewActivityTracker> | null = null;

    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <Probe
          nodes={[eventNode("event-2")]}
          followLatest={false}
          scrollToEnd={scrollToEnd}
          onResult={(result) => {
            latest = result;
          }}
        />,
      );
    });

    act(() => {
      renderer.update(
        <Probe
          nodes={[eventNode("event-1"), eventNode("event-2")]}
          followLatest={false}
          scrollToEnd={scrollToEnd}
          onResult={(result) => {
            latest = result;
          }}
        />,
      );
    });

    expect(scrollToEnd).not.toHaveBeenCalled();
    expect(requireLatest(latest).newActivityCount).toBe(0);
  });
});
