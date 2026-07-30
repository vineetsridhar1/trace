import express from "express";
import http from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAgentRunToken } from "../lib/agent-run-auth.js";

const { submitVisualPlanOutput } = vi.hoisted(() => ({
  submitVisualPlanOutput: vi.fn(),
}));
vi.mock("../services/session.js", () => ({
  sessionService: { submitVisualPlanOutput },
}));

import { agentOutputRouter } from "./agent-output.js";

const servers: http.Server[] = [];

afterEach(async () => {
  submitVisualPlanOutput.mockReset();
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.closeAllConnections();
          server.close(() => resolve());
        }),
    ),
  );
});

async function startServer(): Promise<string> {
  const app = express();
  app.use(agentOutputRouter);
  const server = http.createServer(app);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not start");
  return `http://127.0.0.1:${address.port}`;
}

describe("agent output route", () => {
  it("accepts a run-scoped visual-plan submission", async () => {
    submitVisualPlanOutput.mockResolvedValue({
      contentHash: "hash-1",
      validationErrors: [],
      ready: true,
    });
    const baseUrl = await startServer();
    const token = createAgentRunToken({
      organizationId: "org-1",
      runId: "run-1",
      sessionId: "session-1",
    });

    const response = await fetch(`${baseUrl}/agent/outputs`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        type: "visual-plan",
        state: "final",
        runId: "run-1",
        sessionId: "session-1",
        filename: "plan.mdx",
        sourcePath: "/workspace/plan.mdx",
        content: '# Plan\n<Callout tone="decision">Use events.</Callout>',
      }),
    });

    expect(response.status).toBe(201);
    expect(submitVisualPlanOutput).toHaveBeenCalledWith(
      "session-1",
      "run-1",
      "org-1",
      expect.objectContaining({
        filename: "plan.mdx",
        state: "final",
      }),
    );
  });

  it("rejects submissions without a run credential", async () => {
    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/agent/outputs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(401);
    expect(submitVisualPlanOutput).not.toHaveBeenCalled();
  });
});
