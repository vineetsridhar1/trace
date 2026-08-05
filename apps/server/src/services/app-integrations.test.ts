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
import {
  AppIntegrationService,
  assertSnowflakeReadOnlyQuery,
  normalizeIntegrationPath,
} from "./app-integrations.js";
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

    const response = await new AppIntegrationService().executeSnowflakeQuery({
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
      new AppIntegrationService().execute({
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
