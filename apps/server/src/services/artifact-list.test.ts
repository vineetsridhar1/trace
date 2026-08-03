import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/db.js", async () => {
  const { createPrismaMock } = await import("../../test/helpers.js");
  return { prisma: createPrismaMock() };
});

import { prisma } from "../lib/db.js";
import { asMock } from "../../test/helpers.js";
import { artifactService } from "./artifact.js";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ArtifactService.listForSessionGroup", () => {
  it("rejects a private group the viewer does not own", async () => {
    asMock(prisma.sessionGroup.findFirst).mockResolvedValue({
      visibility: "private",
      ownerUserId: "user-2",
    });

    await expect(
      artifactService.listForSessionGroup({
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

    const artifacts = await artifactService.listForSessionGroup({
      organizationId: "org-1",
      sessionGroupId: "group-1",
      userId: "user-1",
      type: "visual-plan",
    });

    expect(artifacts.map((artifact) => artifact.id)).toEqual(["artifact-1"]);
    const args = asMock(prisma.artifact.findMany).mock.calls[0][0];
    expect(args.where).toMatchObject({
      organizationId: "org-1",
      session: { sessionGroupId: "group-1" },
      type: "trace.visual-plan.v1",
    });
    expect(args.orderBy).toEqual([{ createdAt: "desc" }, { id: "desc" }]);
  });
});
