import { afterEach, describe, expect, it, vi } from "vitest";
import type WebSocket from "ws";
import { SessionRouter } from "./session-router.js";

function makeWs() {
  return {
    OPEN: 1,
    readyState: 1,
    send: vi.fn(),
  } as unknown as WebSocket;
}

describe("SessionRouter stale runtime eviction", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not evict a runtime that reconnected after the stale snapshot", () => {
    const router = new SessionRouter();
    const now = vi.spyOn(Date, "now");

    now.mockReturnValue(0);
    router.registerRuntime({
      id: "runtime-1",
      label: "Laptop",
      ws: makeWs(),
      hostingMode: "local",
      supportedTools: ["codex"],
    });
    router.bindSession("session-1", "runtime-1");

    now.mockReturnValue(SessionRouter.HEARTBEAT_TIMEOUT_MS + 1);
    const [stale] = router.checkStaleRuntimes();
    expect(stale).toMatchObject({
      runtimeId: "runtime-1",
      sessionIds: ["session-1"],
      lastHeartbeat: 0,
    });

    const reconnectedWs = makeWs();
    now.mockReturnValue(SessionRouter.HEARTBEAT_TIMEOUT_MS + 2);
    router.registerRuntime({
      id: "runtime-1",
      label: "Laptop",
      ws: reconnectedWs,
      hostingMode: "local",
      supportedTools: ["codex"],
    });

    const eviction = router.evictRuntimeIfStale(stale.runtimeId, stale.lastHeartbeat);
    expect(eviction).toEqual({ evicted: false, affectedSessions: [] });
    expect(router.getRuntime("runtime-1")?.ws).toBe(reconnectedWs);
    expect(router.getRuntimeForSession("session-1")?.id).toBe("runtime-1");
  });

  it("evicts a runtime when the same stale instance is still present", () => {
    const router = new SessionRouter();
    const now = vi.spyOn(Date, "now");

    now.mockReturnValue(0);
    router.registerRuntime({
      id: "runtime-1",
      label: "Laptop",
      ws: makeWs(),
      hostingMode: "local",
      supportedTools: ["codex"],
    });
    router.bindSession("session-1", "runtime-1");

    now.mockReturnValue(SessionRouter.HEARTBEAT_TIMEOUT_MS + 1);
    const [stale] = router.checkStaleRuntimes();
    const eviction = router.evictRuntimeIfStale(stale.runtimeId, stale.lastHeartbeat);

    expect(eviction).toEqual({ evicted: true, affectedSessions: ["session-1"] });
    expect(router.getRuntime("runtime-1")).toBeUndefined();
    expect(router.getRuntimeForSession("session-1")).toBeUndefined();
  });

  it("reports eviction even when the stale runtime had no bound sessions", () => {
    const router = new SessionRouter();
    const now = vi.spyOn(Date, "now");

    now.mockReturnValue(0);
    router.registerRuntime({
      id: "runtime-1",
      label: "Laptop",
      ws: makeWs(),
      hostingMode: "local",
      supportedTools: ["codex"],
    });

    now.mockReturnValue(SessionRouter.HEARTBEAT_TIMEOUT_MS + 1);
    const [stale] = router.checkStaleRuntimes();
    const eviction = router.evictRuntimeIfStale(stale.runtimeId, stale.lastHeartbeat);

    expect(eviction).toEqual({ evicted: true, affectedSessions: [] });
    expect(router.getRuntime("runtime-1")).toBeUndefined();
  });
});
