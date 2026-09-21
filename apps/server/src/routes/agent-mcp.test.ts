import { createServer, type Server } from "http";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import express from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/agent-invocation-auth.js", () => ({
  authenticateAgentInvocationToken: vi.fn(),
}));

vi.mock("../services/agent-integrations.js", () => ({
  agentIntegrationService: { searchTools: vi.fn(), callTool: vi.fn() },
}));

import { authenticateAgentInvocationToken } from "../lib/agent-invocation-auth.js";
import { agentIntegrationService } from "../services/agent-integrations.js";
import { agentMcpRouter } from "./agent-mcp.js";

const authMock = vi.mocked(authenticateAgentInvocationToken);
const integrationMock = agentIntegrationService as unknown as {
  searchTools: ReturnType<typeof vi.fn>;
  callTool: ReturnType<typeof vi.fn>;
};

describe("agent MCP route", () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use(agentMcpRouter);
    server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server did not start");
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });

  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({
      kind: "agent",
      tokenType: "agent_invocation",
      organizationId: "org-1",
      sessionId: "session-1",
      sessionGroupId: "group-1",
      invocationId: "invocation-1",
      capabilities: ["integration:invoke"],
      userId: "user-1",
      role: "member",
    });
  });

  async function rpc(body: Record<string, unknown>, token = "invocation-token") {
    return fetch(`${baseUrl}/agent/mcp`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  }

  it("requires an active agent invocation", async () => {
    authMock.mockResolvedValue(null);
    const response = await rpc({ jsonrpc: "2.0", id: 1, method: "tools/list" });
    expect(response.status).toBe(401);
  });

  it("advertises a small stable integration tool surface", async () => {
    const response = await rpc({ jsonrpc: "2.0", id: 1, method: "tools/list" });
    const body = (await response.json()) as { result: { tools: Array<{ name: string }> } };
    expect(body.result.tools.map((tool) => tool.name)).toEqual([
      "search_integrations",
      "call_integration",
    ]);
  });

  it("supports an MCP client handshake and tool discovery", async () => {
    const transport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/agent/mcp`), {
      requestInit: { headers: { Authorization: "Bearer invocation-token" } },
    });
    const client = new Client({ name: "test-client", version: "1.0.0" });
    try {
      await client.connect(transport);
      const result = await client.listTools();
      expect(result.tools.map((tool) => tool.name)).toEqual([
        "search_integrations",
        "call_integration",
      ]);
    } finally {
      await client.close();
    }
  });

  it("returns discovered upstream schemas and forwards calls", async () => {
    integrationMock.searchTools.mockResolvedValue([
      {
        connectionId: "connection-1",
        toolId: "provider:search_issues",
        name: "search_issues",
        inputSchema: { type: "object" },
      },
    ]);
    const searchResponse = await rpc({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "search_integrations", arguments: { query: "linear" } },
    });
    const searchBody = (await searchResponse.json()) as {
      result: { structuredContent: { tools: unknown[] } };
    };
    expect(searchBody.result.structuredContent.tools).toHaveLength(1);

    integrationMock.callTool.mockResolvedValue({
      content: [{ type: "text", text: "result" }],
    });
    const callResponse = await rpc({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "call_integration",
        arguments: {
          connectionId: "connection-1",
          toolId: "provider:search_issues",
          arguments: { query: "login" },
        },
      },
    });
    expect(await callResponse.json()).toMatchObject({
      result: { content: [{ type: "text", text: "result" }] },
    });
    expect(integrationMock.callTool).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-1" }),
      {
        connectionId: "connection-1",
        toolId: "provider:search_issues",
        arguments: { query: "login" },
      },
    );
  });
});
