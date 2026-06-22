import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/db.js", async () => {
  const { createPrismaMock } = await import("../../test/helpers.js");
  return { prisma: createPrismaMock() };
});

vi.mock("../lib/encryption.js", () => ({
  encryptSecret: (s: string) => ({ encrypted: `enc(${s})`, iv: "iv" }),
  decryptSecret: (enc: string) => enc.replace(/^enc\(/, "").replace(/\)$/, ""),
}));

vi.mock("./event.js", () => ({ eventService: { create: vi.fn() } }));

vi.mock("./mcp-server.js", () => ({
  mcpServerService: { resolveOAuthContext: vi.fn() },
}));

vi.mock("../lib/mcp-oauth.js", () => ({
  refreshToken: vi.fn(),
  revokeToken: vi.fn().mockResolvedValue(true),
}));

import { prisma } from "../lib/db.js";
import { eventService } from "./event.js";
import { mcpServerService } from "./mcp-server.js";
import { refreshToken } from "../lib/mcp-oauth.js";
import { mcpConnectionService } from "./mcp-connection.js";
import type { createPrismaMock } from "../../test/helpers.js";

const prismaMock = prisma as unknown as ReturnType<typeof createPrismaMock>;
const eventMock = eventService.create as unknown as ReturnType<typeof vi.fn>;
const refreshMock = refreshToken as unknown as ReturnType<typeof vi.fn>;
const resolveOAuthContextMock = mcpServerService.resolveOAuthContext as unknown as ReturnType<
  typeof vi.fn
>;

function connection(overrides: Record<string, unknown> = {}) {
  return {
    userId: "u1",
    mcpServerId: "srv-1",
    encryptedAccessToken: "enc(access-1)",
    accessIv: "iv",
    encryptedRefreshToken: "enc(refresh-1)",
    refreshIv: "iv",
    expiresAt: new Date(Date.now() + 3600_000),
    scope: "read",
    updatedAt: new Date("2026-01-01"),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  resolveOAuthContextMock.mockResolvedValue({
    metadata: { tokenEndpoint: "https://auth.example/token" },
    clientId: "client-1",
    clientSecret: undefined,
  });
});

describe("upsertTokens", () => {
  it("emits mcp_connection_created", async () => {
    prismaMock.mcpServer.findUniqueOrThrow.mockResolvedValue({ id: "srv-1", organizationId: "org-1" });
    prismaMock.mcpConnection.upsert.mockResolvedValue(connection());

    await mcpConnectionService.upsertTokens("u1", "srv-1", { accessToken: "access-1" });

    expect(eventMock).toHaveBeenCalledTimes(1);
    expect(eventMock.mock.calls[0][0].eventType).toBe("mcp_connection_created");
  });
});

describe("resolveFreshAccessToken", () => {
  it("returns the stored token without refreshing when not near expiry", async () => {
    prismaMock.mcpConnection.findUnique.mockResolvedValue(connection());

    const token = await mcpConnectionService.resolveFreshAccessToken("u1", "srv-1");

    expect(token).toBe("access-1");
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("refreshes when near expiry and does NOT emit a creation event", async () => {
    prismaMock.mcpConnection.findUnique.mockResolvedValue(
      connection({ expiresAt: new Date(Date.now() + 5_000) }),
    );
    prismaMock.mcpServer.findUniqueOrThrow.mockResolvedValue({ id: "srv-1", organizationId: "org-1" });
    prismaMock.mcpConnection.upsert.mockResolvedValue(connection());
    refreshMock.mockResolvedValue({
      accessToken: "access-2",
      refreshToken: "refresh-2",
      expiresAt: new Date(Date.now() + 3600_000),
      scope: "read",
    });

    const token = await mcpConnectionService.resolveFreshAccessToken("u1", "srv-1");

    expect(token).toBe("access-2");
    expect(refreshMock).toHaveBeenCalledTimes(1);
    expect(eventMock).not.toHaveBeenCalled();
  });

  it("falls back to the existing token when refresh fails but it is still valid", async () => {
    prismaMock.mcpConnection.findUnique.mockResolvedValue(
      connection({ expiresAt: new Date(Date.now() + 5_000) }),
    );
    refreshMock.mockRejectedValue(new Error("rotated"));

    const token = await mcpConnectionService.resolveFreshAccessToken("u1", "srv-1");
    expect(token).toBe("access-1");
  });
});

describe("resolveLaunchMcpConfig", () => {
  it("builds a Claude-compatible config with bearer headers and sanitized keys", async () => {
    prismaMock.mcpConnection.findMany.mockResolvedValue([
      {
        ...connection(),
        mcpServer: {
          id: "srv-1",
          name: "Linear MCP",
          url: "https://mcp.example/sse",
          transport: "sse",
        },
      },
    ]);

    const config = await mcpConnectionService.resolveLaunchMcpConfig("u1", "org-1");

    expect(config).toEqual({
      "Linear-MCP": {
        type: "sse",
        url: "https://mcp.example/sse",
        headers: { Authorization: "Bearer access-1" },
      },
    });
  });

  it("returns undefined when the user has no connections", async () => {
    prismaMock.mcpConnection.findMany.mockResolvedValue([]);
    const config = await mcpConnectionService.resolveLaunchMcpConfig("u1", "org-1");
    expect(config).toBeUndefined();
  });
});
