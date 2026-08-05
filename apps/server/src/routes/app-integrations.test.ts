import { createServer, type Server } from "http";
import express from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/db.js", async () => {
  const { createPrismaMock } = await import("../../test/helpers.js");
  return { prisma: createPrismaMock() };
});

vi.mock("../services/app-integrations.js", () => ({
  appIntegrationService: { executeSnowflakeQuery: vi.fn() },
}));

import { prisma } from "../lib/db.js";
import { appIntegrationService } from "../services/app-integrations.js";
import { createAppViewerContextToken } from "../services/app-viewer-context.js";
import { appIntegrationsRouter } from "./app-integrations.js";

const prismaMock = prisma as ReturnType<typeof import("../../test/helpers.js").createPrismaMock>;
const integrationMock = appIntegrationService as unknown as {
  executeSnowflakeQuery: ReturnType<typeof vi.fn>;
};

describe("app integration runtime routes", () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use(appIntegrationsRouter);
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
    prismaMock.sessionEndpoint.findFirst.mockResolvedValue({
      organizationId: "org-1",
      sessionGroupId: "app-1",
    });
    integrationMock.executeSnowflakeQuery.mockResolvedValue({
      status: 200,
      contentType: "application/json",
      body: Buffer.from('{"data":[["east","42"]]}'),
    });
  });

  it("rejects calls without a signed viewer context", async () => {
    const response = await fetch(`${baseUrl}/runtime/app-integrations/binding-1/snowflake/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sql: "SELECT 1" }),
    });

    expect(response.status).toBe(401);
    expect(integrationMock.executeSnowflakeQuery).not.toHaveBeenCalled();
  });

  it("executes a query with the signed viewer and endpoint scope", async () => {
    const token = createAppViewerContextToken({
      tokenType: "app_viewer_context",
      userId: "viewer-1",
      organizationId: "org-1",
      sessionGroupId: "app-1",
      endpointId: "endpoint-1",
    });
    const response = await fetch(`${baseUrl}/runtime/app-integrations/binding-1/snowflake/query`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sql: "SELECT region FROM analytics.sales", parameters: [] }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ data: [["east", "42"]] });
    expect(integrationMock.executeSnowflakeQuery).toHaveBeenCalledWith({
      endpoint: { organizationId: "org-1", sessionGroupId: "app-1" },
      userId: "viewer-1",
      bindingId: "binding-1",
      query: { sql: "SELECT region FROM analytics.sales", parameters: [] },
    });
  });
});
