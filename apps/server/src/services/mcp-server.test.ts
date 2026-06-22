import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/db.js", async () => {
  const { createPrismaMock } = await import("../../test/helpers.js");
  return { prisma: createPrismaMock() };
});

vi.mock("../lib/encryption.js", () => ({
  encryptSecret: (s: string) => ({ encrypted: `enc(${s})`, iv: "iv" }),
  decryptSecret: (enc: string) => enc.replace(/^enc\(/, "").replace(/\)$/, ""),
}));

vi.mock("./event.js", () => ({ eventService: { create: vi.fn() } }));

vi.mock("../lib/mcp-oauth.js", () => ({
  discoverOAuthMetadata: vi.fn(),
  registerClient: vi.fn(),
  mcpRedirectUri: () => "https://trace.example/mcp/oauth/callback",
}));

import { prisma } from "../lib/db.js";
import { eventService } from "./event.js";
import { discoverOAuthMetadata, registerClient } from "../lib/mcp-oauth.js";
import { mcpServerService } from "./mcp-server.js";
import type { createPrismaMock } from "../../test/helpers.js";

const prismaMock = prisma as unknown as ReturnType<typeof createPrismaMock>;
const discoverMock = discoverOAuthMetadata as unknown as ReturnType<typeof vi.fn>;
const registerMock = registerClient as unknown as ReturnType<typeof vi.fn>;
const eventMock = eventService.create as unknown as ReturnType<typeof vi.fn>;

const METADATA = {
  authorizationEndpoint: "https://auth.example/authorize",
  tokenEndpoint: "https://auth.example/token",
  registrationEndpoint: "https://auth.example/register",
};

function asAdmin() {
  prismaMock.orgMember.findUniqueOrThrow.mockResolvedValue({ userId: "u1", role: "admin" });
}
function asMember() {
  prismaMock.orgMember.findUniqueOrThrow.mockResolvedValue({ userId: "u1", role: "member" });
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.MCP_FIGMA_CLIENT_ID;
  delete process.env.MCP_FIGMA_CLIENT_SECRET;
  discoverMock.mockResolvedValue(METADATA);
  registerMock.mockResolvedValue({ clientId: "client-1", clientSecret: "shh" });
  prismaMock.mcpServer.findUnique.mockResolvedValue(null);
});

afterEach(() => {
  delete process.env.MCP_FIGMA_CLIENT_ID;
  delete process.env.MCP_FIGMA_CLIENT_SECRET;
});

describe("mcpServerService.enable", () => {
  it("does NOT discover or register for a non-admin", async () => {
    asMember();
    await expect(mcpServerService.enable("org-1", "linear", "user", "u1")).rejects.toThrow(/admin/i);
    expect(discoverMock).not.toHaveBeenCalled();
    expect(registerMock).not.toHaveBeenCalled();
    expect(prismaMock.mcpServer.create).not.toHaveBeenCalled();
  });

  it("rejects an unknown catalog id", async () => {
    asAdmin();
    await expect(mcpServerService.enable("org-1", "nope", "user", "u1")).rejects.toThrow(/Unknown/);
    expect(discoverMock).not.toHaveBeenCalled();
  });

  it("performs DCR for a dcr provider and persists with the catalog id", async () => {
    asAdmin();
    prismaMock.mcpServer.create.mockResolvedValue({
      id: "srv-1",
      organizationId: "org-1",
      catalogId: "linear",
      name: "Linear",
      url: "https://mcp.linear.app/mcp",
      transport: "http",
      enabled: true,
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-01-01"),
    });

    await mcpServerService.enable("org-1", "linear", "user", "u1");

    expect(registerMock).toHaveBeenCalledTimes(1);
    const data = prismaMock.mcpServer.create.mock.calls[0][0].data;
    expect(data.catalogId).toBe("linear");
    expect(data.clientId).toBe("client-1");
    expect(eventMock.mock.calls[0][0].eventType).toBe("mcp_server_created");
  });

  it("rejects a pre-registered provider when its credentials are not configured", async () => {
    asAdmin();
    await expect(mcpServerService.enable("org-1", "figma", "user", "u1")).rejects.toThrow(
      /not configured/,
    );
    expect(discoverMock).not.toHaveBeenCalled();
    expect(registerMock).not.toHaveBeenCalled();
  });

  it("uses configured credentials for a pre-registered provider without DCR", async () => {
    asAdmin();
    process.env.MCP_FIGMA_CLIENT_ID = "figma-client";
    process.env.MCP_FIGMA_CLIENT_SECRET = "figma-secret";
    prismaMock.mcpServer.create.mockResolvedValue({
      id: "srv-2",
      organizationId: "org-1",
      catalogId: "figma",
      name: "Figma",
      url: "https://mcp.figma.com/mcp",
      transport: "http",
      enabled: true,
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-01-01"),
    });

    await mcpServerService.enable("org-1", "figma", "user", "u1");

    expect(registerMock).not.toHaveBeenCalled();
    const data = prismaMock.mcpServer.create.mock.calls[0][0].data;
    expect(data.clientId).toBe("figma-client");
    expect(data.encryptedClientSecret).toBe("enc(figma-secret)");
  });

  it("rejects enabling a provider that is already enabled", async () => {
    asAdmin();
    prismaMock.mcpServer.findUnique.mockResolvedValue({ id: "existing" });
    await expect(mcpServerService.enable("org-1", "linear", "user", "u1")).rejects.toThrow(
      /already enabled/,
    );
    expect(registerMock).not.toHaveBeenCalled();
  });
});

describe("mcpServerService.listCatalog", () => {
  it("reports availability, enablement, and per-user connection state", async () => {
    prismaMock.orgMember.findUniqueOrThrow.mockResolvedValue({ userId: "u1" });
    prismaMock.mcpServer.findMany.mockResolvedValue([
      { id: "srv-1", organizationId: "org-1", catalogId: "linear", transport: "http" },
    ]);
    prismaMock.mcpConnection.findMany.mockResolvedValue([
      {
        mcpServerId: "srv-1",
        expiresAt: new Date(Date.now() + 3600_000),
        encryptedRefreshToken: "enc(r)",
      },
    ]);

    const catalog = await mcpServerService.listCatalog("u1", "org-1", "user", "u1");

    const linear = catalog.find((p) => p.id === "linear")!;
    expect(linear.enabled).toBe(true);
    expect(linear.serverId).toBe("srv-1");
    expect(linear.available).toBe(true);
    expect(linear.connectionState).toBe("connected");

    const figma = catalog.find((p) => p.id === "figma")!;
    expect(figma.enabled).toBe(false);
    expect(figma.available).toBe(false); // creds not configured
    expect(figma.connectionState).toBe("disconnected");
  });
});
