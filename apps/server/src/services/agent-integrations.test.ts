import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/db.js", async () => {
  const { createPrismaMock } = await import("../../test/helpers.js");
  return { prisma: createPrismaMock() };
});

vi.mock("./event.js", () => ({ eventService: { create: vi.fn() } }));

import type { AgentInvocationAuthSubject } from "../lib/agent-invocation-auth.js";
import { prisma } from "../lib/db.js";
import { eventService } from "./event.js";
import { AgentIntegrationService } from "./agent-integrations.js";
import type { IntegrationToolProvider } from "./integration-connection-provider.js";

const prismaMock = prisma as ReturnType<typeof import("../../test/helpers.js").createPrismaMock>;
const eventMock = eventService as unknown as { create: ReturnType<typeof vi.fn> };
const provider: IntegrationToolProvider = {
  listTools: vi.fn(),
  callTool: vi.fn(),
};
const subject: AgentInvocationAuthSubject = {
  kind: "agent",
  tokenType: "agent_invocation",
  organizationId: "org-1",
  sessionId: "session-1",
  sessionGroupId: "group-1",
  invocationId: "invocation-1",
  capabilities: ["integration:invoke"],
  userId: "user-1",
  role: "member",
};
const connection = {
  id: "trace-connection-1",
  provider: "Linear",
  providerConfigKey: "linear-mcp",
  nangoConnectionId: "nango-connection-1",
  displayName: "Product Linear",
  updatedAt: new Date("2026-08-17T12:00:00.000Z"),
};

describe("AgentIntegrationService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    eventMock.create.mockResolvedValue({});
    vi.mocked(provider.listTools).mockResolvedValue([
      {
        id: "provider:search_issues",
        name: "search_issues",
        description: "Search Linear issues",
        inputSchema: { type: "object", properties: { query: { type: "string" } } },
      },
    ]);
  });

  it("discovers tools only from the invocation owner's active personal connections", async () => {
    prismaMock.integrationConnection.findMany.mockResolvedValue([connection]);
    const service = new AgentIntegrationService(provider);

    await expect(service.searchTools(subject, "linear issues")).resolves.toEqual([
      expect.objectContaining({
        connectionId: "trace-connection-1",
        toolId: "provider:search_issues",
        name: "search_issues",
      }),
    ]);
    expect(prismaMock.integrationConnection.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: "org-1",
          ownerUserId: "user-1",
          kind: "personal",
          status: "active",
        },
      }),
    );
    expect(provider.listTools).toHaveBeenCalledWith({
      connectionId: "nango-connection-1",
      providerConfigKey: "linear-mcp",
    });
  });

  it("rechecks connection ownership and tool availability before invocation", async () => {
    prismaMock.integrationConnection.findFirst.mockResolvedValue(connection);
    vi.mocked(provider.callTool).mockResolvedValue({
      content: [{ type: "text", text: "issue-1" }],
    });
    const service = new AgentIntegrationService(provider);

    await expect(
      service.callTool(subject, {
        connectionId: "trace-connection-1",
        toolId: "provider:search_issues",
        arguments: { query: "login" },
      }),
    ).resolves.toEqual({ content: [{ type: "text", text: "issue-1" }] });
    expect(prismaMock.integrationConnection.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: "org-1",
          ownerUserId: "user-1",
          kind: "personal",
          status: "active",
        }),
      }),
    );
    expect(provider.callTool).toHaveBeenCalledWith({
      connectionId: "nango-connection-1",
      providerConfigKey: "linear-mcp",
      toolId: "provider:search_issues",
      arguments: { query: "login" },
    });
    expect(eventMock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "integration_tool_called",
        scopeId: "session-1",
        payload: expect.objectContaining({ succeeded: true }),
      }),
    );
  });

  it("does not invoke a tool missing from the live connection catalog", async () => {
    prismaMock.integrationConnection.findFirst.mockResolvedValue(connection);
    const service = new AgentIntegrationService(provider);

    await expect(
      service.callTool(subject, {
        connectionId: "trace-connection-1",
        toolId: "provider:delete_everything",
        arguments: {},
      }),
    ).rejects.toThrow("unavailable");
    expect(provider.callTool).not.toHaveBeenCalled();
  });
});
