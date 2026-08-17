import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/db.js", async () => {
  const { createPrismaMock } = await import("../../test/helpers.js");
  return { prisma: createPrismaMock() };
});

vi.mock("../lib/storage/index.js", () => ({
  storage: { putObject: vi.fn(), deleteObject: vi.fn(), getObject: vi.fn() },
}));

import { prisma } from "../lib/db.js";
import { asMock } from "../../test/helpers.js";
import { artifactService } from "./artifact.js";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ArtifactService.listPageForSessionGroup", () => {
  it("rejects a private group the viewer does not own", async () => {
    asMock(prisma.sessionGroup.findFirst).mockResolvedValue({
      visibility: "private",
      ownerUserId: "user-2",
    });

    await expect(
      artifactService.listPageForSessionGroup({
        organizationId: "org-1",
        sessionGroupId: "group-1",
        userId: "user-1",
      }),
    ).rejects.toThrow("Session group is not accessible");
    expect(prisma.artifact.findMany).not.toHaveBeenCalled();
  });

  it("returns the group's artifacts newest-first once access is allowed", async () => {
    asMock(prisma.sessionGroup.findFirst).mockResolvedValue({
      visibility: "public",
      ownerUserId: "user-2",
    });
    asMock(prisma.artifact.findMany).mockResolvedValue([{ id: "artifact-1" }]);

    const page = await artifactService.listPageForSessionGroup({
      organizationId: "org-1",
      sessionGroupId: "group-1",
      userId: "user-1",
      type: "visual-plan",
    });

    expect(page.items.map((artifact) => artifact.id)).toEqual(["artifact-1"]);
    expect(page.hasMore).toBe(false);
    const args = asMock(prisma.artifact.findMany).mock.calls[0][0];
    expect(args.where).toMatchObject({
      organizationId: "org-1",
      session: { sessionGroupId: "group-1" },
      type: "trace.visual-plan.v1",
    });
    expect(args.orderBy).toEqual([{ createdAt: "desc" }, { id: "desc" }]);
    expect(args.take).toBe(51);
  });

  it("returns a bounded page and stable timestamp/id cursor", async () => {
    asMock(prisma.sessionGroup.findFirst).mockResolvedValue({
      visibility: "public",
      ownerUserId: "user-2",
    });
    asMock(prisma.artifact.findMany).mockResolvedValue([
      { id: "artifact-2" },
      { id: "artifact-1" },
    ]);
    const before = new Date("2026-08-17T12:00:00.000Z");

    const page = await artifactService.listPageForSessionGroup({
      organizationId: "org-1",
      sessionGroupId: "group-1",
      userId: "user-1",
      limit: 1,
      before,
      beforeId: "artifact-3",
    });

    expect(page.items).toEqual([{ id: "artifact-2" }]);
    expect(page.hasMore).toBe(true);
    expect(asMock(prisma.artifact.findMany).mock.calls[0][0]).toMatchObject({
      where: {
        OR: [{ createdAt: { lt: before } }, { createdAt: before, id: { lt: "artifact-3" } }],
      },
      take: 2,
    });
  });
});
