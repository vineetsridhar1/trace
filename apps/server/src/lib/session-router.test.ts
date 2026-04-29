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

describe("SessionRouter runtime-pinned bridge responses", () => {
  it("ignores branch responses from a runtime that did not receive the request", async () => {
    const router = new SessionRouter();
    const ws = makeWs();

    router.registerRuntime({
      id: "runtime-1",
      label: "Laptop",
      ws,
      hostingMode: "local",
      supportedTools: ["codex"],
    });
    router.registerRuntime({
      id: "runtime-2",
      label: "Other laptop",
      ws: makeWs(),
      hostingMode: "local",
      supportedTools: ["codex"],
    });

    const promise = router.listBranches("runtime-1", "repo-1");
    const send = ws.send as unknown as ReturnType<typeof vi.fn>;
    const command = JSON.parse(send.mock.calls[0]?.[0] as string) as { requestId: string };

    let settled = false;
    promise.then(() => {
      settled = true;
    });

    router.resolveBranchRequest(command.requestId, ["spoofed"], undefined, "runtime-2");
    await Promise.resolve();
    expect(settled).toBe(false);

    router.resolveBranchRequest(command.requestId, ["main"], undefined, "runtime-1");
    await expect(promise).resolves.toEqual(["main"]);
  });
});

describe("SessionRouter runtime adapter dispatch", () => {
  it("starts local sessions through the registry and keeps prepare delivery on the bridge", async () => {
    const router = new SessionRouter();
    const ws = makeWs();

    router.registerRuntime({
      id: "runtime-1",
      label: "Laptop",
      ws,
      hostingMode: "local",
      supportedTools: ["codex"],
      registeredRepoIds: ["repo-1"],
    });
    router.bindSession("session-1", "runtime-1");

    const failures: string[] = [];
    router.createRuntime({
      sessionId: "session-1",
      sessionGroupId: "group-1",
      hosting: "local",
      adapterType: "local",
      tool: "codex",
      repo: {
        id: "repo-1",
        name: "repo",
        remoteUrl: "https://github.com/acme/repo.git",
        defaultBranch: "main",
      },
      branch: "feature",
      createdById: "user-1",
      organizationId: "org-1",
      onFailed: (error) => failures.push(error),
    });

    await Promise.resolve();

    expect(failures).toEqual([]);
    const send = ws.send as unknown as ReturnType<typeof vi.fn>;
    expect(send).toHaveBeenCalledTimes(1);
    expect(JSON.parse(send.mock.calls[0]?.[0] as string)).toMatchObject({
      type: "prepare",
      sessionId: "session-1",
      sessionGroupId: "group-1",
      repoId: "repo-1",
      branch: "feature",
    });
  });
});
