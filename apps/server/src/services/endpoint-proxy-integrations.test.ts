import type { IncomingMessage, ServerResponse } from "http";
import { Readable } from "stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/db.js", async () => {
  const { createPrismaMock } = await import("../../test/helpers.js");
  return { prisma: createPrismaMock() };
});

vi.mock("../lib/session-router.js", () => ({
  sessionRouter: { getRuntimeDescriptor: vi.fn(), sendToRuntimeAsync: vi.fn() },
}));

vi.mock("./app-integrations.js", () => ({
  appIntegrationService: { execute: vi.fn() },
}));

import { prisma } from "../lib/db.js";
import { sessionRouter } from "../lib/session-router.js";
import { appIntegrationService } from "./app-integrations.js";
import { verifyAppViewerContextToken } from "./app-viewer-context.js";
import { createEndpointPreviewToken } from "./endpoint-preview-auth.js";
import { EndpointProxyService } from "./endpoint-proxy.js";

const prismaMock = prisma as ReturnType<typeof import("../../test/helpers.js").createPrismaMock>;
const integrationMock = appIntegrationService as unknown as { execute: ReturnType<typeof vi.fn> };
const sessionRouterMock = sessionRouter as unknown as {
  getRuntimeDescriptor: ReturnType<typeof vi.fn>;
  sendToRuntimeAsync: ReturnType<typeof vi.fn>;
};

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

  it("injects a short-lived viewer context into authorized app API requests", async () => {
    const { token } = createEndpointPreviewToken({
      userId: "viewer-1",
      organizationId: "org-1",
      endpointId: "endpoint-1",
    });
    prismaMock.orgMember.findUnique.mockResolvedValue({ userId: "viewer-1" });
    prismaMock.sessionGroup.findFirst.mockResolvedValue({
      ownerUserId: "owner-1",
      visibility: "public",
    });
    prismaMock.sessionApplicationProcess.findUnique.mockResolvedValue({
      id: "process-1",
      status: "running",
      runtimeInstanceId: "runtime-1",
    });
    prismaMock.endpointTrafficEntry.create.mockResolvedValue({ id: "traffic-1" });
    sessionRouterMock.getRuntimeDescriptor.mockReturnValue({
      key: "runtime-key",
    });
    sessionRouterMock.sendToRuntimeAsync.mockResolvedValue("unavailable");
    const request = Object.assign(Readable.from([]), {
      url: "/api/revenue",
      method: "GET",
      headers: {
        cookie: `__trace_endpoint_preview=${encodeURIComponent(token)}`,
        "x-trace-app-viewer-context": "forged",
      },
    }) as IncomingMessage;
    const response = { writeHead: vi.fn(), end: vi.fn() };
    response.writeHead.mockReturnValue(response as unknown as ServerResponse);

    await new EndpointProxyService().handleHttpRequest(
      request,
      response as unknown as ServerResponse,
      "endpoint-key",
    );

    const message = sessionRouterMock.sendToRuntimeAsync.mock.calls[0]?.[1] as {
      headers: Record<string, string>;
    };
    const context = verifyAppViewerContextToken(message.headers["x-trace-app-viewer-context"]!);
    expect(context).toEqual(
      expect.objectContaining({
        userId: "viewer-1",
        organizationId: "org-1",
        sessionGroupId: "app-1",
        endpointId: "endpoint-1",
      }),
    );
    expect(message.headers.cookie).toBeUndefined();
  });
});
