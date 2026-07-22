import { beforeEach, describe, expect, it, vi } from "vitest";

const { mocks, database } = vi.hoisted(() => {
  const mocks = {
    transaction: vi.fn(),
    queryRaw: vi.fn(),
    systemCreate: vi.fn(),
    systemFindMany: vi.fn(),
    systemFindFirstOrThrow: vi.fn(),
    systemFindUnique: vi.fn(),
    systemFindUniqueOrThrow: vi.fn(),
    systemUpdate: vi.fn(),
    artifactFindFirst: vi.fn(),
    artifactFindMany: vi.fn(),
    artifactFindUnique: vi.fn(),
    artifactUpdateMany: vi.fn(),
    artifactCreate: vi.fn(),
    versionFindUnique: vi.fn(),
    versionCreate: vi.fn(),
    listCommitsBetween: vi.fn(),
    getBranchHead: vi.fn(),
    eventCreate: vi.fn(),
    publishCreated: vi.fn(),
    sessionStart: vi.fn(),
    storageGet: vi.fn(),
    storagePut: vi.fn(),
    storageDelete: vi.fn(),
    sessionGroupUpdateMany: vi.fn(),
  };
  const database = {
    $queryRaw: mocks.queryRaw,
    designSystem: {
      create: mocks.systemCreate,
      findMany: mocks.systemFindMany,
      findFirstOrThrow: mocks.systemFindFirstOrThrow,
      findUnique: mocks.systemFindUnique,
      findUniqueOrThrow: mocks.systemFindUniqueOrThrow,
      update: mocks.systemUpdate,
    },
    designSystemCommitArtifact: {
      findFirst: mocks.artifactFindFirst,
      findMany: mocks.artifactFindMany,
      findUnique: mocks.artifactFindUnique,
      updateMany: mocks.artifactUpdateMany,
      create: mocks.artifactCreate,
    },
    sessionGroup: { updateMany: mocks.sessionGroupUpdateMany },
    designSystemVersion: { findUnique: mocks.versionFindUnique, create: mocks.versionCreate },
  };
  return { mocks, database };
});

vi.mock("../lib/db.js", () => ({ prisma: { ...database, $transaction: mocks.transaction } }));
vi.mock("../lib/git-storage/index.js", () => ({
  gitStorage: {
    listCommitsBetween: mocks.listCommitsBetween,
    getBranchHead: mocks.getBranchHead,
  },
}));
vi.mock("../lib/storage/index.js", () => ({
  storage: {
    getObject: mocks.storageGet,
    putObject: mocks.storagePut,
    deleteObject: mocks.storageDelete,
  },
}));
vi.mock("./event.js", () => ({
  eventService: { create: mocks.eventCreate, publishCreated: mocks.publishCreated },
}));
vi.mock("./actor-auth.js", () => ({
  assertActorOrgAccess: vi.fn().mockResolvedValue(undefined),
  assertActorOrgAdmin: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("./session.js", () => ({ sessionService: { start: mocks.sessionStart } }));

import { DesignSystemService, shouldAdvanceLatestArtifact } from "./design-system.js";
import { createDeterministicTarGz } from "../lib/design-system-archive.js";

function system(overrides: Record<string, unknown> = {}) {
  return {
    id: "system-1",
    organizationId: "org-1",
    status: "draft",
    latestPushedCommitSha: "commit-3",
    latestCommitArtifact: null,
    authoringSessionGroup: {
      id: "group-1",
      repoId: "managed-repo-1",
      branch: "main",
      repo: { defaultBranch: "main" },
      sessions: [],
    },
    ...overrides,
  };
}

describe("DesignSystemService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation(async (callback: (tx: typeof database) => unknown) =>
      callback(database),
    );
    mocks.queryRaw.mockResolvedValue([]);
    mocks.eventCreate.mockResolvedValue({ id: "event-1" });
    mocks.systemFindUnique.mockResolvedValue(null);
    mocks.artifactFindMany.mockResolvedValue([]);
    mocks.artifactUpdateMany.mockResolvedValue({ count: 0 });
    mocks.systemFindMany.mockResolvedValue([]);
    mocks.sessionGroupUpdateMany.mockResolvedValue({ count: 0 });
  });

  it("never lets an out-of-order worker regress the latest artifact pointer", () => {
    expect(shouldAdvanceLatestArtifact(null, 1)).toBe(true);
    expect(shouldAdvanceLatestArtifact(1, 2)).toBe(true);
    expect(shouldAdvanceLatestArtifact(3, 2)).toBe(false);
    expect(shouldAdvanceLatestArtifact(3, 3)).toBe(false);
  });

  it("backfills an S3 static canvas for an existing saved artifact", async () => {
    const archive = await createDeterministicTarGz(
      new Map([
        ["design-system/manifest.json", Buffer.from('{"name":"Acme UI"}')],
        [
          "design-system/preview/foundations.html",
          Buffer.from("<!doctype html><h1>Foundations</h1>"),
        ],
        [
          "design-system/preview/components.html",
          Buffer.from("<!doctype html><h1>Components</h1>"),
        ],
      ]),
    );
    mocks.systemFindMany.mockResolvedValue([
      {
        id: "system-1",
        organizationId: "org-1",
        authoringSessionGroupId: "group-1",
        latestCommitArtifact: {
          id: "artifact-1",
          commitSha: "commit-1",
          storageKey: "workbench.tar.gz",
        },
      },
    ]);
    mocks.storageGet.mockResolvedValue(archive);
    mocks.sessionGroupUpdateMany.mockResolvedValue({ count: 1 });

    await expect(new DesignSystemService().reconcileCommitArtifacts()).resolves.toBe(1);

    expect(mocks.storagePut).toHaveBeenCalledWith(
      "design-system-previews/org-1/system-1/commit-1.html",
      expect.any(Buffer),
      "text/html; charset=utf-8",
      { ifAbsent: true },
    );
    expect(mocks.sessionGroupUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          designPreviewKey: "design-system-previews/org-1/system-1/commit-1.html",
          designPreviewStatus: "captured",
        }),
      }),
    );
    expect(mocks.eventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "design_preview_updated",
        payload: expect.objectContaining({
          designPreviewUrl: "/design-previews/groups/group-1",
        }),
      }),
    );
  });

  it("creates the draft and full event inside the session transaction, then publishes after commit", async () => {
    const created = system({
      name: "Acme UI",
      authoringSessionGroupId: "group-1",
      authoringSessionGroup: {
        id: "group-1",
        repoId: "managed-repo-1",
        branch: "main",
        repo: { defaultBranch: "main" },
        sessions: [{ id: "session-1", inputTokens: 12n }],
      },
    });
    (database as typeof database & { repo: { findFirstOrThrow: ReturnType<typeof vi.fn> } }).repo =
      {
        findFirstOrThrow: vi.fn().mockResolvedValue({ id: "source-repo-1", defaultBranch: "main" }),
      };
    mocks.systemCreate.mockResolvedValue(created);
    mocks.systemFindUniqueOrThrow.mockResolvedValue(created);
    mocks.sessionStart.mockImplementation(
      async (input: {
        afterCreate: (value: {
          tx: typeof database;
          sessionGroup: { id: string };
        }) => Promise<void>;
      }) => {
        await input.afterCreate({ tx: database, sessionGroup: { id: "group-1" } });
        return { id: "session-1", sessionGroup: { id: "group-1" } };
      },
    );
    const service = new DesignSystemService();

    await service.create({
      organizationId: "org-1",
      actorType: "user",
      actorId: "user-1",
      name: "Acme UI",
      repoId: "source-repo-1",
      sourcePath: "packages/ui",
    });

    expect(mocks.sessionStart).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "design_system", hosting: "cloud" }),
    );
    expect(mocks.systemCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sourceRepoId: "source-repo-1",
          sourcePath: "packages/ui",
          authoringSessionGroupId: "group-1",
        }),
      }),
    );
    expect(mocks.eventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "design_system_created",
        deferPublish: true,
        payload: expect.objectContaining({
          designSystem: expect.objectContaining({
            id: "system-1",
            authoringSessionGroup: expect.objectContaining({
              sessions: [expect.objectContaining({ inputTokens: 12 })],
            }),
          }),
        }),
      }),
      database,
    );
    expect(mocks.publishCreated).toHaveBeenCalledWith({ id: "event-1" });
  });

  it("resumes an existing workbench when an identical create request is retried", async () => {
    const existing = system({
      name: "Acme UI",
      slug: "acme-ui",
      sourceRepoId: "source-repo-1",
      sourceBranch: "main",
      sourcePath: "packages/ui",
      authoringSessionGroupId: "group-1",
      archivedAt: null,
    });
    (database as typeof database & { repo: { findFirstOrThrow: ReturnType<typeof vi.fn> } }).repo =
      {
        findFirstOrThrow: vi.fn().mockResolvedValue({ id: "source-repo-1", defaultBranch: "main" }),
      };
    mocks.systemFindUnique.mockResolvedValue(existing);
    const service = new DesignSystemService();

    await expect(
      service.create({
        organizationId: "org-1",
        actorType: "user",
        actorId: "user-1",
        name: "Acme UI",
        repoId: "source-repo-1",
        sourcePath: "packages/ui",
      }),
    ).resolves.toBe(existing);

    expect(mocks.sessionStart).not.toHaveBeenCalled();
    expect(mocks.systemCreate).not.toHaveBeenCalled();
    expect(mocks.eventCreate).not.toHaveBeenCalled();
  });

  it("rejects a same-name request for a different source without leaking Prisma errors", async () => {
    const existing = system({
      name: "Acme UI",
      slug: "acme-ui",
      sourceRepoId: "other-repo",
      sourceBranch: "main",
      sourcePath: null,
      authoringSessionGroupId: "group-1",
      archivedAt: null,
    });
    (database as typeof database & { repo: { findFirstOrThrow: ReturnType<typeof vi.fn> } }).repo =
      {
        findFirstOrThrow: vi.fn().mockResolvedValue({ id: "source-repo-1", defaultBranch: "main" }),
      };
    mocks.systemFindUnique.mockResolvedValue(existing);
    const service = new DesignSystemService();

    await expect(
      service.create({
        organizationId: "org-1",
        actorType: "user",
        actorId: "user-1",
        name: "Acme UI",
        repoId: "source-repo-1",
      }),
    ).rejects.toThrow('A design system named "Acme UI" already exists');

    expect(mocks.sessionStart).not.toHaveBeenCalled();
  });

  it("creates one server-owned artifact for every commit in a multi-commit push", async () => {
    mocks.systemFindMany.mockResolvedValue([system()]);
    mocks.listCommitsBetween.mockResolvedValue(["commit-1", "commit-2", "commit-3"]);
    mocks.artifactFindFirst.mockResolvedValue(null);
    mocks.artifactFindUnique.mockResolvedValue(null);
    mocks.artifactCreate.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => ({
        id: `artifact-${data.sequence}`,
        status: "pending",
        ...data,
      }),
    );
    mocks.systemUpdate.mockResolvedValue(system());
    const service = new DesignSystemService();
    const persist = vi.spyOn(service, "persistManagedCommitArtifact").mockResolvedValue(undefined);

    await service.enqueueCommitArtifactsForManagedPush({
      organizationId: "org-1",
      repoId: "managed-repo-1",
      branch: "main",
      oldSha: "old",
      newSha: "commit-3",
      actorType: "user",
      actorId: "user-1",
    });

    expect(mocks.artifactCreate).toHaveBeenCalledTimes(3);
    expect(mocks.artifactCreate.mock.calls.map(([input]) => input.data.sequence)).toEqual([
      1, 2, 3,
    ]);
    expect(mocks.artifactCreate.mock.calls[0]?.[0].data.storageKey).toBe(
      "design-system-commits/org-1/system-1/commit-1/workbench.tar.gz",
    );
    await vi.waitFor(() =>
      expect(persist.mock.calls.map(([id]) => id)).toEqual([
        "artifact-1",
        "artifact-2",
        "artifact-3",
      ]),
    );
    expect(mocks.eventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "design_system_commit_artifact_created",
        payload: expect.objectContaining({
          designSystem: expect.objectContaining({ id: "system-1" }),
        }),
      }),
    );
    expect(mocks.versionCreate).not.toHaveBeenCalled();
  });

  it("does not duplicate artifact-created events when a managed push is retried", async () => {
    const existing = {
      id: "artifact-1",
      designSystemId: "system-1",
      commitSha: "commit-1",
      sequence: 1,
      status: "saved",
    };
    mocks.systemFindMany.mockResolvedValue([system({ latestPushedCommitSha: "commit-1" })]);
    mocks.listCommitsBetween.mockResolvedValue(["commit-1"]);
    mocks.artifactFindFirst.mockResolvedValue({ sequence: 1 });
    mocks.artifactFindUnique.mockResolvedValue(existing);
    mocks.systemUpdate.mockResolvedValue(system());
    const service = new DesignSystemService();
    const persist = vi.spyOn(service, "persistManagedCommitArtifact").mockResolvedValue(undefined);

    await service.enqueueCommitArtifactsForManagedPush({
      organizationId: "org-1",
      repoId: "managed-repo-1",
      branch: "main",
      oldSha: "old",
      newSha: "commit-1",
      actorType: "system",
      actorId: "system",
    });

    expect(mocks.artifactCreate).not.toHaveBeenCalled();
    expect(mocks.eventCreate).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(persist).toHaveBeenCalledWith("artifact-1"));
  });

  it("refuses to publish an artifact that is not managed branch HEAD", async () => {
    mocks.systemFindFirstOrThrow.mockResolvedValue(
      system({
        latestCommitArtifact: {
          id: "artifact-1",
          commitSha: "stale",
          status: "saved",
          packageValid: true,
        },
      }),
    );
    mocks.getBranchHead.mockResolvedValue("current-head");
    const service = new DesignSystemService();

    await expect(
      service.save({
        id: "system-1",
        organizationId: "org-1",
        actorType: "user",
        actorId: "user-1",
      }),
    ).rejects.toThrow("managed branch HEAD");
    expect(mocks.storageGet).not.toHaveBeenCalled();
    expect(mocks.systemUpdate).not.toHaveBeenCalled();
  });

  it("returns the immutable version when the same HEAD artifact is saved twice", async () => {
    const artifact = {
      id: "artifact-1",
      commitSha: "head",
      status: "saved",
      packageValid: true,
      packageDigest: "digest",
    };
    const version = { id: "version-1", version: 1, designSystemCommitArtifactId: artifact.id };
    mocks.systemFindFirstOrThrow.mockResolvedValue(system({ latestCommitArtifact: artifact }));
    mocks.getBranchHead.mockResolvedValue("head");
    mocks.versionFindUnique.mockResolvedValue(version);
    const service = new DesignSystemService();

    await expect(
      service.save({
        id: "system-1",
        organizationId: "org-1",
        actorType: "user",
        actorId: "user-1",
      }),
    ).resolves.toEqual(version);
    expect(mocks.storageGet).not.toHaveBeenCalled();
    expect(mocks.versionCreate).not.toHaveBeenCalled();
  });
});
