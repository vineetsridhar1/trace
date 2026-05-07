import { afterEach, describe, expect, it, vi } from "vitest";
import type { Server } from "node:http";
import { createServer, type RuntimeClient } from "./server.js";
import { configFixture, startSessionRequestFixture } from "./test-fixtures.js";

let server: Server | null = null;

afterEach(() => {
  server?.close();
  server = null;
});

describe("createServer", () => {
  it("creates runtime jobs through the lifecycle endpoint", async () => {
    const runtimeClient: RuntimeClient = {
      createRuntimeJob: vi.fn().mockResolvedValue({
        id: "trace-runtime-runtimeabc123",
        namespace: "trace-runtimes",
        label: "Kubernetes runtimeabc123",
      }),
      deleteRuntimeJob: vi.fn(),
      getRuntimeStatus: vi.fn(),
    };
    const baseUrl = await listen(runtimeClient);

    const response = await fetch(`${baseUrl}/trace/start-session`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${configFixture.traceLauncherBearerToken}`,
        "Content-Type": "application/json",
        "Trace-Idempotency-Key": "session:sess-123:start",
      },
      body: JSON.stringify(startSessionRequestFixture),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      runtimeId: "trace-runtime-runtimeabc123",
      runtimeUrl: "k8s://jobs/trace-runtimes/trace-runtime-runtimeabc123",
      status: "provisioning",
    });
    expect(runtimeClient.createRuntimeJob).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: "sess-123" }),
      "session:sess-123:start",
    );
  });

  it("rejects unauthorized requests", async () => {
    const baseUrl = await listen({
      createRuntimeJob: vi.fn(),
      deleteRuntimeJob: vi.fn(),
      getRuntimeStatus: vi.fn(),
    });

    const response = await fetch(`${baseUrl}/trace/session-status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ runtimeId: "trace-runtime-runtimeabc123" }),
    });

    expect(response.status).toBe(401);
  });

  it("stops runtime jobs idempotently", async () => {
    const runtimeClient: RuntimeClient = {
      createRuntimeJob: vi.fn(),
      deleteRuntimeJob: vi.fn().mockResolvedValue({ alreadyGone: true }),
      getRuntimeStatus: vi.fn(),
    };
    const baseUrl = await listen(runtimeClient);

    const response = await fetch(`${baseUrl}/trace/stop-session`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${configFixture.traceLauncherBearerToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sessionId: "sess-123",
        runtimeId: "trace-runtime-runtimeabc123",
        reason: "session_stopped",
      }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, status: "stopped" });
  });
});

async function listen(runtimeClient: RuntimeClient): Promise<string> {
  const app = createServer(configFixture, runtimeClient);
  await new Promise<void>((resolve, reject) => {
    server = app.listen(0, "127.0.0.1", (error?: Error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
  const address = server?.address();
  if (!address || typeof address === "string") {
    throw new Error("test server did not bind to a TCP port");
  }
  return `http://127.0.0.1:${address.port}`;
}
