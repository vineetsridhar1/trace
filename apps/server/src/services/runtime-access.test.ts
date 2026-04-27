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

vi.mock("../lib/terminal-relay.js", () => ({
  terminalRelay: {
    getTerminalsForSession: vi.fn().mockReturnValue([]),
    destroyTerminal: vi.fn(),
    destroyTerminalsForUser: vi.fn(),
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
import { terminalRelay } from "../lib/terminal-relay.js";
import { runtimeAccessService } from "./runtime-access.js";

const prismaMock = prisma as ReturnType<typeof import("../../test/helpers.js").createPrismaMock>;
const sessionRouterMock = sessionRouter as unknown as {
  isRuntimeAvailable: ReturnType<typeof vi.fn>;
  getRuntime: ReturnType<typeof vi.fn>;
};
const eventServiceMock = eventService as unknown as {
  create: ReturnType<typeof vi.fn>;
};
const terminalRelayMock = terminalRelay as unknown as {
  getTerminalsForSession: ReturnType<typeof vi.fn>;
  destroyTerminal: ReturnType<typeof vi.fn>;
  destroyTerminalsForUser: ReturnType<typeof vi.fn>;
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
    prismaMock.bridgeRuntime.findFirst.mockResolvedValueOnce({
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
    prismaMock.bridgeRuntime.findFirst.mockResolvedValueOnce({
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
          capabilities: ["session", "terminal"],
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
    expect(access.capabilities).toEqual(["session", "terminal"]);
  });

  it("throws for denied local bridge access", async () => {
    prismaMock.bridgeRuntime.findFirst.mockResolvedValueOnce({
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

  it("does not leak bridge owner identity across organizations", async () => {
    // A bridge from a different org is connected and visible to the router,
    // but findFirst (scoped to the caller's org) returns null — so the cross-
    // org row's label / owner / bridge id must never surface.
    prismaMock.bridgeRuntime.findFirst.mockResolvedValueOnce(null);
    sessionRouterMock.getRuntime.mockReturnValue({
      id: "runtime-other-org",
      label: "Jane's Laptop",
      hostingMode: "local",
    });
    sessionRouterMock.isRuntimeAvailable.mockReturnValue(true);

    const access = await runtimeAccessService.getAccessState({
      userId: "user-2",
      organizationId: "org-1",
      runtimeInstanceId: "runtime-other-org",
    });

    expect(access.ownerUser).toBeNull();
    expect(access.bridgeRuntimeId).toBeNull();
    expect(access.label).toBeNull();
    expect(access.allowed).toBe(false);
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
    prismaMock.bridgeAccessRequest.findMany.mockResolvedValueOnce([]);
    prismaMock.bridgeAccessRequest.create.mockResolvedValueOnce({
      id: "request-1",
      bridgeRuntimeId: "bridge-1",
      ownerUserId: "user-1",
      scopeType: "session_group",
      sessionGroupId: "group-1",
      requestedCapabilities: ["session"],
      requestedExpiresAt: null,
      createdAt: new Date("2026-04-18T12:00:00.000Z"),
      status: "pending",
      bridgeRuntime: { id: "bridge-1", instanceId: "runtime-1", label: "Laptop" },
      requesterUser: { id: "user-2", name: "Guest", email: "guest@example.com", avatarUrl: null },
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

    expect(eventServiceMock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "bridge_access_requested",
        payload: expect.objectContaining({
          ownerUserId: "user-1",
          requestId: "request-1",
          runtimeInstanceId: "runtime-1",
          scopeType: "session_group",
          status: "pending",
        }),
        actorId: "user-2",
      }),
      expect.anything(),
    );
    // Audit payload must not leak the requester's email
    const createCall = eventServiceMock.create.mock.calls[0]?.[0] as
      | { payload: { requesterUser: Record<string, unknown> } }
      | undefined;
    expect(createCall?.payload.requesterUser).not.toHaveProperty("email");
  });

  it("returns the existing pending when a matching scope is re-requested", async () => {
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
    const existing = {
      id: "request-existing",
      bridgeRuntimeId: "bridge-1",
      ownerUserId: "user-1",
      scopeType: "session_group",
      sessionGroupId: "group-1",
      status: "pending",
      requestedExpiresAt: null,
      createdAt: new Date("2026-04-18T12:00:00.000Z"),
      bridgeRuntime: { id: "bridge-1", instanceId: "runtime-1", label: "Laptop" },
      requesterUser: { id: "user-2", name: "Guest", email: "guest@example.com", avatarUrl: null },
      ownerUser: { id: "user-1", name: "Owner" },
      resolvedByUser: null,
      sessionGroup: { id: "group-1", name: "Workspace" },
    };
    prismaMock.bridgeAccessRequest.findMany.mockResolvedValueOnce([existing]);

    const result = await runtimeAccessService.requestAccess({
      requesterUserId: "user-2",
      organizationId: "org-1",
      runtimeInstanceId: "runtime-1",
      scopeType: "session_group",
      sessionGroupId: "group-1",
    });

    expect(result.id).toBe("request-existing");
    expect(prismaMock.bridgeAccessRequest.create).not.toHaveBeenCalled();
    expect(prismaMock.bridgeAccessRequest.update).not.toHaveBeenCalled();
    expect(eventServiceMock.create).not.toHaveBeenCalled();
  });

  it("supersedes a prior pending with a different scope and emits a resolved event", async () => {
    prismaMock.bridgeRuntime.findUnique.mockResolvedValueOnce({
      id: "bridge-1",
      instanceId: "runtime-1",
      organizationId: "org-1",
      ownerUserId: "user-1",
      label: "Laptop",
      ownerUser: { id: "user-1", name: "Owner" },
    });
    prismaMock.bridgeAccessGrant.findFirst.mockResolvedValueOnce(null);
    const prior = {
      id: "request-prior",
      bridgeRuntimeId: "bridge-1",
      ownerUserId: "user-1",
      scopeType: "session_group",
      sessionGroupId: "group-a",
      status: "pending",
      requestedExpiresAt: null,
      createdAt: new Date("2026-04-18T12:00:00.000Z"),
      bridgeRuntime: { id: "bridge-1", instanceId: "runtime-1", label: "Laptop" },
      requesterUser: { id: "user-2", name: "Guest", email: "guest@example.com", avatarUrl: null },
      ownerUser: { id: "user-1", name: "Owner" },
      resolvedByUser: null,
      sessionGroup: { id: "group-a", name: "A" },
    };
    prismaMock.bridgeAccessRequest.findMany.mockResolvedValueOnce([prior]);
    prismaMock.bridgeAccessRequest.update.mockResolvedValueOnce({ ...prior, status: "denied" });
    prismaMock.bridgeAccessRequest.create.mockResolvedValueOnce({
      id: "request-new",
      bridgeRuntimeId: "bridge-1",
      ownerUserId: "user-1",
      scopeType: "all_sessions",
      sessionGroupId: null,
      status: "pending",
      requestedExpiresAt: null,
      createdAt: new Date("2026-04-18T12:05:00.000Z"),
      bridgeRuntime: { id: "bridge-1", instanceId: "runtime-1", label: "Laptop" },
      requesterUser: { id: "user-2", name: "Guest", email: "guest@example.com", avatarUrl: null },
      ownerUser: { id: "user-1", name: "Owner" },
      resolvedByUser: null,
      sessionGroup: null,
    });

    await runtimeAccessService.requestAccess({
      requesterUserId: "user-2",
      organizationId: "org-1",
      runtimeInstanceId: "runtime-1",
      scopeType: "all_sessions",
    });

    // The prior pending is marked denied with resolvedByUserId: null.
    expect(prismaMock.bridgeAccessRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "request-prior" },
        data: expect.objectContaining({ status: "denied", resolvedByUserId: null }),
      }),
    );

    const eventTypes = eventServiceMock.create.mock.calls.map(
      (call) => (call[0] as { eventType: string }).eventType,
    );
    expect(eventTypes).toEqual(["bridge_access_request_resolved", "bridge_access_requested"]);
  });

  it("revokeGrant tells the terminal relay to sever the grantee's terminals", async () => {
    prismaMock.bridgeAccessGrant.findUnique.mockResolvedValueOnce({
      id: "grant-1",
      granteeUserId: "user-2",
      scopeType: "session_group",
      sessionGroupId: "group-1",
      capabilities: ["session", "terminal"],
      revokedAt: null,
      bridgeRuntime: {
        id: "bridge-1",
        instanceId: "runtime-1",
        label: "Laptop",
        organizationId: "org-1",
        ownerUserId: "user-1",
      },
      granteeUser: { id: "user-2", name: "Guest" },
      grantedByUser: { id: "user-1", name: "Owner" },
      sessionGroup: { id: "group-1", name: "A" },
    });
    prismaMock.bridgeAccessGrant.update.mockResolvedValueOnce({
      id: "grant-1",
      granteeUserId: "user-2",
      scopeType: "session_group",
      sessionGroupId: "group-1",
      capabilities: ["session", "terminal"],
      revokedAt: new Date(),
      granteeUser: { id: "user-2", name: "Guest" },
      grantedByUser: { id: "user-1", name: "Owner" },
      sessionGroup: { id: "group-1", name: "A" },
    });
    prismaMock.session.findMany.mockResolvedValueOnce([{ id: "session-a" }, { id: "session-b" }]);

    await runtimeAccessService.revokeGrant({
      grantId: "grant-1",
      organizationId: "org-1",
      ownerUserId: "user-1",
    });

    expect(terminalRelayMock.destroyTerminalsForUser).toHaveBeenCalledWith(
      "user-2",
      new Set(["session-a", "session-b"]),
      "org-1",
    );
  });

  it("allows owners to override approvals from the popup presets", async () => {
    prismaMock.bridgeAccessRequest.findUnique.mockResolvedValueOnce({
      id: "request-1",
      bridgeRuntimeId: "bridge-1",
      requesterUserId: "user-2",
      ownerUserId: "user-1",
      scopeType: "all_sessions",
      sessionGroupId: null,
      requestedCapabilities: ["session"],
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
      capabilities: ["session"],
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
        capabilities: ["session"],
        expiresAt: null,
      },
      include: {
        granteeUser: true,
        grantedByUser: true,
        sessionGroup: true,
      },
    });

    expect(eventServiceMock.create).toHaveBeenCalledWith(
      {
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
            capabilities: ["session"],
          }),
        }),
        actorType: "user",
        actorId: "user-1",
      },
      expect.anything(),
    );
  });

  it("requestAccess persists requestedCapabilities and defaults to ['session'] when omitted", async () => {
    prismaMock.bridgeRuntime.findUnique.mockResolvedValueOnce({
      id: "bridge-1",
      instanceId: "runtime-1",
      organizationId: "org-1",
      ownerUserId: "user-1",
      label: "Laptop",
      ownerUser: { id: "user-1", name: "Owner" },
    });
    prismaMock.bridgeAccessGrant.findFirst.mockResolvedValueOnce(null);
    prismaMock.bridgeAccessRequest.findMany.mockResolvedValueOnce([]);
    prismaMock.bridgeAccessRequest.create.mockResolvedValueOnce({
      id: "request-1",
      bridgeRuntimeId: "bridge-1",
      ownerUserId: "user-1",
      scopeType: "all_sessions",
      sessionGroupId: null,
      requestedCapabilities: ["session"],
      requestedExpiresAt: null,
      createdAt: new Date("2026-04-18T12:00:00.000Z"),
      status: "pending",
      bridgeRuntime: { id: "bridge-1", instanceId: "runtime-1", label: "Laptop" },
      requesterUser: { id: "user-2", name: "Guest", email: null, avatarUrl: null },
      ownerUser: { id: "user-1", name: "Owner" },
      resolvedByUser: null,
      sessionGroup: null,
    });

    await runtimeAccessService.requestAccess({
      requesterUserId: "user-2",
      organizationId: "org-1",
      runtimeInstanceId: "runtime-1",
      scopeType: "all_sessions",
    });

    expect(prismaMock.bridgeAccessRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          requestedCapabilities: ["session"],
        }),
      }),
    );
  });

  it("requestAccess always ensures `session` is present in requestedCapabilities", async () => {
    prismaMock.bridgeRuntime.findUnique.mockResolvedValueOnce({
      id: "bridge-1",
      instanceId: "runtime-1",
      organizationId: "org-1",
      ownerUserId: "user-1",
      label: "Laptop",
      ownerUser: { id: "user-1", name: "Owner" },
    });
    prismaMock.bridgeAccessGrant.findFirst.mockResolvedValueOnce(null);
    prismaMock.bridgeAccessRequest.findMany.mockResolvedValueOnce([]);
    prismaMock.bridgeAccessRequest.create.mockResolvedValueOnce({
      id: "request-1",
      bridgeRuntimeId: "bridge-1",
      ownerUserId: "user-1",
      scopeType: "all_sessions",
      sessionGroupId: null,
      requestedCapabilities: ["terminal", "session"],
      requestedExpiresAt: null,
      createdAt: new Date("2026-04-18T12:00:00.000Z"),
      status: "pending",
      bridgeRuntime: { id: "bridge-1", instanceId: "runtime-1", label: "Laptop" },
      requesterUser: { id: "user-2", name: "Guest", email: null, avatarUrl: null },
      ownerUser: { id: "user-1", name: "Owner" },
      resolvedByUser: null,
      sessionGroup: null,
    });

    await runtimeAccessService.requestAccess({
      requesterUserId: "user-2",
      organizationId: "org-1",
      runtimeInstanceId: "runtime-1",
      scopeType: "all_sessions",
      requestedCapabilities: ["terminal"],
    });

    const createCall = prismaMock.bridgeAccessRequest.create.mock.calls[0]?.[0] as
      | { data: { requestedCapabilities: string[] } }
      | undefined;
    expect(createCall?.data.requestedCapabilities).toEqual(
      expect.arrayContaining(["session", "terminal"]),
    );
  });

  it("approveRequest defaults to session-only when owner omits capabilities (even if requester asked for terminal)", async () => {
    prismaMock.bridgeAccessRequest.findUnique.mockResolvedValueOnce({
      id: "request-1",
      bridgeRuntimeId: "bridge-1",
      requesterUserId: "user-2",
      ownerUserId: "user-1",
      scopeType: "all_sessions",
      sessionGroupId: null,
      requestedCapabilities: ["session", "terminal"],
      requestedExpiresAt: null,
      createdAt: new Date("2026-04-18T12:00:00.000Z"),
      status: "pending",
      bridgeRuntime: {
        id: "bridge-1",
        instanceId: "runtime-1",
        label: "Laptop",
        organizationId: "org-1",
      },
      requesterUser: { id: "user-2", name: "Guest", email: null, avatarUrl: null },
      ownerUser: { id: "user-1", name: "Owner" },
      resolvedByUser: null,
      sessionGroup: null,
    });
    prismaMock.bridgeAccessGrant.updateMany.mockResolvedValueOnce({ count: 0 });
    prismaMock.bridgeAccessGrant.create.mockResolvedValueOnce({
      id: "grant-1",
      scopeType: "all_sessions",
      sessionGroupId: null,
      capabilities: ["session"],
      expiresAt: null,
      createdAt: new Date(),
      granteeUser: { id: "user-2", name: "Guest" },
      grantedByUser: { id: "user-1", name: "Owner" },
      sessionGroup: null,
    });
    prismaMock.bridgeAccessRequest.update.mockResolvedValueOnce({ id: "request-1" });

    await runtimeAccessService.approveRequest({
      requestId: "request-1",
      organizationId: "org-1",
      ownerUserId: "user-1",
    });

    expect(prismaMock.bridgeAccessGrant.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          capabilities: ["session"],
        }),
      }),
    );
  });

  it("approveRequest honors explicit ['session','terminal'] capabilities from owner", async () => {
    prismaMock.bridgeAccessRequest.findUnique.mockResolvedValueOnce({
      id: "request-1",
      bridgeRuntimeId: "bridge-1",
      requesterUserId: "user-2",
      ownerUserId: "user-1",
      scopeType: "all_sessions",
      sessionGroupId: null,
      requestedCapabilities: ["session"],
      requestedExpiresAt: null,
      createdAt: new Date("2026-04-18T12:00:00.000Z"),
      status: "pending",
      bridgeRuntime: {
        id: "bridge-1",
        instanceId: "runtime-1",
        label: "Laptop",
        organizationId: "org-1",
      },
      requesterUser: { id: "user-2", name: "Guest", email: null, avatarUrl: null },
      ownerUser: { id: "user-1", name: "Owner" },
      resolvedByUser: null,
      sessionGroup: null,
    });
    prismaMock.bridgeAccessGrant.updateMany.mockResolvedValueOnce({ count: 0 });
    prismaMock.bridgeAccessGrant.create.mockResolvedValueOnce({
      id: "grant-1",
      scopeType: "all_sessions",
      sessionGroupId: null,
      capabilities: ["session", "terminal"],
      expiresAt: null,
      createdAt: new Date(),
      granteeUser: { id: "user-2", name: "Guest" },
      grantedByUser: { id: "user-1", name: "Owner" },
      sessionGroup: null,
    });
    prismaMock.bridgeAccessRequest.update.mockResolvedValueOnce({ id: "request-1" });

    await runtimeAccessService.approveRequest({
      requestId: "request-1",
      organizationId: "org-1",
      ownerUserId: "user-1",
      capabilities: ["session", "terminal"],
    });

    const createCall = prismaMock.bridgeAccessGrant.create.mock.calls[0]?.[0] as
      | { data: { capabilities: string[] } }
      | undefined;
    expect(createCall?.data.capabilities).toEqual(expect.arrayContaining(["session", "terminal"]));
  });

  it("updateGrant stripping terminal severs the grantee's live terminals", async () => {
    prismaMock.bridgeAccessGrant.findUnique.mockResolvedValueOnce({
      id: "grant-1",
      granteeUserId: "user-2",
      scopeType: "session_group",
      sessionGroupId: "group-1",
      capabilities: ["session", "terminal"],
      revokedAt: null,
      bridgeRuntime: {
        id: "bridge-1",
        instanceId: "runtime-1",
        label: "Laptop",
        organizationId: "org-1",
        ownerUserId: "user-1",
      },
      granteeUser: { id: "user-2", name: "Guest" },
      grantedByUser: { id: "user-1", name: "Owner" },
      sessionGroup: { id: "group-1", name: "A" },
    });
    prismaMock.bridgeAccessGrant.updateMany.mockResolvedValueOnce({ count: 1 });
    prismaMock.bridgeAccessGrant.findUniqueOrThrow.mockResolvedValueOnce({
      id: "grant-1",
      granteeUserId: "user-2",
      scopeType: "session_group",
      sessionGroupId: "group-1",
      capabilities: ["session"],
      updatedAt: new Date(),
      revokedAt: null,
      granteeUser: { id: "user-2", name: "Guest" },
      grantedByUser: { id: "user-1", name: "Owner" },
      sessionGroup: { id: "group-1", name: "A" },
    });
    prismaMock.session.findMany.mockResolvedValueOnce([{ id: "session-a" }]);

    await runtimeAccessService.updateGrant({
      grantId: "grant-1",
      organizationId: "org-1",
      ownerUserId: "user-1",
      capabilities: ["session"],
    });

    expect(prismaMock.bridgeAccessGrant.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "grant-1", revokedAt: null }),
      }),
    );
    expect(terminalRelayMock.destroyTerminalsForUser).toHaveBeenCalledWith(
      "user-2",
      new Set(["session-a"]),
      "org-1",
    );
    expect(eventServiceMock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "bridge_access_updated",
        payload: expect.objectContaining({
          grantId: "grant-1",
          priorCapabilities: ["session", "terminal"],
          capabilities: ["session"],
        }),
      }),
      expect.anything(),
    );
  });

  it("updateGrant does not sever terminals when terminal is not removed", async () => {
    prismaMock.bridgeAccessGrant.findUnique.mockResolvedValueOnce({
      id: "grant-1",
      granteeUserId: "user-2",
      scopeType: "all_sessions",
      sessionGroupId: null,
      capabilities: ["session"],
      revokedAt: null,
      bridgeRuntime: {
        id: "bridge-1",
        instanceId: "runtime-1",
        label: "Laptop",
        organizationId: "org-1",
        ownerUserId: "user-1",
      },
      granteeUser: { id: "user-2", name: "Guest" },
      grantedByUser: { id: "user-1", name: "Owner" },
      sessionGroup: null,
    });
    prismaMock.bridgeAccessGrant.updateMany.mockResolvedValueOnce({ count: 1 });
    prismaMock.bridgeAccessGrant.findUniqueOrThrow.mockResolvedValueOnce({
      id: "grant-1",
      granteeUserId: "user-2",
      scopeType: "all_sessions",
      sessionGroupId: null,
      capabilities: ["session", "terminal"],
      updatedAt: new Date(),
      revokedAt: null,
      granteeUser: { id: "user-2", name: "Guest" },
      grantedByUser: { id: "user-1", name: "Owner" },
      sessionGroup: null,
    });

    await runtimeAccessService.updateGrant({
      grantId: "grant-1",
      organizationId: "org-1",
      ownerUserId: "user-1",
      capabilities: ["session", "terminal"],
    });

    expect(terminalRelayMock.destroyTerminalsForUser).not.toHaveBeenCalled();
  });

  it("updateGrant always ensures session capability is present", async () => {
    prismaMock.bridgeAccessGrant.findUnique.mockResolvedValueOnce({
      id: "grant-1",
      granteeUserId: "user-2",
      scopeType: "all_sessions",
      sessionGroupId: null,
      capabilities: ["session", "terminal"],
      revokedAt: null,
      bridgeRuntime: {
        id: "bridge-1",
        instanceId: "runtime-1",
        label: "Laptop",
        organizationId: "org-1",
        ownerUserId: "user-1",
      },
      granteeUser: { id: "user-2", name: "Guest" },
      grantedByUser: { id: "user-1", name: "Owner" },
      sessionGroup: null,
    });
    prismaMock.bridgeAccessGrant.updateMany.mockResolvedValueOnce({ count: 1 });
    prismaMock.bridgeAccessGrant.findUniqueOrThrow.mockResolvedValueOnce({
      id: "grant-1",
      granteeUserId: "user-2",
      scopeType: "all_sessions",
      sessionGroupId: null,
      capabilities: ["session"],
      updatedAt: new Date(),
      revokedAt: null,
      granteeUser: { id: "user-2", name: "Guest" },
      grantedByUser: { id: "user-1", name: "Owner" },
      sessionGroup: null,
    });
    prismaMock.session.findMany.mockResolvedValueOnce([]);

    await runtimeAccessService.updateGrant({
      grantId: "grant-1",
      organizationId: "org-1",
      ownerUserId: "user-1",
      capabilities: [],
    });

    const updateCall = prismaMock.bridgeAccessGrant.updateMany.mock.calls[0]?.[0] as
      | { data: { capabilities: string[] } }
      | undefined;
    expect(updateCall?.data.capabilities).toEqual(["session"]);
  });

  it("updateGrant throws if a concurrent revoke wins (updateMany count=0)", async () => {
    prismaMock.bridgeAccessGrant.findUnique.mockResolvedValueOnce({
      id: "grant-1",
      granteeUserId: "user-2",
      scopeType: "all_sessions",
      sessionGroupId: null,
      capabilities: ["session", "terminal"],
      revokedAt: null,
      bridgeRuntime: {
        id: "bridge-1",
        instanceId: "runtime-1",
        label: "Laptop",
        organizationId: "org-1",
        ownerUserId: "user-1",
      },
      granteeUser: { id: "user-2", name: "Guest" },
      grantedByUser: { id: "user-1", name: "Owner" },
      sessionGroup: null,
    });
    // Simulate concurrent revoke: findUnique saw revokedAt=null but by update
    // time the row already has revokedAt set, so updateMany matches zero rows.
    prismaMock.bridgeAccessGrant.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(
      runtimeAccessService.updateGrant({
        grantId: "grant-1",
        organizationId: "org-1",
        ownerUserId: "user-1",
        capabilities: ["session"],
      }),
    ).rejects.toThrow("Cannot update a revoked bridge access grant");

    expect(eventServiceMock.create).not.toHaveBeenCalled();
    expect(terminalRelayMock.destroyTerminalsForUser).not.toHaveBeenCalled();
  });
});
