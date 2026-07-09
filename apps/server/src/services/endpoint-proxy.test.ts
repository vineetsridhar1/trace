import { PassThrough } from "stream";
import type { IncomingMessage, ServerResponse } from "http";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/db.js", async () => {
  const { createPrismaMock } = await import("../../test/helpers.js");
  return { prisma: createPrismaMock() };
});

vi.mock("../lib/session-router.js", () => ({
  sessionRouter: {
    getRuntime: vi.fn(),
    sendToRuntime: vi.fn(),
  },
}));

import { prisma } from "../lib/db.js";
import { sessionRouter } from "../lib/session-router.js";
import { ENDPOINT_PREVIEW_COOKIE, createEndpointPreviewToken } from "./endpoint-preview-auth.js";
import { EndpointProxyService } from "./endpoint-proxy.js";

const prismaMock = prisma as ReturnType<typeof import("../../test/helpers.js").createPrismaMock>;
const sessionRouterMock = sessionRouter as unknown as {
  getRuntime: ReturnType<typeof vi.fn>;
  sendToRuntime: ReturnType<typeof vi.fn>;
};

type RecordedResponse = ServerResponse & {
  statusCodeValue: number | null;
  headersValue: Record<string, string | string[]>;
  bodyValue: string;
};

function makeRequest(input: {
  url: string;
  method?: string;
  headers?: Record<string, string>;
}): IncomingMessage {
  const req = new PassThrough() as IncomingMessage;
  req.url = input.url;
  req.method = input.method ?? "GET";
  req.headers = input.headers ?? {};
  req.end();
  return req;
}

function makeResponse(): RecordedResponse {
  const recorder = {
    statusCodeValue: null as number | null,
    headersValue: {} as Record<string, string | string[]>,
    bodyValue: "",
    headersSent: false,
    writeHead(statusCode: number, headers?: Record<string, string | string[]>) {
      this.statusCodeValue = statusCode;
      this.headersValue = headers ?? {};
      this.headersSent = true;
      return this;
    },
    end(chunk?: string | Buffer) {
      if (Buffer.isBuffer(chunk)) {
        this.bodyValue += chunk.toString("utf8");
      } else if (typeof chunk === "string") {
        this.bodyValue += chunk;
      }
      this.headersSent = true;
      return this;
    },
  };
  return recorder as unknown as RecordedResponse;
}

function endpoint(overrides: Record<string, unknown> = {}) {
  return {
    id: "endpoint-1",
    key: "endpointkey1",
    organizationId: "org-1",
    sessionGroupId: "group-1",
    appConfigId: "web",
    processConfigId: "dev",
    portConfigId: "web",
    status: "enabled",
    accessMode: "private",
    trafficCaptureMode: "metadata",
    targetPort: 3000,
    expiresAt: null,
    revokedAt: null,
    ...overrides,
  };
}

function previewCookie() {
  const { token } = createEndpointPreviewToken({
    userId: "user-1",
    organizationId: "org-1",
    endpointId: "endpoint-1",
  });
  return `${ENDPOINT_PREVIEW_COOKIE}=${encodeURIComponent(token)}`;
}

describe("EndpointProxyService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.sessionEndpoint.findUnique.mockResolvedValue(endpoint());
    prismaMock.sessionGroup.findFirst.mockResolvedValue({
      visibility: "public",
      ownerUserId: "owner-1",
    });
    prismaMock.sessionApplicationProcess.findUnique.mockResolvedValue({
      id: "process-1",
      status: "running",
      runtimeInstanceId: "runtime-1",
    });
    prismaMock.endpointTrafficEntry.create.mockResolvedValue({ id: "traffic-1" });
    prismaMock.endpointTrafficEntry.update.mockResolvedValue({ id: "traffic-1" });
    sessionRouterMock.getRuntime.mockReturnValue({
      key: "runtime-1",
      ws: { readyState: 1, OPEN: 1 },
    });
    sessionRouterMock.sendToRuntime.mockReturnValue("delivered");
  });

  it("sets an endpoint-host preview cookie from a signed auth URL", async () => {
    const { token } = createEndpointPreviewToken({
      userId: "user-1",
      organizationId: "org-1",
      endpointId: "endpoint-1",
    });
    const service = new EndpointProxyService();
    const res = makeResponse();

    await service.handleHttpRequest(
      makeRequest({ url: `/__trace_preview_auth?token=${encodeURIComponent(token)}&next=/` }),
      res,
      "endpointkey1",
    );

    expect(res.statusCodeValue).toBe(302);
    expect(res.headersValue["Set-Cookie"]).toEqual(
      expect.stringContaining(`${ENDPOINT_PREVIEW_COOKIE}=`),
    );
    expect(res.headersValue.Location).toBe("/");
  });

  it("accepts preview cookies for private endpoints and injects the app overlay into HTML", async () => {
    const service = new EndpointProxyService();
    const res = makeResponse();

    await service.handleHttpRequest(
      makeRequest({
        url: "/",
        headers: { cookie: previewCookie() },
      }),
      res,
      "endpointkey1",
    );

    const command = sessionRouterMock.sendToRuntime.mock.calls[0]?.[1] as
      | { type?: string; requestId?: string }
      | undefined;
    expect(command).toMatchObject({
      type: "endpoint_http_request",
      endpointId: "endpoint-1",
      port: 3000,
    });
    if (!command?.requestId) throw new Error("missing proxy request id");

    service.resolveHttpResponse(command.requestId, {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "content-length": "74",
      },
      bodyBase64: Buffer.from(
        '<!doctype html><html><body><button data-trace-source="app/page.tsx:12">Go</button></body></html>',
      ).toString("base64"),
    });

    expect(res.statusCodeValue).toBe(200);
    expect(res.bodyValue).toContain("data-trace-app-overlay");
    expect(res.bodyValue).toContain("data-trace-source");
    expect(res.headersValue["content-length"]).toBeUndefined();
  });

  it("renders published public endpoints without auth or authoring overlay injection", async () => {
    prismaMock.sessionEndpoint.findUnique.mockResolvedValue(
      endpoint({
        accessMode: "public",
      }),
    );
    const service = new EndpointProxyService();
    const res = makeResponse();

    await service.handleHttpRequest(makeRequest({ url: "/" }), res, "endpointkey1");

    expect(prismaMock.sessionGroup.findFirst).not.toHaveBeenCalled();
    const command = sessionRouterMock.sendToRuntime.mock.calls[0]?.[1] as
      | { type?: string; requestId?: string }
      | undefined;
    expect(command).toMatchObject({
      type: "endpoint_http_request",
      endpointId: "endpoint-1",
      port: 3000,
    });
    if (!command?.requestId) throw new Error("missing proxy request id");

    service.resolveHttpResponse(command.requestId, {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
      },
      bodyBase64: Buffer.from(
        '<!doctype html><html><body><main data-trace-source="app/page.tsx:11">Published app</main></body></html>',
      ).toString("base64"),
    });

    expect(res.statusCodeValue).toBe(200);
    expect(res.bodyValue).toContain("Published app");
    expect(res.bodyValue).toContain('data-trace-source="app/page.tsx:11"');
    expect(res.bodyValue).not.toContain("data-trace-app-overlay");
  });
});
