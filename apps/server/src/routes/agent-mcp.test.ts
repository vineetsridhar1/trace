import express from "express";
import { createServer, type Server } from "http";
import type { AddressInfo } from "net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../services/session.js", () => ({
  sessionService: { get: vi.fn(), getGroup: vi.fn(), readFile: vi.fn() },
}));
vi.mock("../services/session-applications.js", () => ({
  sessionApplicationService: {
    listProcesses: vi.fn(),
    listEndpoints: vi.fn(),
    listLogs: vi.fn(),
    restartProcess: vi.fn(),
    runSetupScript: vi.fn(),
  },
}));
vi.mock("../services/session-timeline.js", () => ({
  sessionTimelineService: { query: vi.fn() },
}));

import { createAgentMcpToken, signSessionToken } from "../lib/auth.js";
import { sessionApplicationService } from "../services/session-applications.js";
import { sessionService } from "../services/session.js";
import { createAgentMcpRouter } from "./agent-mcp.js";

describe("agent MCP route", () => {
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(sessionService.get).mockResolvedValue({
      id: "session-1",
      sessionGroupId: "group-1",
    } as never);
    vi.mocked(sessionService.getGroup).mockResolvedValue({ id: "group-1" } as never);
    const app = express();
    app.use(express.json());
    app.use(createAgentMcpRouter());
    server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });

  it("rejects a normal Trace session token", async () => {
    const response = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${signSessionToken("user-1")}`,
      },
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

  it("rejects a process id outside the capability's session group", async () => {
    vi.mocked(sessionApplicationService.listProcesses).mockResolvedValue([] as never);
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
        method: "tools/call",
        params: { name: "read_process_logs", arguments: { processId: "other-group-process" } },
      }),
    });
    const body = (await response.json()) as { result: { isError?: boolean } };
    expect(response.status).toBe(200);
    expect(body.result.isError).toBe(true);
    expect(sessionApplicationService.listLogs).not.toHaveBeenCalled();
  });

  it("caps logs by response bytes and returns an older-page cursor", async () => {
    vi.mocked(sessionApplicationService.listProcesses).mockResolvedValue([
      { id: "process-1" },
    ] as never);
    vi.mocked(sessionApplicationService.listLogs).mockResolvedValue([
      { sequence: 3, data: "c".repeat(60_000) },
      { sequence: 2, data: "b".repeat(60_000) },
      { sequence: 1, data: "a".repeat(60_000) },
    ] as never);
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
        method: "tools/call",
        params: { name: "read_process_logs", arguments: { processId: "process-1" } },
      }),
    });

    const body = (await response.json()) as {
      result: { content: Array<{ text: string }> };
    };
    const payload = JSON.parse(body.result.content[0]!.text) as {
      logs: Array<{ sequence: number }>;
      truncated: boolean;
      nextBeforeSequence: number;
    };
    expect(payload.logs.map((log) => log.sequence)).toEqual([2, 3]);
    expect(payload.truncated).toBe(true);
    expect(payload.nextBeforeSequence).toBe(2);
    expect(sessionApplicationService.listLogs).toHaveBeenCalledWith(
      "process-1",
      "org-1",
      "user-1",
      { limit: undefined, beforeSequence: undefined },
    );
  });
});
