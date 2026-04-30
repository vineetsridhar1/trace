import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import type { ControllerConfig } from "./config.js";
import { FlyApiError } from "./fly.js";
import { createServer, type FlyRuntimeClient } from "./server.js";
import type { FlyMachine, StartSessionRequest } from "./types.js";

let server: Server | null = null;

describe("launcher HTTP server", () => {
  afterEach(async () => {
    if (!server) return;
    await new Promise<void>((resolve, reject) => {
      server?.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
    server = null;
  });

  it("rejects unauthorized lifecycle requests before calling Fly", async () => {
    const client = new FakeFlyClient();
    const baseUrl = await listen(client);

    const response = await post(baseUrl, "/trace/start-session", startRequest(), "wrong-token");

    expect(response.status).toBe(401);
    expect(client.createCalls).toHaveLength(0);
  });

  it("starts a runtime and returns the provider runtime ID", async () => {
    const client = new FakeFlyClient();
    const baseUrl = await listen(client);

    const response = await post(
      baseUrl,
      "/trace/start-session",
      startRequest(),
      config.traceLauncherBearerToken,
      "session:session-1:start",
    );
    const json = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(json).toMatchObject({
      runtimeId: "machine-1",
      runtimeUrl: "https://fly.io/apps/trace-runtime-machines/machines/machine-1",
      label: "Fly iad",
      status: "provisioning",
    });
    expect(client.createCalls).toEqual([
      {
        request: expect.objectContaining({ sessionId: "session-1" }),
        idempotencyKey: "session:session-1:start",
      },
    ]);
  });

  it("maps status checks through the Fly machine state", async () => {
    const client = new FakeFlyClient({ machine: { id: "machine-1", state: "started" } });
    const baseUrl = await listen(client);

    const response = await post(baseUrl, "/trace/session-status", { runtimeId: "machine-1" });
    const json = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(json).toMatchObject({
      status: "connected",
      metadata: {
        flyState: "started",
        machineId: "machine-1",
      },
    });
  });

  it("treats duplicate stops for missing Fly machines as idempotent success", async () => {
    const client = new FakeFlyClient({ stopError: new FlyApiError(404, "not found") });
    const baseUrl = await listen(client);

    const response = await post(baseUrl, "/trace/stop-session", {
      sessionId: "session-1",
      runtimeId: "machine-1",
      reason: "session_stopped",
    });
    const json = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(json).toEqual({ ok: true, status: "stopped" });
    expect(client.stopCalls).toEqual(["machine-1"]);
    expect(client.deleteCalls).toEqual([]);
  });
});

const config: ControllerConfig = {
  port: 0,
  traceLauncherBearerToken: "launcher-token",
  flyApiToken: "fly-token",
  flyAppName: "trace-runtime-machines",
  flyRegion: "iad",
  traceRuntimeImage: "registry.example.com/trace-runtime:latest",
  flyMachineCpuKind: "shared",
  flyMachineCpus: 1,
  flyMachineMemoryMb: 1024,
  deleteAfterStop: true,
  runtimePassthroughEnv: {},
};

class FakeFlyClient implements FlyRuntimeClient {
  readonly createCalls: Array<{
    request: StartSessionRequest;
    idempotencyKey: string | undefined;
  }> = [];
  readonly stopCalls: string[] = [];
  readonly deleteCalls: string[] = [];
  private readonly machine: FlyMachine;
  private readonly stopError: Error | null;

  constructor(options: { machine?: FlyMachine; stopError?: Error } = {}) {
    this.machine = options.machine ?? { id: "machine-1", state: "created", region: "iad" };
    this.stopError = options.stopError ?? null;
  }

  async createRuntimeMachine(
    request: StartSessionRequest,
    idempotencyKey: string | undefined,
  ): Promise<FlyMachine> {
    this.createCalls.push({ request, idempotencyKey });
    return this.machine;
  }

  async getMachine(machineId: string): Promise<FlyMachine> {
    return { ...this.machine, id: machineId };
  }

  async stopMachine(machineId: string): Promise<void> {
    this.stopCalls.push(machineId);
    if (this.stopError) throw this.stopError;
  }

  async deleteMachine(machineId: string): Promise<void> {
    this.deleteCalls.push(machineId);
  }
}

async function listen(client: FlyRuntimeClient): Promise<string> {
  const app = createServer(config, client);
  server = await new Promise<Server>((resolve) => {
    const started = app.listen(0, () => resolve(started));
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Expected test server to listen on a TCP port");
  }
  return `http://127.0.0.1:${(address as AddressInfo).port}`;
}

async function post(
  baseUrl: string,
  path: string,
  body: Record<string, unknown>,
  token = config.traceLauncherBearerToken,
  idempotencyKey?: string,
): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(idempotencyKey ? { "Trace-Idempotency-Key": idempotencyKey } : {}),
    },
    body: JSON.stringify(body),
  });
}

function startRequest(): StartSessionRequest {
  return {
    sessionId: "session-1",
    sessionGroupId: null,
    orgId: "org-1",
    runtimeInstanceId: "runtime-1",
    runtimeToken: "runtime-token",
    runtimeTokenExpiresAt: "2026-01-01T00:00:00.000Z",
    runtimeTokenScope: "session",
    bridgeUrl: "wss://trace.example/bridge",
    repo: null,
    tool: "codex",
    model: "gpt-5",
    bootstrapEnv: {
      TRACE_SESSION_ID: "session-1",
      TRACE_ORG_ID: "org-1",
      TRACE_RUNTIME_INSTANCE_ID: "runtime-1",
      TRACE_RUNTIME_TOKEN: "runtime-token",
      TRACE_BRIDGE_URL: "wss://trace.example/bridge",
    },
    metadata: {
      requestedBy: "user-1",
      environmentId: "env-1",
      launcherMetadata: {},
    },
  };
}
