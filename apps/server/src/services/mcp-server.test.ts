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
  discoverMock.mockResolvedValue(METADATA);
  registerMock.mockResolvedValue({ clientId: "client-1", clientSecret: "shh" });
});

describe("mcpServerService.create", () => {
  it("does NOT perform OAuth discovery or DCR when the actor is not an admin", async () => {
    asMember();

    await expect(
      mcpServerService.create(
        { organizationId: "org-1", name: "Linear", url: "https://mcp.example/sse" },
        "user",
        "u1",
      ),
    ).rejects.toThrow(/admin/i);

    expect(discoverMock).not.toHaveBeenCalled();
    expect(registerMock).not.toHaveBeenCalled();
    expect(prismaMock.mcpServer.create).not.toHaveBeenCalled();
  });

  it("rejects a duplicate name before registering a client", async () => {
    asAdmin();
    prismaMock.mcpServer.findUnique.mockResolvedValue({ id: "existing" });

    await expect(
      mcpServerService.create(
        { organizationId: "org-1", name: "Linear", url: "https://mcp.example/sse" },
        "user",
        "u1",
      ),
    ).rejects.toThrow(/already exists/);

    expect(registerMock).not.toHaveBeenCalled();
  });

  it("discovers, registers, encrypts the secret, persists, and emits created", async () => {
    asAdmin();
    prismaMock.mcpServer.findUnique.mockResolvedValue(null);
    const created = {
      id: "srv-1",
      organizationId: "org-1",
      name: "Linear",
      url: "https://mcp.example/sse",
      transport: "http",
      enabled: true,
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-01-01"),
    };
    prismaMock.mcpServer.create.mockResolvedValue(created);

    const result = await mcpServerService.create(
      { organizationId: "org-1", name: "Linear", url: "https://mcp.example/sse" },
      "user",
      "u1",
    );

    expect(result).toBe(created);
    expect(discoverMock).toHaveBeenCalledTimes(1);
    const createArgs = prismaMock.mcpServer.create.mock.calls[0][0];
    expect(createArgs.data.clientId).toBe("client-1");
    expect(createArgs.data.encryptedClientSecret).toBe("enc(shh)");
    expect(eventMock).toHaveBeenCalledTimes(1);
    expect(eventMock.mock.calls[0][0].eventType).toBe("mcp_server_created");
  });
});

describe("mcpServerService.update", () => {
  it("clears existing connections and re-registers when the URL changes", async () => {
    asAdmin();
    prismaMock.mcpServer.findUniqueOrThrow.mockResolvedValue({
      id: "srv-1",
      organizationId: "org-1",
      url: "https://old.example/sse",
    });
    prismaMock.mcpServer.update.mockResolvedValue({
      id: "srv-1",
      organizationId: "org-1",
      name: "Linear",
      url: "https://new.example/sse",
      transport: "http",
      enabled: true,
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-01-02"),
    });

    await mcpServerService.update("srv-1", { url: "https://new.example/sse" }, "user", "u1");

    expect(discoverMock).toHaveBeenCalledWith("https://new.example/sse");
    expect(prismaMock.mcpConnection.deleteMany).toHaveBeenCalledWith({
      where: { mcpServerId: "srv-1" },
    });
  });

  it("does not re-register when the URL is unchanged", async () => {
    asAdmin();
    prismaMock.mcpServer.findUniqueOrThrow.mockResolvedValue({
      id: "srv-1",
      organizationId: "org-1",
      url: "https://same.example/sse",
    });
    prismaMock.mcpServer.update.mockResolvedValue({
      id: "srv-1",
      organizationId: "org-1",
      name: "Renamed",
      url: "https://same.example/sse",
      transport: "http",
      enabled: true,
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-01-02"),
    });

    await mcpServerService.update("srv-1", { name: "Renamed" }, "user", "u1");

    expect(discoverMock).not.toHaveBeenCalled();
    expect(prismaMock.mcpConnection.deleteMany).not.toHaveBeenCalled();
  });
});
