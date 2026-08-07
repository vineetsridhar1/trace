import type { IncomingMessage, ServerResponse } from "http";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/db.js", async () => {
  const { createPrismaMock } = await import("../../test/helpers.js");
  return { prisma: createPrismaMock() };
});

vi.mock("../lib/auth.js", () => ({
  parseCookieToken: vi.fn().mockReturnValue("trace-session-token"),
  verifyToken: vi.fn().mockReturnValue("user-org-1"),
}));

vi.mock("../lib/session-router.js", () => ({
  sessionRouter: {
    getRuntime: vi.fn(),
    sendToRuntime: vi.fn(),
  },
}));

import { prisma } from "../lib/db.js";
import { sessionRouter } from "../lib/session-router.js";
import { createPrismaMock } from "../../test/helpers.js";
import { EndpointProxyService } from "./endpoint-proxy.js";

const prismaMock = prisma as unknown as ReturnType<typeof createPrismaMock>;
const sessionRouterMock = sessionRouter as unknown as {
  getRuntime: ReturnType<typeof vi.fn>;
  sendToRuntime: ReturnType<typeof vi.fn>;
};

function request(): IncomingMessage {
  return {
    headers: { cookie: "trace_token=trace-session-token" },
    method: "GET",
    url: "/",
  } as IncomingMessage;
}

function response(): ServerResponse {
  return {
    writeHead: vi.fn().mockReturnThis(),
    end: vi.fn(),
  } as unknown as ServerResponse;
}

describe("EndpointProxyService organization isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("denies a private preview when the user is not in the endpoint organization", async () => {
    prismaMock.sessionEndpoint.findUnique.mockResolvedValue({
      id: "endpoint-org-2",
      key: "preview-org-2",
      organizationId: "org-2",
      sessionGroupId: "group-org-2",
      appConfigId: "app-1",
      processConfigId: "process-1",
      status: "enabled",
      accessMode: "private",
      expiresAt: null,
    });
    prismaMock.orgMember.findUnique.mockResolvedValue(null);
    const res = response();

    await new EndpointProxyService().handleHttpRequest(request(), res, "preview-org-2");

    expect(prismaMock.orgMember.findUnique).toHaveBeenCalledWith({
      where: {
        userId_organizationId: {
          userId: "user-org-1",
          organizationId: "org-2",
        },
      },
      select: { userId: true },
    });
    expect(res.writeHead).toHaveBeenCalledWith(403);
    expect(res.end).toHaveBeenCalledWith("Forbidden");
    expect(prismaMock.sessionGroup.findFirst).not.toHaveBeenCalled();
    expect(sessionRouterMock.getRuntime).not.toHaveBeenCalled();
    expect(sessionRouterMock.sendToRuntime).not.toHaveBeenCalled();
  });
});
