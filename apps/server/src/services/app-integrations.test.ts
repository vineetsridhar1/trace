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
import { eventService } from "./event.js";
import {
  AppIntegrationService,
  assertSnowflakeReadOnlyQuery,
  normalizeIntegrationPath,
} from "./app-integrations.js";
import { nangoConnectionProvider } from "./nango-connection-provider.js";
import type { IntegrationRequestAuditStore } from "./integration-request-audit.js";

const prismaMock = prisma as ReturnType<typeof import("../../test/helpers.js").createPrismaMock>;
const nangoMock = nangoConnectionProvider as unknown as {
  createConnectSession: ReturnType<typeof vi.fn>;
  proxy: ReturnType<typeof vi.fn>;
};
const eventMock = eventService as unknown as { create: ReturnType<typeof vi.fn> };
const auditMock: IntegrationRequestAuditStore = {
  start: vi.fn(),
  complete: vi.fn(),
};

function service() {
  return new AppIntegrationService(nangoConnectionProvider, auditMock);
}

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
    delete process.env.NANGO_GITHUB_INTEGRATION_KEY;
    allowViewer();
    vi.mocked(auditMock.start).mockResolvedValue();
    vi.mocked(auditMock.complete).mockResolvedValue();
  });

  it("creates a connect session from the supported integration catalog", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      email: "viewer@example.com",
      name: "Viewer",
    });
    nangoMock.createConnectSession.mockResolvedValue({
      connectLink: "https://connect.example.com",
      expiresAt: new Date("2026-08-09T00:00:00Z"),
    });

    await service().createConnectSession("org-1", "viewer-1", "member", {
      integrationId: "github",
      kind: "personal",
    });

    expect(nangoMock.createConnectSession).toHaveBeenCalledWith(
      expect.objectContaining({
        providerConfigKey: "github-getting-started",
        displayName: "GitHub account",
      }),
    );
  });

  it("rejects a second organization service connection for the same integration", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      email: "admin@example.com",
      name: "Admin",
    });
    prismaMock.integrationConnection.findFirst.mockResolvedValue({ id: "service-1" });

    await expect(
      service().createConnectSession("org-1", "admin-1", "admin", {
        integrationId: "github",
        kind: "service",
      }),
    ).rejects.toThrow(
      new ValidationError("This organization already has a GitHub service connection"),
    );
    expect(nangoMock.createConnectSession).not.toHaveBeenCalled();
  });

  it("lists only an admin's own personal connections and organization service connections", async () => {
    prismaMock.integrationConnection.findMany.mockResolvedValue([]);

    await service().listConnections("org-1", "admin-1", "admin");

    expect(prismaMock.integrationConnection.findMany).toHaveBeenCalledWith({
      where: {
        organizationId: "org-1",
        status: { not: "revoked" },
        OR: [{ ownerUserId: "admin-1" }, { kind: "service" }],
      },
      orderBy: [{ provider: "asc" }, { displayName: "asc" }],
    });
  });

  it("expands selected capabilities into server-controlled binding permissions", async () => {
    prismaMock.appIntegrationBinding.upsert.mockImplementation(
      async (args: { create: Record<string, unknown> }) => ({
        id: "binding-1",
        ...args.create,
        createdAt: new Date("2026-08-09T00:00:00Z"),
        updatedAt: new Date("2026-08-09T00:00:00Z"),
      }),
    );

    await service().upsertBinding("org-1", "owner-1", "member", {
      sessionGroupId: "app-1",
      integrationId: "github",
      capabilityIds: ["profile", "repositories"],
      executionIdentity: "viewer",
    });

    expect(prismaMock.appIntegrationBinding.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          integrationId: "github",
          label: "GitHub",
          provider: "GitHub",
          providerConfigKey: "github-getting-started",
          allowedMethods: ["GET"],
          allowedPathPrefixes: ["/user", "/repos", "/user/repos"],
        }),
      }),
    );
  });

  it("resolves a binding by its stable integration name", async () => {
    prismaMock.appIntegrationBinding.findFirst.mockResolvedValue({
      id: "binding-1",
      organizationId: "org-1",
      sessionGroupId: "app-1",
      provider: "GitHub",
      providerConfigKey: "github-getting-started",
      executionIdentity: "viewer",
      sharedConnectionId: null,
      allowedMethods: ["GET"],
      allowedPathPrefixes: ["/user"],
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

    await service().execute({
      endpoint: { organizationId: "org-1", sessionGroupId: "app-1" },
      userId: "viewer-1",
      bindingId: "github",
      method: "GET",
      path: "/user",
      query: null,
      contentType: null,
      body: Buffer.alloc(0),
    });

    expect(prismaMock.appIntegrationBinding.findFirst).toHaveBeenCalledWith({
      where: {
        OR: [
          { integrationId: "github" },
          { integrationId: null, providerConfigKey: "github-getting-started" },
        ],
        organizationId: "org-1",
        sessionGroupId: "app-1",
      },
    });
  });

  it("does not report a completed provider request as failed when completion auditing fails", async () => {
    prismaMock.appIntegrationBinding.findFirst.mockResolvedValue({
      id: "binding-1",
      organizationId: "org-1",
      sessionGroupId: "app-1",
      provider: "GitHub",
      providerConfigKey: "github-getting-started",
      executionIdentity: "viewer",
      sharedConnectionId: null,
      allowedMethods: ["GET"],
      allowedPathPrefixes: ["/user"],
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
    vi.mocked(auditMock.complete).mockRejectedValueOnce(new Error("audit failed"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(
      service().execute({
        endpoint: { organizationId: "org-1", sessionGroupId: "app-1" },
        userId: "viewer-1",
        bindingId: "github",
        method: "GET",
        path: "/user",
        query: null,
        contentType: null,
        body: Buffer.alloc(0),
      }),
    ).resolves.toMatchObject({ status: 200 });
    expect(auditMock.start).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-1",
        sessionGroupId: "app-1",
        bindingId: "binding-1",
        connectionId: "viewer-connection",
        userId: "viewer-1",
        method: "GET",
        path: "/user",
      }),
    );
    const auditStart = vi.mocked(auditMock.start).mock.calls[0]?.[0];
    expect(auditStart).not.toHaveProperty("body");
    expect(auditStart).not.toHaveProperty("query");
    expect(auditStart).not.toHaveProperty("providerConfigKey");
    expect(auditMock.complete).toHaveBeenCalledWith(
      expect.objectContaining({ phase: "completed", status: 200 }),
    );
    expect(consoleError).toHaveBeenCalledWith(
      "[app-integrations] failed to record provider request completion",
      expect.any(Error),
    );
  });

  it("does not contact a provider unless the request start is durably audited", async () => {
    prismaMock.appIntegrationBinding.findFirst.mockResolvedValue({
      id: "binding-1",
      organizationId: "org-1",
      sessionGroupId: "app-1",
      provider: "GitHub",
      providerConfigKey: "github-getting-started",
      executionIdentity: "viewer",
      sharedConnectionId: null,
      allowedMethods: ["GET"],
      allowedPathPrefixes: ["/user"],
    });
    prismaMock.integrationConnection.findFirst.mockResolvedValue({
      id: "viewer-connection",
      nangoConnectionId: "nango-viewer-1",
    });
    vi.mocked(auditMock.start).mockRejectedValueOnce(new Error("audit unavailable"));

    await expect(
      service().execute({
        endpoint: { organizationId: "org-1", sessionGroupId: "app-1" },
        userId: "viewer-1",
        bindingId: "github",
        method: "GET",
        path: "/user",
        query: null,
        contentType: null,
        body: Buffer.alloc(0),
      }),
    ).rejects.toThrow("audit unavailable");
    expect(nangoMock.proxy).not.toHaveBeenCalled();
  });

  it.each([
    { success: false, status: "error", lastError: "expired" },
    { success: true, status: "active", lastError: null },
  ])("reconciles credential refresh state through an event: $status", async (expected) => {
    prismaMock.integrationConnection.findUnique.mockResolvedValue({
      id: "connection-1",
      organizationId: "org-1",
      ownerUserId: "viewer-1",
    });
    prismaMock.integrationConnection.update.mockResolvedValue({
      id: "connection-1",
      organizationId: "org-1",
      ownerUserId: "viewer-1",
      provider: "github",
      providerConfigKey: "github-getting-started",
      displayName: "GitHub account",
      kind: "personal",
      status: expected.status,
      lastError: expected.lastError,
      createdAt: new Date("2026-08-09T00:00:00Z"),
      updatedAt: new Date("2026-08-09T00:00:00Z"),
    });

    await service().reconcileNangoAuthWebhook({
      type: "auth",
      operation: "refresh",
      success: expected.success,
      connectionId: "nango-1",
      providerConfigKey: "github-getting-started",
      provider: "github",
      error: expected.success ? null : { description: "expired" },
      tags: { organization_id: "org-1", end_user_id: "viewer-1" },
    });

    expect(prismaMock.integrationConnection.update).toHaveBeenCalledWith({
      where: { id: "connection-1" },
      data: { status: expected.status, lastError: expected.lastError },
    });
    expect(eventMock.create).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "integration_connection_updated" }),
      expect.any(Object),
    );
  });

  it("rejects a second service connection during webhook reconciliation", async () => {
    prismaMock.orgMember.findUnique.mockResolvedValue({ role: "admin" });
    prismaMock.integrationConnection.findFirst.mockResolvedValue({ id: "service-1" });

    await expect(
      service().reconcileNangoAuthWebhook({
        type: "auth",
        operation: "creation",
        success: true,
        connectionId: "nango-2",
        providerConfigKey: "github-getting-started",
        provider: "github",
        tags: {
          organization_id: "org-1",
          end_user_id: "admin-1",
          trace_connection_kind: "service",
        },
      }),
    ).rejects.toThrow(new ValidationError("This organization already has a service connection"));
    expect(prismaMock.integrationConnection.upsert).not.toHaveBeenCalled();
  });

  it("rejects encoded path traversal before calling Nango", () => {
    expect(() => normalizeIntegrationPath("/repos/%2e%2e/admin")).toThrow(ValidationError);
    expect(() => normalizeIntegrationPath("/repos/%252e%252e/admin")).toThrow(ValidationError);
  });

  it("does not allow a viewer binding to smuggle a shared connection", async () => {
    await expect(
      service().upsertBinding("org-1", "owner-1", "member", {
        sessionGroupId: "app-1",
        integrationId: "github",
        capabilityIds: ["repositories"],
        executionIdentity: "viewer",
        sharedConnectionId: "ceo-connection",
      }),
    ).rejects.toThrow("Viewer connections cannot specify a shared connection");
  });

  it("does not let an admin share another user's personal connection", async () => {
    prismaMock.integrationConnection.findFirst.mockResolvedValue({
      id: "other-connection",
      organizationId: "org-1",
      ownerUserId: "other-user",
      providerConfigKey: "github-getting-started",
      kind: "personal",
      status: "active",
    });

    await expect(
      service().upsertBinding("org-1", "owner-1", "admin", {
        sessionGroupId: "app-1",
        integrationId: "github",
        capabilityIds: ["profile"],
        executionIdentity: "shared",
        sharedConnectionId: "other-connection",
      }),
    ).rejects.toThrow("Only the connection owner can share a personal connection");
    expect(prismaMock.appIntegrationBinding.upsert).not.toHaveBeenCalled();
  });

  it("runs an allowed request with the current viewer's connection", async () => {
    prismaMock.appIntegrationBinding.findFirst.mockResolvedValue({
      id: "binding-1",
      organizationId: "org-1",
      sessionGroupId: "app-1",
      provider: "GitHub",
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

    const response = await service().execute({
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
      service().execute({
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

  it("accepts a single read-only Snowflake query", () => {
    expect(() =>
      assertSnowflakeReadOnlyQuery(`
        WITH totals AS (
          SELECT region, SUM(revenue) AS revenue
          FROM analytics.sales
          WHERE note = 'delete; is text'
          GROUP BY region
        )
        SELECT * FROM totals
      `),
    ).not.toThrow();
  });

  it.each([
    "DELETE FROM analytics.sales",
    "SELECT * FROM analytics.sales; DROP TABLE analytics.sales",
    "WITH rows AS (SELECT * FROM analytics.sales) UPDATE analytics.sales SET revenue = 0",
    "/* harmless */ CALL refresh_finance()",
    "SELECT SYSTEM$CANCEL_QUERY('query-id')",
  ])("rejects a non-read-only Snowflake statement: %s", (sql) => {
    expect(() => assertSnowflakeReadOnlyQuery(sql)).toThrow(ValidationError);
  });

  it("runs Snowflake SQL through the current viewer connection with typed bindings", async () => {
    prismaMock.appIntegrationBinding.findFirst.mockResolvedValue({
      id: "binding-1",
      organizationId: "org-1",
      sessionGroupId: "app-1",
      provider: "Snowflake",
      providerConfigKey: "snowflake",
      executionIdentity: "viewer",
      sharedConnectionId: null,
      allowedMethods: ["POST"],
      allowedPathPrefixes: ["/api/v2/statements"],
    });
    prismaMock.integrationConnection.findFirst.mockResolvedValue({
      id: "viewer-connection",
      nangoConnectionId: "nango-viewer-1",
    });
    nangoMock.proxy.mockResolvedValue({
      status: 200,
      contentType: "application/json",
      body: Buffer.from('{"data":[["east","42"]]}'),
    });

    const response = await service().executeSnowflakeQuery({
      endpoint: { organizationId: "org-1", sessionGroupId: "app-1" },
      userId: "viewer-1",
      bindingId: "binding-1",
      query: {
        sql: "SELECT * FROM analytics.sales WHERE year = ? AND active = ?",
        parameters: [2026, true],
        warehouse: "REPORTING_WH",
      },
    });

    expect(response.status).toBe(200);
    expect(nangoMock.proxy).toHaveBeenCalledWith(
      expect.objectContaining({
        connectionId: "nango-viewer-1",
        method: "POST",
        path: "/api/v2/statements",
        contentType: "application/json",
      }),
    );
    const proxyInput = nangoMock.proxy.mock.calls[0]?.[0] as { body: Buffer };
    expect(JSON.parse(proxyInput.body.toString("utf8"))).toEqual({
      statement: "SELECT * FROM analytics.sales WHERE year = ? AND active = ?",
      timeout: 30,
      bindings: {
        "1": { type: "FIXED", value: "2026" },
        "2": { type: "BOOLEAN", value: "true" },
      },
      warehouse: "REPORTING_WH",
    });
  });

  it("blocks the generic proxy from bypassing Snowflake query validation", async () => {
    prismaMock.appIntegrationBinding.findFirst.mockResolvedValue({
      id: "binding-1",
      organizationId: "org-1",
      sessionGroupId: "app-1",
      provider: "Snowflake",
      providerConfigKey: "snowflake",
      executionIdentity: "viewer",
      sharedConnectionId: null,
      allowedMethods: ["POST"],
      allowedPathPrefixes: ["/api/v2/statements"],
    });

    await expect(
      service().execute({
        endpoint: { organizationId: "org-1", sessionGroupId: "app-1" },
        userId: "viewer-1",
        bindingId: "binding-1",
        method: "POST",
        path: "/api/v2/statements",
        query: null,
        contentType: "application/json",
        body: Buffer.from('{"statement":"DELETE FROM analytics.sales"}'),
      }),
    ).rejects.toThrow("server-side Trace integration helper");
    expect(nangoMock.proxy).not.toHaveBeenCalled();
  });
});
