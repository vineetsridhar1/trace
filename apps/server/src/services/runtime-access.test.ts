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

import { prisma } from "../lib/db.js";
import { sessionRouter } from "../lib/session-router.js";
import { AuthorizationError } from "../lib/errors.js";
import { runtimeAccessService } from "./runtime-access.js";

const prismaMock = prisma as ReturnType<typeof import("../../test/helpers.js").createPrismaMock>;
const sessionRouterMock = sessionRouter as unknown as {
  isRuntimeAvailable: ReturnType<typeof vi.fn>;
  getRuntime: ReturnType<typeof vi.fn>;
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
});
