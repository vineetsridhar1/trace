import { randomUUID } from "crypto";
import { rm } from "fs/promises";
import os from "os";
import path from "path";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/git-storage/index.js", async () => {
  const { LocalGitStorageAdapter } = await import("../lib/git-storage/local-adapter.js");
  const root = path.join(os.tmpdir(), `trace-git-repo-test-${randomUUID()}`);
  return { gitStorage: new LocalGitStorageAdapter(root), LocalGitStorageAdapter };
});

vi.mock("../lib/db.js", async () => {
  const { createPrismaMock } = await import("../../test/helpers.js");
  return { prisma: createPrismaMock() };
});

vi.mock("./event.js", () => ({
  eventService: { create: vi.fn().mockResolvedValue({}) },
}));

import { managedGitService } from "./managed-git.js";
import { organizationService } from "./organization.js";
import { gitStorage } from "../lib/git-storage/index.js";
import { LocalGitStorageAdapter } from "../lib/git-storage/local-adapter.js";
import { eventService } from "./event.js";
import { prisma } from "../lib/db.js";
import { createPrismaMock } from "../../test/helpers.js";

const prismaMock = prisma as unknown as ReturnType<typeof createPrismaMock>;
const createEventMock = eventService.create as unknown as ReturnType<typeof vi.fn>;

afterEach(() => vi.clearAllMocks());
afterAll(async () => {
  await rm((gitStorage as LocalGitStorageAdapter).rootDir, { recursive: true, force: true });
});

describe("createManagedRepo", () => {
  it("creates a hidden managed repo, initializes bare storage, and emits repo_created", async () => {
    const org = "org-managed";
    const repoId = randomUUID();
    prismaMock.repo.create.mockResolvedValue({
      id: repoId,
      name: "design",
      provider: "managed",
      defaultBranch: "main",
      organizationId: org,
      remoteUrl: null,
    });
    prismaMock.repo.update.mockImplementation(async (args: { data: { remoteUrl: string } }) => ({
      id: repoId,
      name: "design",
      provider: "managed",
      defaultBranch: "main",
      organizationId: org,
      remoteUrl: args.data.remoteUrl,
    }));

    const repo = await managedGitService.createManagedRepo({
      organizationId: org,
      name: "design",
      actorType: "system",
      actorId: "system",
    });

    expect(repo.provider).toBe("managed");
    expect(repo.remoteUrl).toContain(`/git/${org}/${repoId}.git`);
    // A real bare repo exists on disk.
    expect(await gitStorage.repoExists(org, repoId)).toBe(true);

    const created = createEventMock.mock.calls.find((c) => c[0]?.eventType === "repo_created");
    expect(created).toBeDefined();
    expect(created![0].payload.repo.provider).toBe("managed");
  });
});

describe("repo listing hides managed repos", () => {
  it("filters org repo lists to github-provider repos", async () => {
    prismaMock.repo.findMany.mockResolvedValue([]);
    await organizationService.listRepos("org-1");
    expect(prismaMock.repo.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: "org-1", provider: "github" }),
      }),
    );
  });
});
