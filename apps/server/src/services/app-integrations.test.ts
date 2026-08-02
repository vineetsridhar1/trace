import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/db.js", async () => {
  const { createPrismaMock } = await import("../../test/helpers.js");
  return { prisma: createPrismaMock() };
});

vi.mock("./event.js", () => ({ eventService: { create: vi.fn() } }));

vi.mock("./nango-connection-provider.js", () => ({
  nangoConnectionProvider: {
    isConfigured: vi.fn().mockReturnValue(true),
    createConnectSession: vi.fn(),
    deleteConnection: vi.fn(),
    proxy: vi.fn(),
  },
}));

import { prisma } from "../lib/db.js";
import { AuthorizationError, ValidationError } from "../lib/errors.js";
import { AppIntegrationService, normalizeIntegrationPath } from "./app-integrations.js";
import { nangoConnectionProvider } from "./nango-connection-provider.js";

const prismaMock = prisma as ReturnType<typeof import("../../test/helpers.js").createPrismaMock>;
const nangoMock = nangoConnectionProvider as unknown as {
  proxy: ReturnType<typeof vi.fn>;
};

function allowViewer() {
  prismaMock.orgMember.findUnique.mockResolvedValue({ userId: "viewer-1", role: "member" });
  prismaMock.sessionGroup.findFirst.mockResolvedValue({
    id: "app-1",
    ownerUserId: "owner-1",
    visibility: "public",
    kind: "app",
  });
}

describe("AppIntegrationService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    allowViewer();
  });

  it("rejects encoded path traversal before calling Nango", () => {
    expect(() => normalizeIntegrationPath("/repos/%2e%2e/admin")).toThrow(ValidationError);
  });

  it("does not allow a viewer binding to smuggle a shared connection", async () => {
    await expect(
      new AppIntegrationService().upsertBinding("org-1", "owner-1", "member", {
        sessionGroupId: "app-1",
        label: "GitHub",
        provider: "GitHub",
        providerConfigKey: "github",
        executionIdentity: "viewer",
        sharedConnectionId: "ceo-connection",
        allowedMethods: ["GET"],
        allowedPathPrefixes: ["/repos"],
      }),
    ).rejects.toThrow("Viewer connections cannot specify a shared connection");
  });

  it("runs an allowed request with the current viewer's connection", async () => {
    prismaMock.appIntegrationBinding.findFirst.mockResolvedValue({
      id: "binding-1",
      organizationId: "org-1",
      sessionGroupId: "app-1",
      providerConfigKey: "github",
      executionIdentity: "viewer",
      sharedConnectionId: null,
      allowedMethods: ["GET"],
      allowedPathPrefixes: ["/repos"],
    });
    prismaMock.integrationConnection.findFirst.mockResolvedValue({
      id: "viewer-connection",
      nangoConnectionId: "nango-viewer-1",
    });
    nangoMock.proxy.mockResolvedValue({
      status: 200,
      contentType: "application/json",
      body: Buffer.from("{}"),
    });

    const response = await new AppIntegrationService().execute({
      endpoint: { organizationId: "org-1", sessionGroupId: "app-1" },
      userId: "viewer-1",
      bindingId: "binding-1",
      method: "GET",
      path: "/repos/acme/trace",
      query: null,
      contentType: null,
      body: Buffer.alloc(0),
    });

    expect(response.status).toBe(200);
    expect(prismaMock.integrationConnection.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ ownerUserId: "viewer-1", kind: "personal" }),
      }),
    );
    expect(nangoMock.proxy).toHaveBeenCalledWith(
      expect.objectContaining({ connectionId: "nango-viewer-1", path: "/repos/acme/trace" }),
    );
  });

  it("rejects provider paths outside the binding allowlist", async () => {
    prismaMock.appIntegrationBinding.findFirst.mockResolvedValue({
      id: "binding-1",
      organizationId: "org-1",
      sessionGroupId: "app-1",
      providerConfigKey: "github",
      executionIdentity: "viewer",
      sharedConnectionId: null,
      allowedMethods: ["GET"],
      allowedPathPrefixes: ["/repos"],
    });

    await expect(
      new AppIntegrationService().execute({
        endpoint: { organizationId: "org-1", sessionGroupId: "app-1" },
        userId: "viewer-1",
        bindingId: "binding-1",
        method: "GET",
        path: "/admin/users",
        query: null,
        contentType: null,
        body: Buffer.alloc(0),
      }),
    ).rejects.toBeInstanceOf(AuthorizationError);
    expect(nangoMock.proxy).not.toHaveBeenCalled();
  });
});
