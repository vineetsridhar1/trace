import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  authenticateProvisionedRuntimeToken,
  ProvisionedRuntimeAdapter,
} from "./runtime-adapters.js";
import { orgSecretService } from "../services/org-secret.js";

vi.mock("../services/org-secret.js", () => ({
  orgSecretService: {
    getDecryptedValue: vi.fn().mockResolvedValue("launcher-secret"),
  },
}));

const provisionedConfig = {
  startUrl: "https://launcher.example/start",
  stopUrl: "https://launcher.example/stop",
  statusUrl: "https://launcher.example/status",
  auth: { type: "bearer", secretId: "secret-1" },
  startupTimeoutSeconds: 120,
  deprovisionPolicy: "on_session_end",
};

function makeResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function fetchMock(): ReturnType<typeof vi.fn> {
  return global.fetch as unknown as ReturnType<typeof vi.fn>;
}

describe("ProvisionedRuntimeAdapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(orgSecretService.getDecryptedValue).mockResolvedValue("launcher-secret");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(makeResponse({ status: "unknown" })));
    delete process.env.TRACE_SERVER_PUBLIC_URL;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rejects incomplete provisioned config", async () => {
    const adapter = new ProvisionedRuntimeAdapter();

    await expect(
      adapter.validateConfig({
        ...provisionedConfig,
        auth: { secretId: "secret-1" },
      }),
    ).rejects.toThrow("auth.type must be bearer or hmac");

    await expect(
      adapter.validateConfig({
        ...provisionedConfig,
        startUrl: "http://launcher.example/start",
      }),
    ).rejects.toThrow("startUrl must use HTTPS");

    await expect(
      adapter.validateConfig({
        ...provisionedConfig,
        startupTimeoutSeconds: 0,
      }),
    ).rejects.toThrow("startupTimeoutSeconds must be a positive integer");
  });

  it("allows loopback HTTP provisioned URLs outside production", async () => {
    const adapter = new ProvisionedRuntimeAdapter();

    await expect(
      adapter.validateConfig({
        ...provisionedConfig,
        startUrl: "http://127.0.0.1:4567/start",
        stopUrl: "http://localhost:4567/stop",
        statusUrl: "http://127.0.0.1:4567/status",
      }),
    ).resolves.toBeUndefined();
  });

  it("rejects loopback HTTP provisioned URLs in production mode", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("TRACE_LOCAL_MODE", "");
    const adapter = new ProvisionedRuntimeAdapter();

    await expect(
      adapter.validateConfig({
        ...provisionedConfig,
        statusUrl: "http://127.0.0.1:4567/status",
      }),
    ).rejects.toThrow("statusUrl must use HTTPS");
  });

  it("starts with bearer auth, stable idempotency, and separate runtime bridge token", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    try {
      fetchMock().mockResolvedValueOnce(
        makeResponse({
          runtimeId: "provider-runtime-1",
          status: "provisioning",
          label: "Launcher task 1",
        }),
      );
      const adapter = new ProvisionedRuntimeAdapter();

      const result = await adapter.startSession({
        sessionId: "session-1",
        sessionGroupId: "group-1",
        organizationId: "org-1",
        actorId: "user-1",
        environment: {
          id: "env-1",
          name: "Company Launcher",
          adapterType: "provisioned",
          config: provisionedConfig,
        },
        tool: "codex",
        model: "gpt-test",
        repo: {
          id: "repo-1",
          name: "app",
          remoteUrl: "https://github.com/acme/app",
          defaultBranch: "main",
        },
        branch: "feature",
        runtimeInstanceId: "runtime_preallocated_1",
        runtimeToken: "runtime-token",
        bridgeUrl: "wss://trace.example/bridge",
      });

      expect(result).toEqual(
        expect.objectContaining({
          runtimeLabel: "Launcher task 1",
          providerRuntimeId: "provider-runtime-1",
          status: "provisioning",
        }),
      );
      expect(result.runtimeInstanceId).toBe("runtime_preallocated_1");

      const call = fetchMock().mock.calls[0];
      const url = call[0] as string;
      const init = call[1] as RequestInit;
      const headers = init.headers as Record<string, string>;
      const body = JSON.parse(init.body as string) as Record<string, unknown>;

      expect(url).toBe("https://launcher.example/start");
      expect(headers.Authorization).toBe("Bearer launcher-secret");
      expect(headers["Trace-Idempotency-Key"]).toBe("session:session-1:start");
      expect(typeof body.runtimeToken).toBe("string");
      expect(body.runtimeToken).not.toBe("runtime-token");
      expect(body.runtimeTokenScope).toBe("session");
      expect(body.runtimeTokenExpiresAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(body.bootstrapEnv).toEqual(
        expect.objectContaining({
          TRACE_SESSION_ID: "session-1",
          TRACE_ORG_ID: "org-1",
          TRACE_RUNTIME_INSTANCE_ID: result.runtimeInstanceId,
          TRACE_RUNTIME_TOKEN: body.runtimeToken,
          TRACE_BRIDGE_URL: "wss://trace.example/bridge",
        }),
      );

      expect(authenticateProvisionedRuntimeToken(body.runtimeToken as string)).toEqual({
        instanceId: result.runtimeInstanceId,
        organizationId: "org-1",
        userId: "user-1",
        sessionId: "session-1",
        environmentId: "env-1",
        allowedScope: "session",
        tool: "codex",
      });
      const logged = logSpy.mock.calls.map((call) => call.join(" ")).join("\n");
      expect(logged).not.toContain("launcher-secret");
      expect(logged).not.toContain(body.runtimeToken as string);
    } finally {
      logSpy.mockRestore();
    }
  });

  it("rejects expired runtime bridge tokens", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-29T12:00:00Z"));
    fetchMock().mockResolvedValueOnce(makeResponse({ runtimeId: "provider-runtime-1" }));
    const adapter = new ProvisionedRuntimeAdapter();

    await adapter.startSession({
      sessionId: "session-expired",
      organizationId: "org-1",
      actorId: "user-1",
      environment: {
        id: "env-1",
        name: "Company Launcher",
        adapterType: "provisioned",
        config: provisionedConfig,
      },
      tool: "codex",
      runtimeToken: "runtime-token-expired",
      bridgeUrl: "wss://trace.example/bridge",
    });

    const startBody = JSON.parse(fetchMock().mock.calls[0][1].body as string) as Record<
      string,
      unknown
    >;
    const runtimeToken = startBody.runtimeToken as string;

    expect(authenticateProvisionedRuntimeToken(runtimeToken)).not.toBeNull();
    vi.setSystemTime(new Date("2026-04-29T12:16:00Z"));
    expect(authenticateProvisionedRuntimeToken(runtimeToken)).toBeNull();
    vi.useRealTimers();
  });

  it("signs HMAC lifecycle requests without bearer auth", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    try {
      fetchMock().mockResolvedValueOnce(
        makeResponse({
          runtimeId: "provider-runtime-1",
          status: "booting",
        }),
      );
      const adapter = new ProvisionedRuntimeAdapter();

      await adapter.startSession({
        sessionId: "session-1",
        organizationId: "org-1",
        actorId: "user-1",
        environment: {
          id: "env-1",
          name: "Company Launcher",
          adapterType: "provisioned",
          config: {
            ...provisionedConfig,
            auth: { type: "hmac", secretId: "secret-1" },
          },
        },
        tool: "codex",
        runtimeToken: "runtime-token",
        bridgeUrl: "wss://trace.example/bridge",
      });

      const init = fetchMock().mock.calls[0][1] as RequestInit;
      const headers = init.headers as Record<string, string>;
      expect(headers.Authorization).toBeUndefined();
      expect(headers["Trace-Timestamp"]).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(headers["Trace-Request-Id"]).toBeTruthy();
      expect(headers["Trace-Signature"]).toMatch(/^v1=[0-9a-f]{64}$/);
      const logged = logSpy.mock.calls.map((call) => call.join(" ")).join("\n");
      expect(logged).not.toContain(headers["Trace-Signature"]);
    } finally {
      logSpy.mockRestore();
    }
  });

  it("stops and checks status through authenticated launcher endpoints", async () => {
    fetchMock()
      .mockResolvedValueOnce(makeResponse({ ok: true, status: "stopped" }))
      .mockResolvedValueOnce(makeResponse({ status: "running", message: "RUNNING" }));
    const adapter = new ProvisionedRuntimeAdapter();
    const environment = {
      id: "env-1",
      name: "Company Launcher",
      adapterType: "provisioned" as const,
      config: provisionedConfig,
    };

    await expect(
      adapter.stopSession({
        sessionId: "session-1",
        organizationId: "org-1",
        environment,
        connection: { providerRuntimeId: "provider-runtime-1" },
        reason: "session_deleted",
      }),
    ).resolves.toEqual({ ok: true, status: "stopped", message: undefined });

    await expect(
      adapter.getStatus({
        organizationId: "org-1",
        environment,
        connection: { providerRuntimeId: "provider-runtime-1" },
      }),
    ).resolves.toEqual({ status: "connected", message: "RUNNING", metadata: undefined });

    const stopInit = fetchMock().mock.calls[0][1] as RequestInit;
    const stopHeaders = stopInit.headers as Record<string, string>;
    expect(stopHeaders["Trace-Idempotency-Key"]).toBe("session:session-1:stop");

    const stopBody = JSON.parse(stopInit.body as string) as Record<string, unknown>;
    expect(stopBody).toEqual({
      sessionId: "session-1",
      runtimeId: "provider-runtime-1",
      reason: "session_deleted",
    });
  });

  it("reuses idempotency keys for duplicate start and stop calls", async () => {
    fetchMock()
      .mockResolvedValueOnce(makeResponse({ runtimeId: "provider-runtime-1" }))
      .mockResolvedValueOnce(makeResponse({ runtimeId: "provider-runtime-1" }))
      .mockResolvedValueOnce(makeResponse({ ok: true, status: "stopped" }))
      .mockResolvedValueOnce(makeResponse({ ok: true, status: "stopped" }));
    const adapter = new ProvisionedRuntimeAdapter();
    const environment = {
      id: "env-1",
      name: "Company Launcher",
      adapterType: "provisioned" as const,
      config: provisionedConfig,
    };
    const startInput = {
      sessionId: "session-duplicate",
      organizationId: "org-1",
      actorId: "user-1",
      environment,
      tool: "codex",
      runtimeInstanceId: "runtime-duplicate",
      bridgeUrl: "wss://trace.example/bridge",
    };
    const stopInput = {
      sessionId: "session-duplicate",
      organizationId: "org-1",
      environment,
      connection: { providerRuntimeId: "provider-runtime-1" },
      reason: "session_deleted",
    };

    await adapter.startSession(startInput);
    await adapter.startSession(startInput);
    await adapter.stopSession(stopInput);
    await adapter.stopSession(stopInput);

    const idempotencyKeys = fetchMock().mock.calls.map((call) => {
      const init = call[1] as RequestInit;
      const headers = init.headers as Record<string, string>;
      return headers["Trace-Idempotency-Key"];
    });
    expect(idempotencyKeys).toEqual([
      "session:session-duplicate:start",
      "session:session-duplicate:start",
      "session:session-duplicate:stop",
      "session:session-duplicate:stop",
    ]);
  });
});
