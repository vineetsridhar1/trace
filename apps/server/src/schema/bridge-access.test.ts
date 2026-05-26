import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/db.js", async () => {
  const { createPrismaMock } = await import("../../test/helpers.js");
  return { prisma: createPrismaMock() };
});

vi.mock("../lib/session-router.js", () => ({
  sessionRouter: {
    isRuntimeAvailable: vi.fn(),
    getRuntime: vi.fn(),
  },
}));

import { prisma } from "../lib/db.js";
import { sessionRouter } from "../lib/session-router.js";
import { bridgeAccessTypeResolvers } from "./bridge-access.js";

const prismaMock = prisma as ReturnType<typeof import("../../test/helpers.js").createPrismaMock>;
const sessionRouterMock = sessionRouter as unknown as {
  isRuntimeAvailable: ReturnType<typeof vi.fn>;
  getRuntime: ReturnType<typeof vi.fn>;
};

describe("bridge access resolvers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("filters persisted bridge registered repo ids to the runtime organization", async () => {
    sessionRouterMock.getRuntime.mockReturnValueOnce(null);
    prismaMock.repo.findMany.mockResolvedValueOnce([{ id: "repo-visible" }]);

    const result = await bridgeAccessTypeResolvers.BridgeRuntime.registeredRepoIds({
      instanceId: "runtime-1",
      organizationId: "org-1",
      metadata: { registeredRepoIds: ["repo-visible", "repo-hidden", "repo-visible"] },
    });

    expect(result).toEqual(["repo-visible"]);
    expect(prismaMock.repo.findMany).toHaveBeenCalledWith({
      where: { id: { in: ["repo-visible", "repo-hidden"] }, organizationId: "org-1" },
      select: { id: true },
    });
  });

  it("filters live bridge registered repo ids to the runtime organization", async () => {
    sessionRouterMock.getRuntime.mockReturnValueOnce({
      instanceId: "runtime-1",
      organizationId: "org-1",
      registeredRepoIds: ["repo-visible", "repo-hidden"],
      linkedCheckouts: new Map(),
      ws: { readyState: 1, OPEN: 1 },
    });
    prismaMock.repo.findMany.mockResolvedValueOnce([{ id: "repo-visible" }]);

    const result = await bridgeAccessTypeResolvers.BridgeRuntime.registeredRepoIds({
      instanceId: "runtime-1",
      organizationId: "org-1",
      metadata: { registeredRepoIds: ["repo-hidden"] },
    });

    expect(result).toEqual(["repo-visible"]);
  });

  it("filters live linked checkouts to repos in the runtime organization", async () => {
    sessionRouterMock.getRuntime.mockReturnValueOnce({
      instanceId: "runtime-1",
      organizationId: "org-1",
      registeredRepoIds: ["repo-visible", "repo-hidden"],
      linkedCheckouts: new Map([
        [
          "repo-visible",
          {
            repoId: "repo-visible",
            repoPath: "/repos/visible",
            isAttached: true,
          },
        ],
        [
          "repo-hidden",
          {
            repoId: "repo-hidden",
            repoPath: "/repos/hidden",
            isAttached: true,
          },
        ],
      ]),
      ws: { readyState: 1, OPEN: 1 },
    });
    prismaMock.repo.findMany.mockResolvedValueOnce([{ id: "repo-visible" }]);

    const result = await bridgeAccessTypeResolvers.BridgeRuntime.linkedCheckouts({
      instanceId: "runtime-1",
      organizationId: "org-1",
    });

    expect(result).toEqual([
      {
        repoId: "repo-visible",
        repoPath: "/repos/visible",
        isAttached: true,
      },
    ]);
  });
});
