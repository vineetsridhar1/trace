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
  eventService: {
    create: vi.fn().mockResolvedValue({ id: "event-1" }),
    publishCreated: vi.fn(),
  },
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
    // The service generates the id and writes the row in a single create; echo
    // the create payload back so the returned repo carries the generated id/url.
    prismaMock.repo.create.mockImplementation(async (args: { data: Record<string, unknown> }) => ({
      ...args.data,
    }));

    const repo = await managedGitService.createManagedRepo({
      organizationId: org,
      name: "design",
      actorType: "system",
      actorId: "system",
    });

    expect(repo.provider).toBe("managed");
    expect(repo.remoteUrl).toContain(`/git/${org}/${repo.id}.git`);
    // A real bare repo exists on disk.
    expect(await gitStorage.repoExists(org, repo.id)).toBe(true);
    // Single write — no create-then-update window.
    expect(prismaMock.repo.update).not.toHaveBeenCalled();

    const created = createEventMock.mock.calls.find((c) => c[0]?.eventType === "repo_created");
    expect(created).toBeDefined();
    expect(created![0].payload.repo.provider).toBe("managed");
    expect(created![0].deferPublish).toBe(true);
    expect(eventService.publishCreated).toHaveBeenCalledWith({ id: "event-1" });
  });

  it("authorizes before filesystem creation", async () => {
    prismaMock.orgMember.findUniqueOrThrow.mockRejectedValueOnce(new Error("not a member"));
    const initSpy = vi.spyOn(gitStorage, "initBareRepo");

    await expect(
      managedGitService.createManagedRepo({
        organizationId: "org-managed",
        name: "design",
        actorType: "user",
        actorId: "user-1",
      }),
    ).rejects.toThrow("not a member");
    expect(initSpy).not.toHaveBeenCalled();
  });

  it("removes bare storage when the atomic row/event transaction fails", async () => {
    prismaMock.repo.create.mockImplementation(async (args: { data: Record<string, unknown> }) => ({
      ...args.data,
    }));
    createEventMock.mockRejectedValueOnce(new Error("event insert failed"));
    const deleteSpy = vi.spyOn(gitStorage, "deleteRepo");

    await expect(
      managedGitService.createManagedRepo({
        organizationId: "org-managed",
        name: "design",
        actorType: "system",
        actorId: "system",
      }),
    ).rejects.toThrow("event insert failed");
    expect(deleteSpy).toHaveBeenCalledOnce();
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
