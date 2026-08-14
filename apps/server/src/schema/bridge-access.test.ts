import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/db.js", async () => {
  const { createPrismaMock } = await import("../../test/helpers.js");
  return { prisma: createPrismaMock() };
});

vi.mock("../services/runtime-access.js", () => ({
  runtimeAccessService: {
    isRuntimeConnected: vi.fn(),
    listRuntimeRegisteredRepoIds: vi.fn(),
    listLinkedCheckoutStatuses: vi.fn(),
  },
}));

import { runtimeAccessService } from "../services/runtime-access.js";
import { bridgeAccessTypeResolvers } from "./bridge-access.js";

const runtimeAccessServiceMock = runtimeAccessService as unknown as {
  isRuntimeConnected: ReturnType<typeof vi.fn>;
  listRuntimeRegisteredRepoIds: ReturnType<typeof vi.fn>;
  listLinkedCheckoutStatuses: ReturnType<typeof vi.fn>;
};

describe("bridge access resolvers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("delegates runtime connectivity to the service layer", () => {
    runtimeAccessServiceMock.isRuntimeConnected.mockReturnValueOnce(true);

    expect(
      bridgeAccessTypeResolvers.BridgeRuntime.connected({
        instanceId: "runtime-1",
        organizationId: "org-1",
      }),
    ).toBe(true);
    expect(runtimeAccessServiceMock.isRuntimeConnected).toHaveBeenCalledWith("runtime-1", "org-1");
  });

  it("delegates registered repo filtering to the service layer", async () => {
    runtimeAccessServiceMock.listRuntimeRegisteredRepoIds.mockResolvedValueOnce(["repo-visible"]);
    const metadata = { registeredRepoIds: ["repo-visible", "repo-hidden"] };

    await expect(
      bridgeAccessTypeResolvers.BridgeRuntime.registeredRepoIds({
        instanceId: "runtime-1",
        organizationId: "org-1",
        metadata,
      }),
    ).resolves.toEqual(["repo-visible"]);
    expect(runtimeAccessServiceMock.listRuntimeRegisteredRepoIds).toHaveBeenCalledWith({
      runtimeInstanceId: "runtime-1",
      organizationId: "org-1",
      persistedMetadata: metadata,
    });
  });

  it("delegates linked checkout loading to the service layer", async () => {
    runtimeAccessServiceMock.listLinkedCheckoutStatuses.mockResolvedValueOnce([
      {
        repoId: "repo-visible",
        repoPath: "/repos/visible",
        isAttached: true,
      },
    ]);

    await expect(
      bridgeAccessTypeResolvers.BridgeRuntime.linkedCheckouts({
        instanceId: "runtime-remote",
        organizationId: "org-1",
      }),
    ).resolves.toEqual([expect.objectContaining({ repoId: "repo-visible", isAttached: true })]);
    expect(runtimeAccessServiceMock.listLinkedCheckoutStatuses).toHaveBeenCalledWith({
      runtimeInstanceId: "runtime-remote",
      organizationId: "org-1",
    });
  });
});
