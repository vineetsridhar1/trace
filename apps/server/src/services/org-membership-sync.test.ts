import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/db.js", async () => {
  const { createPrismaMock } = await import("../../test/helpers.js");
  return { prisma: createPrismaMock() };
});

vi.mock("../lib/github-org.js", () => ({
  AUTO_JOIN_GITHUB_ORG: "opendoor-labs",
  listGitHubOrgMemberIds: vi.fn(),
}));

vi.mock("./org-member.js", () => ({
  orgMemberService: { removeMember: vi.fn() },
}));

import { prisma } from "../lib/db.js";
import { listGitHubOrgMemberIds } from "../lib/github-org.js";
import { orgMemberService } from "./org-member.js";
import { orgMembershipSyncService } from "./org-membership-sync.js";

const prismaMock = prisma as unknown as ReturnType<
  typeof import("../../test/helpers.js").createPrismaMock
>;
const listMock = listGitHubOrgMemberIds as unknown as ReturnType<typeof vi.fn>;
const removeMemberMock = orgMemberService.removeMember as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.stubEnv("GITHUB_ORG_SYNC_TOKEN", "sync-token");
});

describe("OrgMembershipSyncService.reconcile", () => {
  it("skips when no sync token is configured", async () => {
    vi.stubEnv("GITHUB_ORG_SYNC_TOKEN", "");

    const result = await orgMembershipSyncService.reconcile();

    expect(result).toEqual({ skipped: true, removed: [] });
    expect(listMock).not.toHaveBeenCalled();
    expect(removeMemberMock).not.toHaveBeenCalled();
  });

  it("skips without removing anyone when the GitHub listing fails", async () => {
    listMock.mockResolvedValue(null);

    const result = await orgMembershipSyncService.reconcile();

    expect(result).toEqual({ skipped: true, removed: [] });
    expect(prismaMock.organization.findFirst).not.toHaveBeenCalled();
    expect(removeMemberMock).not.toHaveBeenCalled();
  });

  it("skips when the GitHub org listing is empty", async () => {
    listMock.mockResolvedValue(new Set<number>());

    const result = await orgMembershipSyncService.reconcile();

    expect(result).toEqual({ skipped: true, removed: [] });
    expect(removeMemberMock).not.toHaveBeenCalled();
  });

  it("skips when no organization exists", async () => {
    listMock.mockResolvedValue(new Set([1]));
    prismaMock.organization.findFirst.mockResolvedValue(null);

    const result = await orgMembershipSyncService.reconcile();

    expect(result).toEqual({ skipped: true, removed: [] });
    expect(removeMemberMock).not.toHaveBeenCalled();
  });

  it("removes GitHub-authenticated members no longer in the org, leaving others", async () => {
    listMock.mockResolvedValue(new Set([1]));
    prismaMock.organization.findFirst.mockResolvedValue({ id: "org-1" });
    prismaMock.orgMember.findMany.mockResolvedValue([
      { userId: "u1", user: { githubId: 1 } },
      { userId: "u2", user: { githubId: 2 } },
      { userId: "u3", user: { githubId: null } },
    ]);
    removeMemberMock.mockResolvedValue(true);

    const result = await orgMembershipSyncService.reconcile();

    expect(result).toEqual({ skipped: false, removed: ["u2"] });
    expect(removeMemberMock).toHaveBeenCalledTimes(1);
    expect(removeMemberMock).toHaveBeenCalledWith({
      organizationId: "org-1",
      userId: "u2",
      actorType: "system",
      actorId: "system",
    });
  });

  it("continues past a removal failure", async () => {
    listMock.mockResolvedValue(new Set<number>([1]));
    prismaMock.organization.findFirst.mockResolvedValue({ id: "org-1" });
    prismaMock.orgMember.findMany.mockResolvedValue([
      { userId: "u2", user: { githubId: 2 } },
      { userId: "u3", user: { githubId: 3 } },
    ]);
    removeMemberMock
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce(true);

    const result = await orgMembershipSyncService.reconcile();

    expect(result).toEqual({ skipped: false, removed: ["u3"] });
    expect(removeMemberMock).toHaveBeenCalledTimes(2);
  });
});
