import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./db.js", async () => {
  const { createPrismaMock } = await import("../../test/helpers.js");
  return { prisma: createPrismaMock() };
});

import type WebSocket from "ws";
import { prisma } from "./db.js";
import { SessionRouter } from "./session-router.js";
import { RuntimeAdapterRegistry, type RuntimeAdapter } from "./runtime-adapter-registry.js";
import type { createPrismaMock } from "../../test/helpers.js";

const prismaMock = prisma as unknown as ReturnType<typeof createPrismaMock>;

function makeWs() {
  return {
    OPEN: 1,
    readyState: 1,
    send: vi.fn(),
  } as unknown as WebSocket;
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}

afterEach(() => {
  vi.useRealTimers();
});

describe("SessionRouter stale runtime eviction", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
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
  it("waits for a prebound provisioned runtime to register before resolving bridge readiness", async () => {
    const router = new SessionRouter();
    router.bindSession("session-1", "runtime-1");

    let settled = false;
    const promise = router.waitForBridge("session-1", 1_000, "runtime-1");
    promise.then(() => {
      settled = true;
    });

    await Promise.resolve();
    expect(settled).toBe(false);

    router.registerRuntime({
      id: "runtime-1",
      label: "Provisioned runtime",
      ws: makeWs(),
      hostingMode: "cloud",
      supportedTools: ["codex"],
    });
    router.bindSession("session-1", "runtime-1");

    await expect(promise).resolves.toBeUndefined();
    expect(settled).toBe(true);
  });

  it("keeps a stale bridge wait timeout from clearing a newer wait", async () => {
    vi.useFakeTimers();
    const router = new SessionRouter();
    const staleWait = router
      .waitForBridge("session-1", 100, "runtime-old")
      .catch((error: unknown) => error);
    const activeWait = router.waitForBridge("session-1", 1_000, "runtime-new");

    await vi.advanceTimersByTimeAsync(100);
    await expect(staleWait).resolves.toBeInstanceOf(Error);

    router.registerRuntime({
      id: "runtime-new",
      label: "Provisioned runtime",
      ws: makeWs(),
      hostingMode: "cloud",
      supportedTools: ["codex"],
    });
    router.bindSession("session-1", "runtime-new");

    await expect(activeWait).resolves.toBeUndefined();
  });

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

  it("does not let local environment config override the authorized bound runtime", async () => {
    const router = new SessionRouter();
    const authorizedWs = makeWs();
    const configuredWs = makeWs();

    router.registerRuntime({
      id: "runtime-authorized",
      label: "Authorized laptop",
      ws: authorizedWs,
      hostingMode: "local",
      supportedTools: ["codex"],
      registeredRepoIds: ["repo-1"],
    });
    router.registerRuntime({
      id: "runtime-from-config",
      label: "Config laptop",
      ws: configuredWs,
      hostingMode: "local",
      supportedTools: ["codex"],
      registeredRepoIds: ["repo-1"],
    });
    router.bindSession("session-1", "runtime-authorized");

    router.createRuntime({
      sessionId: "session-1",
      sessionGroupId: "group-1",
      hosting: "local",
      adapterType: "local",
      environment: {
        id: "env-1",
        name: "Local",
        adapterType: "local",
        config: { runtimeInstanceId: "runtime-from-config" },
      },
      tool: "codex",
      repo: {
        id: "repo-1",
        name: "repo",
        remoteUrl: "https://github.com/acme/repo.git",
        defaultBranch: "main",
      },
      createdById: "user-1",
      organizationId: "org-1",
      onFailed: vi.fn(),
    });

    await Promise.resolve();

    expect(router.getRuntimeForSession("session-1")?.id).toBe("runtime-authorized");
    expect(authorizedWs.send).toHaveBeenCalledTimes(1);
    expect(configuredWs.send).not.toHaveBeenCalled();
  });

  it("delegates provisioned startup through the injected adapter registry", async () => {
    const provisionedStart = vi.fn().mockResolvedValue({ status: "provisioning" });
    const provisionedAdapter: RuntimeAdapter = {
      type: "provisioned",
      async validateConfig() {},
      async testConfig() {
        return { ok: true };
      },
      startSession: provisionedStart,
      async stopSession() {
        return { ok: true, status: "stopping" };
      },
      async getStatus() {
        return { status: "provisioning" };
      },
    };
    const localAdapter: RuntimeAdapter = {
      type: "local",
      async validateConfig() {},
      async testConfig() {
        return { ok: true };
      },
      async startSession() {
        return { status: "selected" };
      },
      async stopSession() {
        return { ok: true, status: "stopped" };
      },
      async getStatus() {
        return { status: "unknown" };
      },
    };
    const router = new SessionRouter(
      new RuntimeAdapterRegistry([localAdapter, provisionedAdapter]),
    );

    router.createRuntime({
      sessionId: "session-1",
      hosting: "cloud",
      adapterType: "provisioned",
      tool: "codex",
      model: "gpt-test",
      repo: null,
      createdById: "user-1",
      organizationId: "org-1",
      runtimeToken: "runtime-token",
      bridgeUrl: "wss://trace.example/bridge",
      onFailed: vi.fn(),
      onWorkspaceReady: vi.fn(),
    });

    await Promise.resolve();

    expect(provisionedStart).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "session-1",
        organizationId: "org-1",
        actorId: "user-1",
        tool: "codex",
        model: "gpt-test",
        runtimeInstanceId: expect.stringMatching(/^runtime_/),
        runtimeToken: "runtime-token",
        bridgeUrl: "wss://trace.example/bridge",
      }),
    );
  });

  it("emits provisioned lifecycle events only after bridge readiness", async () => {
    const callOrder: string[] = [];
    const provisionedAdapter: RuntimeAdapter = {
      type: "provisioned",
      async validateConfig() {},
      async testConfig() {
        return { ok: true };
      },
      async startSession(input) {
        callOrder.push("adapter_start");
        return {
          runtimeInstanceId: input.runtimeInstanceId ?? "runtime-1",
          runtimeLabel: "Provisioned runtime",
          providerRuntimeId: "provider-1",
          providerRuntimeUrl: "https://runtime.example",
          status: "provisioning",
        };
      },
      async stopSession() {
        return { ok: true, status: "stopping" };
      },
      async getStatus() {
        return { status: "provisioning" };
      },
    };
    const localAdapter: RuntimeAdapter = {
      type: "local",
      async validateConfig() {},
      async testConfig() {
        return { ok: true };
      },
      async startSession() {
        return { status: "selected" };
      },
      async stopSession() {
        return { ok: true, status: "stopped" };
      },
      async getStatus() {
        return { status: "unknown" };
      },
    };
    const router = new SessionRouter(
      new RuntimeAdapterRegistry([localAdapter, provisionedAdapter]),
    );
    const lifecycleEvents: Array<{ eventType: string; runtimeInstanceId?: string }> = [];

    router.createRuntime({
      sessionId: "session-1",
      hosting: "cloud",
      adapterType: "provisioned",
      environment: {
        id: "env-1",
        name: "Provisioned",
        adapterType: "provisioned",
        config: { startupTimeoutSeconds: 5 },
      },
      tool: "codex",
      repo: null,
      createdById: "user-1",
      organizationId: "org-1",
      onLifecycle: (eventType, update) => {
        callOrder.push(eventType);
        lifecycleEvents.push({ eventType, runtimeInstanceId: update?.runtimeInstanceId });
      },
      onFailed: vi.fn(),
    });

    await vi.waitFor(() => {
      expect(lifecycleEvents.map((event) => event.eventType)).toEqual([
        "session_runtime_start_requested",
        "session_runtime_provisioning",
        "session_runtime_connecting",
      ]);
    });
    expect(callOrder.slice(0, 2)).toEqual(["session_runtime_start_requested", "adapter_start"]);
    const runtimeInstanceId = lifecycleEvents[0]?.runtimeInstanceId;
    if (!runtimeInstanceId) throw new Error("Expected runtime instance ID");
    expect(runtimeInstanceId).toMatch(/^runtime_/);
    expect(lifecycleEvents[1]?.runtimeInstanceId).toBe(runtimeInstanceId);
    expect(lifecycleEvents[2]?.runtimeInstanceId).toBe(runtimeInstanceId);
    expect(router.getRuntimeForSession("session-1")).toBeUndefined();

    router.registerRuntime({
      id: runtimeInstanceId,
      label: "Provisioned runtime",
      ws: makeWs(),
      hostingMode: "cloud",
      supportedTools: ["codex"],
    });
    router.bindSession("session-1", runtimeInstanceId);

    await vi.waitFor(() => {
      expect(lifecycleEvents.map((event) => event.eventType)).toEqual([
        "session_runtime_start_requested",
        "session_runtime_provisioning",
        "session_runtime_connecting",
        "session_runtime_connected",
      ]);
    });
  });

  it("times out startup using environment config and emits timed_out", async () => {
    vi.useFakeTimers();
    const provisionedAdapter: RuntimeAdapter = {
      type: "provisioned",
      async validateConfig() {},
      async testConfig() {
        return { ok: true };
      },
      async startSession(input) {
        return {
          runtimeInstanceId: input.runtimeInstanceId ?? "runtime-1",
          status: "provisioning",
        };
      },
      async stopSession() {
        return { ok: true, status: "stopping" };
      },
      async getStatus() {
        return { status: "provisioning" };
      },
    };
    const localAdapter: RuntimeAdapter = {
      type: "local",
      async validateConfig() {},
      async testConfig() {
        return { ok: true };
      },
      async startSession() {
        return { status: "selected" };
      },
      async stopSession() {
        return { ok: true, status: "stopped" };
      },
      async getStatus() {
        return { status: "unknown" };
      },
    };
    const router = new SessionRouter(
      new RuntimeAdapterRegistry([localAdapter, provisionedAdapter]),
    );
    const onFailed = vi.fn();
    const lifecycleEvents: Array<{
      eventType: string;
      runtimeInstanceId?: string;
      error?: string;
    }> = [];

    router.createRuntime({
      sessionId: "session-1",
      hosting: "cloud",
      adapterType: "provisioned",
      environment: {
        id: "env-1",
        name: "Provisioned",
        adapterType: "provisioned",
        config: { startupTimeoutSeconds: 1 },
      },
      tool: "codex",
      repo: null,
      createdById: "user-1",
      organizationId: "org-1",
      onLifecycle: (eventType, update) => {
        lifecycleEvents.push({
          eventType,
          runtimeInstanceId: update?.runtimeInstanceId,
          error: update?.error,
        });
      },
      onFailed,
    });

    await flushPromises();
    expect(lifecycleEvents.map((event) => event.eventType)).toEqual([
      "session_runtime_start_requested",
      "session_runtime_provisioning",
      "session_runtime_connecting",
    ]);

    await vi.advanceTimersByTimeAsync(999);
    expect(onFailed).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    await flushPromises();

    expect(lifecycleEvents.map((event) => event.eventType)).toEqual([
      "session_runtime_start_requested",
      "session_runtime_provisioning",
      "session_runtime_connecting",
      "session_runtime_start_timed_out",
    ]);
    expect(lifecycleEvents[3]?.runtimeInstanceId).toBe(lifecycleEvents[0]?.runtimeInstanceId);
    expect(lifecycleEvents[3]?.error).toContain("1000ms");
    expect(onFailed).toHaveBeenCalledWith(expect.stringContaining("timed out"));
  });

  it("keeps multiple terminal commands multiplexed by terminalId after adapter routing", async () => {
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

    router.createRuntime({
      sessionId: "session-1",
      hosting: "local",
      adapterType: "local",
      tool: "codex",
      repo: null,
      createdById: "user-1",
      organizationId: "org-1",
      onFailed: vi.fn(),
    });

    await Promise.resolve();

    expect(
      router.send("session-1", {
        type: "terminal_create",
        terminalId: "term-1",
        sessionId: "session-1",
        cols: 80,
        rows: 24,
        cwd: "/repo",
      }),
    ).toBe("delivered");
    expect(
      router.send("session-1", {
        type: "terminal_create",
        terminalId: "term-2",
        sessionId: "session-1",
        cols: 120,
        rows: 30,
        cwd: "/repo",
      }),
    ).toBe("delivered");

    const send = ws.send as unknown as ReturnType<typeof vi.fn>;
    const commands = send.mock.calls.map((call) => JSON.parse(call[0] as string));
    expect(commands).toEqual([
      expect.objectContaining({ type: "terminal_create", terminalId: "term-1" }),
      expect.objectContaining({ type: "terminal_create", terminalId: "term-2" }),
    ]);
  });

  it("passes environment config to stopSession when destroying a provisioned runtime", async () => {
    const provisionedStop = vi.fn().mockResolvedValue({ ok: true, status: "stopping" });
    const provisionedAdapter: RuntimeAdapter = {
      type: "provisioned",
      async validateConfig() {},
      async testConfig() {
        return { ok: true };
      },
      async startSession() {
        return { status: "connecting" };
      },
      stopSession: provisionedStop,
      async getStatus() {
        return { status: "unknown" };
      },
    };
    const localAdapter: RuntimeAdapter = {
      type: "local",
      async validateConfig() {},
      async testConfig() {
        return { ok: true };
      },
      async startSession() {
        return { status: "selected" };
      },
      async stopSession() {
        return { ok: true, status: "stopped" };
      },
      async getStatus() {
        return { status: "unknown" };
      },
    };
    prismaMock.agentEnvironment.findFirst.mockResolvedValueOnce({
      id: "env-1",
      name: "Company Launcher",
      adapterType: "provisioned",
      config: {
        startUrl: "https://launcher.example/start",
        stopUrl: "https://launcher.example/stop",
        statusUrl: "https://launcher.example/status",
        auth: { type: "bearer", secretId: "secret-1" },
        startupTimeoutSeconds: 120,
        deprovisionPolicy: "on_session_end",
      },
    });
    const router = new SessionRouter(
      new RuntimeAdapterRegistry([localAdapter, provisionedAdapter]),
    );

    await router.destroyRuntime("session-1", {
      hosting: "cloud",
      organizationId: "org-1",
      connection: {
        adapterType: "provisioned",
        environmentId: "env-1",
        providerRuntimeId: "provider-1",
      },
    });

    expect(prismaMock.agentEnvironment.findFirst).toHaveBeenCalledWith({
      where: { id: "env-1" },
      select: { id: true, name: true, adapterType: true, config: true },
    });
    expect(provisionedStop).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "session-1",
        organizationId: "org-1",
        environment: expect.objectContaining({
          id: "env-1",
          adapterType: "provisioned",
          config: expect.objectContaining({
            stopUrl: "https://launcher.example/stop",
            auth: { type: "bearer", secretId: "secret-1" },
            startupTimeoutSeconds: 120,
            deprovisionPolicy: "on_session_end",
          }),
        }),
      }),
    );
  });
});
