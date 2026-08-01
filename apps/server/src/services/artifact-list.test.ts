import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/db.js", async () => {
  const { createPrismaMock } = await import("../../test/helpers.js");
  return { prisma: createPrismaMock() };
});

import { prisma } from "../lib/db.js";
import { asMock } from "../../test/helpers.js";
import { artifactService } from "./artifact.js";

function artifactRow(id: string, sessionGroup: unknown) {
  return { id, organizationId: "org-1", sessionId: `session-${id}`, session: { sessionGroup } };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ArtifactService.listForOrganization", () => {
  it("hides artifacts from private session groups the viewer does not own", async () => {
    asMock(prisma.artifact.findMany).mockResolvedValue([
      artifactRow("public", { visibility: "public", ownerUserId: "user-2" }),
      artifactRow("own-private", { visibility: "private", ownerUserId: "user-1" }),
      artifactRow("other-private", { visibility: "private", ownerUserId: "user-2" }),
      artifactRow("no-group", null),
    ]);

    const artifacts = await artifactService.listForOrganization({
      organizationId: "org-1",
      userId: "user-1",
    });

    expect(artifacts.map((artifact) => artifact.id)).toEqual(["public", "own-private", "no-group"]);
  });

  it("normalizes the type alias and caps the page size", async () => {
    asMock(prisma.artifact.findMany).mockResolvedValue([]);

    await artifactService.listForOrganization({
      organizationId: "org-1",
      userId: "user-1",
      type: "visual-plan",
      limit: 10_000,
    });

    const args = asMock(prisma.artifact.findMany).mock.calls[0][0];
    expect(args.where.type).toBe("trace.visual-plan.v1");
    expect(args.take).toBe(500);
  });
});
