import express from "express";
import { createServer, type Server } from "http";
import type { AddressInfo } from "net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAgentMcpToken } from "../lib/auth.js";
import { createAgentMcpRouter } from "./agent-mcp.js";

describe("agent MCP route", () => {
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    const app = express();
    app.use(express.json());
    app.use(createAgentMcpRouter());
    server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  });

  it("rejects a normal Trace session token", async () => {
    const response = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer not-an-agent-token" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
    });
    expect(response.status).toBe(401);
  });

  it("lists only the narrow self-management toolset for a valid capability", async () => {
    const { token } = createAgentMcpToken({
      userId: "user-1",
      organizationId: "org-1",
      sessionId: "session-1",
      sessionGroupId: "group-1",
    });
    const response = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
        params: {},
      }),
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { result: { tools: Array<{ name: string }> } };
    expect(body.result.tools.map((tool) => tool.name)).toEqual(
      expect.arrayContaining(["read_process_logs", "restart_application_process"]),
    );
    expect(body.result.tools.map((tool) => tool.name)).not.toContain("start_session");
  });
});
