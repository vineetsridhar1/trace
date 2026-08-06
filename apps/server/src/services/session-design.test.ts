import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/db.js", async () => {
  const { createPrismaMock } = await import("../../test/helpers.js");
  return { prisma: createPrismaMock() };
});

vi.mock("../lib/git-storage/index.js", () => ({
  gitStorage: {
    getBranchHead: vi.fn(),
    archiveTreeAtCommit: vi.fn().mockResolvedValue(Buffer.from("git-tree")),
  },
}));

vi.mock("../lib/design-system-archive.js", () => ({
  parseGitTreeArchive: vi.fn().mockResolvedValue({
    files: new Map([
      ["design.canvas.json", Buffer.from("{}")],
      ["src/design/Screen.tsx", Buffer.from("export const Screen = 1")],
      ["package.json", Buffer.from("{}")],
    ]),
    byteSize: 30,
  }),
  createDeterministicTarGz: vi.fn().mockResolvedValue(Buffer.from("design-archive")),
}));

vi.mock("./event.js", () => ({
  eventService: { create: vi.fn().mockResolvedValue({ id: "event-1" }) },
}));

import { prisma } from "../lib/db.js";
import { eventService } from "./event.js";
import { createDeterministicTarGz } from "../lib/design-system-archive.js";
import { SessionDesignService } from "./session-design.js";

const database = prisma as unknown as ReturnType<
  typeof import("../../test/helpers.js").createPrismaMock
>;

describe("SessionDesignService", () => {
  const service = new SessionDesignService();

  beforeEach(() => {
    vi.clearAllMocks();
    database.session.findFirst.mockResolvedValue({ sessionGroupId: "implementation-group" });
    database.sessionGroupDesignLink.findMany.mockResolvedValue([
      {
        createdAt: new Date(),
        designSessionGroup: {
          id: "design-1",
          name: "Checkout",
          slug: "checkout",
          repoId: "repo-1",
          branch: "main",
          designPreviewCommitSha: "preview-commit",
        },
      },
    ]);
    database.sessionGroup.findFirst.mockResolvedValue({ repoId: "repo-1" });
  });

  it("lists only designs durably linked to the active invocation", async () => {
    await expect(
      service.listForInvocation({
        organizationId: "org-1",
        sessionId: "session-1",
        invocationId: "invocation-1",
      }),
    ).resolves.toEqual([
      {
        id: "design-1",
        name: "Checkout",
        slug: "checkout",
        commitSha: "preview-commit",
        archivePath: "/agent/designs/design-1/archive",
      },
    ]);
    expect(database.session.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ activeInvocationId: "invocation-1" }),
      }),
    );
  });

  it("archives only portable design source and emits the pulled commit", async () => {
    const result = await service.archiveForInvocation({
      organizationId: "org-1",
      sessionId: "session-1",
      invocationId: "invocation-1",
      designSessionGroupId: "design-1",
    });

    expect(result.archive.toString()).toBe("design-archive");
    expect(createDeterministicTarGz).toHaveBeenCalledWith(
      new Map([
        ["design.canvas.json", Buffer.from("{}")],
        ["src/design/Screen.tsx", Buffer.from("export const Screen = 1")],
      ]),
    );
    expect(eventService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        scopeId: "session-1",
        eventType: "design_source_pulled",
        payload: expect.objectContaining({ commitSha: "preview-commit" }),
      }),
    );
  });

  it("rejects expired invocations before exposing linked designs", async () => {
    database.session.findFirst.mockResolvedValueOnce(null);
    await expect(
      service.listForInvocation({
        organizationId: "org-1",
        sessionId: "session-1",
        invocationId: "expired",
      }),
    ).rejects.toThrow("no longer active");
    expect(database.sessionGroupDesignLink.findMany).not.toHaveBeenCalled();
  });
});
