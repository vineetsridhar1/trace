import type { IncomingMessage, ServerResponse } from "http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/db.js", async () => {
  const { createPrismaMock } = await import("../../test/helpers.js");
  return { prisma: createPrismaMock() };
});

vi.mock("../lib/session-router.js", () => ({
  sessionRouter: { getRuntime: vi.fn(), sendToRuntime: vi.fn() },
}));

vi.mock("./app-integrations.js", () => ({
  appIntegrationService: { execute: vi.fn() },
}));

import { prisma } from "../lib/db.js";
import { appIntegrationService } from "./app-integrations.js";
import { EndpointProxyService } from "./endpoint-proxy.js";

const prismaMock = prisma as ReturnType<typeof import("../../test/helpers.js").createPrismaMock>;
const integrationMock = appIntegrationService as unknown as { execute: ReturnType<typeof vi.fn> };

describe("EndpointProxyService application integrations", () => {
  afterEach(() => vi.unstubAllEnvs());

  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.sessionEndpoint.findUnique.mockResolvedValue({
      id: "endpoint-1",
      key: "endpoint-key",
      organizationId: "org-1",
      sessionGroupId: "app-1",
      status: "enabled",
      accessMode: "public",
      expiresAt: null,
    });
  });

  it("rejects anonymous integration calls even when the app endpoint is public", async () => {
    const request = {
      url: "/__trace/integrations/binding-1/repos/acme/trace",
      method: "GET",
      headers: {},
    } as IncomingMessage;
    const response = {
      writeHead: vi.fn(),
      end: vi.fn(),
    };
    response.writeHead.mockReturnValue(response as unknown as ServerResponse);

    await new EndpointProxyService().handleHttpRequest(
      request,
      response as unknown as ServerResponse,
      "endpoint-key",
    );

    expect(response.writeHead).toHaveBeenCalledWith(401);
    expect(response.end).toHaveBeenCalledWith("Authentication required");
    expect(integrationMock.execute).not.toHaveBeenCalled();
  });

  it("bootstraps private app links through Trace without putting a user token in the link", async () => {
    vi.stubEnv("TRACE_WEB_URL", "https://trace.example.test");
    prismaMock.sessionEndpoint.findUnique.mockResolvedValueOnce({
      id: "endpoint-1",
      key: "endpoint-key",
      organizationId: "org-1",
      sessionGroupId: "app-1",
      status: "enabled",
      accessMode: "private",
      expiresAt: null,
    });
    const request = {
      url: "/reports?period=month",
      method: "GET",
      headers: { accept: "text/html" },
    } as IncomingMessage;
    const response = { writeHead: vi.fn(), end: vi.fn() };
    response.writeHead.mockReturnValue(response as unknown as ServerResponse);

    await new EndpointProxyService().handleHttpRequest(
      request,
      response as unknown as ServerResponse,
      "endpoint-key",
    );

    const expected = new URL("https://trace.example.test/auth/app-access");
    expected.searchParams.set("endpointId", "endpoint-1");
    expected.searchParams.set("next", "/reports?period=month");
    expect(response.writeHead).toHaveBeenCalledWith(302, {
      Location: expected.toString(),
      "Cache-Control": "no-store",
    });
    expect(expected.searchParams.has("token")).toBe(false);
  });
});
