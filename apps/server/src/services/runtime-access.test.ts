import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/db.js", async () => {
  const { createPrismaMock } = await import("../../test/helpers.js");
  return { prisma: createPrismaMock() };
});

vi.mock("../lib/session-router.js", () => ({
  sessionRouter: {
    isRuntimeAvailable: vi.fn().mockReturnValue(true),
    getRuntime: vi.fn().mockReturnValue({
      id: "runtime-1",
      label: "Laptop",
      hostingMode: "local",
    }),
  },
}));

vi.mock("./event.js", () => ({
  eventService: {
    create: vi.fn(),
  },
}));

import { prisma } from "../lib/db.js";
import { sessionRouter } from "../lib/session-router.js";
import { AuthorizationError } from "../lib/errors.js";
import { eventService } from "./event.js";
import { runtimeAccessService } from "./runtime-access.js";

const prismaMock = prisma as ReturnType<typeof import("../../test/helpers.js").createPrismaMock>;
const sessionRouterMock = sessionRouter as unknown as {
  isRuntimeAvailable: ReturnType<typeof vi.fn>;
  getRuntime: ReturnType<typeof vi.fn>;
};
const eventServiceMock = eventService as unknown as {
  create: ReturnType<typeof vi.fn>;
};

describe("runtimeAccessService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionRouterMock.isRuntimeAvailable.mockReturnValue(true);
    sessionRouterMock.getRuntime.mockReturnValue({
      id: "runtime-1",
      label: "Laptop",
      hostingMode: "local",
    });
  });

  it("grants access to the bridge owner", async () => {
    prismaMock.bridgeRuntime.findUnique.mockResolvedValueOnce({
      id: "bridge-1",
      instanceId: "runtime-1",
      organizationId: "org-1",
      ownerUserId: "user-1",
      label: "Laptop",
      ownerUser: { id: "user-1", name: "Owner" },
      accessGrants: [],
      accessRequests: [],
    });

    const access = await runtimeAccessService.getAccessState({
      userId: "user-1",
      organizationId: "org-1",
      runtimeInstanceId: "runtime-1",
    });

    expect(access.allowed).toBe(true);
    expect(access.isOwner).toBe(true);
    expect(access.scopeType).toBe("all_sessions");
  });

  it("returns an active session-group grant for a non-owner", async () => {
    prismaMock.bridgeRuntime.findUnique.mockResolvedValueOnce({
      id: "bridge-1",
      instanceId: "runtime-1",
      organizationId: "org-1",
      ownerUserId: "user-1",
      label: "Laptop",
      ownerUser: { id: "user-1", name: "Owner" },
      accessGrants: [
        {
          id: "grant-1",
          scopeType: "session_group",
          sessionGroupId: "group-1",
          expiresAt: null,
          granteeUser: { id: "user-2", name: "Guest" },
          grantedByUser: { id: "user-1", name: "Owner" },
          sessionGroup: { id: "group-1", name: "Workspace" },
        },
      ],
      accessRequests: [],
    });

    const access = await runtimeAccessService.getAccessState({
      userId: "user-2",
      organizationId: "org-1",
      runtimeInstanceId: "runtime-1",
      sessionGroupId: "group-1",
    });

    expect(access.allowed).toBe(true);
    expect(access.isOwner).toBe(false);
    expect(access.scopeType).toBe("session_group");
    expect(access.sessionGroupId).toBe("group-1");
  });

  it("throws for denied local bridge access", async () => {
    prismaMock.bridgeRuntime.findUnique.mockResolvedValueOnce({
      id: "bridge-1",
      instanceId: "runtime-1",
      organizationId: "org-1",
      ownerUserId: "user-1",
      label: "Laptop",
      ownerUser: { id: "user-1", name: "Owner" },
      accessGrants: [],
      accessRequests: [],
    });

    await expect(
      runtimeAccessService.assertAccess({
        userId: "user-2",
        organizationId: "org-1",
        runtimeInstanceId: "runtime-1",
      }),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("emits an owner-only bridge request event when access is requested", async () => {
    prismaMock.bridgeRuntime.findUnique.mockResolvedValueOnce({
      id: "bridge-1",
      instanceId: "runtime-1",
      organizationId: "org-1",
      ownerUserId: "user-1",
      label: "Laptop",
      ownerUser: { id: "user-1", name: "Owner" },
    });
    prismaMock.sessionGroup.findFirst.mockResolvedValueOnce({ id: "group-1" });
    prismaMock.bridgeAccessGrant.findFirst.mockResolvedValueOnce(null);
    prismaMock.bridgeAccessRequest.findFirst.mockResolvedValueOnce(null);
    prismaMock.bridgeAccessRequest.create.mockResolvedValueOnce({
      id: "request-1",
      bridgeRuntimeId: "bridge-1",
      ownerUserId: "user-1",
      scopeType: "session_group",
      sessionGroupId: "group-1",
      requestedExpiresAt: null,
      createdAt: new Date("2026-04-18T12:00:00.000Z"),
      status: "pending",
      bridgeRuntime: {
        id: "bridge-1",
        instanceId: "runtime-1",
        label: "Laptop",
      },
      requesterUser: {
        id: "user-2",
        name: "Guest",
        email: "guest@example.com",
        avatarUrl: null,
      },
      ownerUser: { id: "user-1", name: "Owner" },
      resolvedByUser: null,
      sessionGroup: { id: "group-1", name: "Workspace" },
    });

    await runtimeAccessService.requestAccess({
      requesterUserId: "user-2",
      organizationId: "org-1",
      runtimeInstanceId: "runtime-1",
      scopeType: "session_group",
      sessionGroupId: "group-1",
    });

    expect(eventServiceMock.create).toHaveBeenCalledWith({
      organizationId: "org-1",
      scopeType: "system",
      scopeId: "org-1",
      eventType: "bridge_access_requested",
      payload: expect.objectContaining({
        ownerUserId: "user-1",
        requestId: "request-1",
        runtimeInstanceId: "runtime-1",
        runtimeLabel: "Laptop",
        scopeType: "session_group",
        status: "pending",
      }),
      actorType: "user",
      actorId: "user-2",
    });
  });

  it("allows owners to override approvals from the popup presets", async () => {
    prismaMock.bridgeAccessRequest.findUnique.mockResolvedValueOnce({
      id: "request-1",
      bridgeRuntimeId: "bridge-1",
      requesterUserId: "user-2",
      ownerUserId: "user-1",
      scopeType: "all_sessions",
      sessionGroupId: null,
      requestedExpiresAt: null,
      createdAt: new Date("2026-04-18T12:00:00.000Z"),
      status: "pending",
      bridgeRuntime: {
        id: "bridge-1",
        instanceId: "runtime-1",
        label: "Laptop",
        organizationId: "org-1",
      },
      requesterUser: {
        id: "user-2",
        name: "Guest",
        email: "guest@example.com",
        avatarUrl: null,
      },
      ownerUser: { id: "user-1", name: "Owner" },
      resolvedByUser: null,
      sessionGroup: null,
    });
    prismaMock.sessionGroup.findFirst.mockResolvedValueOnce({ id: "group-1" });
    prismaMock.bridgeAccessGrant.updateMany.mockResolvedValueOnce({ count: 0 });
    prismaMock.bridgeAccessGrant.create.mockResolvedValueOnce({
      id: "grant-1",
      scopeType: "session_group",
      sessionGroupId: "group-1",
      expiresAt: null,
      createdAt: new Date("2026-04-18T12:05:00.000Z"),
      granteeUser: { id: "user-2", name: "Guest" },
      grantedByUser: { id: "user-1", name: "Owner" },
      sessionGroup: { id: "group-1", name: "Workspace" },
    });
    prismaMock.bridgeAccessRequest.update.mockResolvedValueOnce({
      id: "request-1",
    });

    await runtimeAccessService.approveRequest({
      requestId: "request-1",
      organizationId: "org-1",
      ownerUserId: "user-1",
      scopeType: "session_group",
      sessionGroupId: "group-1",
      expiresAt: null,
    });

    expect(prismaMock.bridgeAccessGrant.create).toHaveBeenCalledWith({
      data: {
        bridgeRuntimeId: "bridge-1",
        granteeUserId: "user-2",
        grantedByUserId: "user-1",
        scopeType: "session_group",
        sessionGroupId: "group-1",
        expiresAt: null,
      },
      include: {
        granteeUser: true,
        grantedByUser: true,
        sessionGroup: true,
      },
    });

    expect(eventServiceMock.create).toHaveBeenCalledWith({
      organizationId: "org-1",
      scopeType: "system",
      scopeId: "org-1",
      eventType: "bridge_access_request_resolved",
      payload: expect.objectContaining({
        ownerUserId: "user-1",
        requestId: "request-1",
        status: "approved",
        grant: expect.objectContaining({
          id: "grant-1",
          scopeType: "session_group",
          sessionGroupId: "group-1",
        }),
      }),
      actorType: "user",
      actorId: "user-1",
    });
  });
});
