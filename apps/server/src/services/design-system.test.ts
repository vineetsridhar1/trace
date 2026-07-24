import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

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
    systemUpdateMany: vi.fn(),
    artifactFindFirst: vi.fn(),
    artifactFindMany: vi.fn(),
    artifactFindUnique: vi.fn(),
    artifactFindUniqueOrThrow: vi.fn(),
    artifactUpdate: vi.fn(),
    artifactUpdateMany: vi.fn(),
    artifactCreate: vi.fn(),
    versionFindUnique: vi.fn(),
    versionCreate: vi.fn(),
    listCommitsBetween: vi.fn(),
    getBranchHead: vi.fn(),
    eventCreate: vi.fn(),
    publishCreated: vi.fn(),
    sessionStart: vi.fn(),
    queueInternalMessage: vi.fn(),
    storageGet: vi.fn(),
    storagePut: vi.fn(),
    storageDelete: vi.fn(),
    sessionGroupUpdateMany: vi.fn(),
    sessionGroupUpdate: vi.fn(),
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
      updateMany: mocks.systemUpdateMany,
    },
    designSystemCommitArtifact: {
      findFirst: mocks.artifactFindFirst,
      findMany: mocks.artifactFindMany,
      findUnique: mocks.artifactFindUnique,
      findUniqueOrThrow: mocks.artifactFindUniqueOrThrow,
      update: mocks.artifactUpdate,
      updateMany: mocks.artifactUpdateMany,
      create: mocks.artifactCreate,
    },
    sessionGroup: {
      update: mocks.sessionGroupUpdate,
      updateMany: mocks.sessionGroupUpdateMany,
    },
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
vi.mock("./session.js", () => ({
  sessionService: {
    start: mocks.sessionStart,
    queueInternalMessage: mocks.queueInternalMessage,
  },
}));

import {
  DesignSystemService,
  shouldAdvanceLatestArtifact,
  shouldAutoPublishArtifact,
} from "./design-system.js";
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
    mocks.systemUpdateMany.mockResolvedValue({ count: 1 });
    mocks.sessionGroupUpdate.mockResolvedValue({ id: "group-1", sessions: [] });
    mocks.systemFindMany.mockResolvedValue([]);
    mocks.sessionGroupUpdateMany.mockResolvedValue({ count: 0 });
    mocks.queueInternalMessage.mockResolvedValue("queued");
  });

  it("counts repair prompts across successive invalid commits and stops at the limit", async () => {
    mocks.artifactFindUnique.mockResolvedValue({ repairRequestedAt: null });
    mocks.artifactUpdateMany.mockResolvedValue({ count: 1 });
    mocks.systemFindUnique
      .mockResolvedValueOnce({ repairAttempts: 0 })
      .mockResolvedValueOnce({ repairAttempts: 1 })
      .mockResolvedValueOnce({ repairAttempts: 2 })
      .mockResolvedValueOnce({ repairAttempts: 3 });
    mocks.systemUpdateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 });
    const service = new DesignSystemService();

    for (let attempt = 1; attempt <= 4; attempt += 1) {
      await service.requestArtifactRepair({
        artifactId: `artifact-${attempt}`,
        designSystemId: "system-1",
        organizationId: "org-1",
        sessionGroupId: "group-1",
        commitSha: `commit-${attempt}`,
        errors: ["invalid token"],
      });
    }

    expect(mocks.queueInternalMessage).toHaveBeenCalledTimes(3);
    expect(mocks.systemUpdateMany).toHaveBeenCalledTimes(3);
    expect(mocks.queueInternalMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionGroupId: "group-1",
        clientSource: "internal:design-system-repair",
        text: expect.stringContaining("invalid token"),
      }),
    );
  });

  it("does not consume a repair attempt when no existing runtime can queue it", async () => {
    mocks.systemFindUnique.mockResolvedValue({ repairAttempts: 0 });
    mocks.artifactFindUnique.mockResolvedValue({ repairRequestedAt: null });
    mocks.artifactUpdateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 });
    mocks.queueInternalMessage.mockResolvedValue("runtime_unavailable");

    await new DesignSystemService().requestArtifactRepair({
      artifactId: "artifact-1",
      designSystemId: "system-1",
      organizationId: "org-1",
      sessionGroupId: "group-1",
      commitSha: "commit-1",
      errors: ["invalid token"],
    });

    expect(mocks.artifactUpdateMany).toHaveBeenLastCalledWith({
      where: { id: "artifact-1", repairRequestedAt: { not: null } },
      data: { repairRequestedAt: null },
    });
    expect(mocks.systemUpdateMany).toHaveBeenLastCalledWith({
      where: { id: "system-1", repairAttempts: { gt: 0 } },
      data: { repairAttempts: { decrement: 1 } },
    });
  });

  it("does not queue after a concurrent worker claims the final repair slot", async () => {
    mocks.systemFindUnique.mockResolvedValue({ repairAttempts: 2 });
    mocks.artifactFindUnique.mockResolvedValue({ repairRequestedAt: null });
    mocks.systemUpdateMany.mockResolvedValueOnce({ count: 0 });

    await new DesignSystemService().requestArtifactRepair({
      artifactId: "artifact-4",
      designSystemId: "system-1",
      organizationId: "org-1",
      sessionGroupId: "group-1",
      commitSha: "commit-4",
      errors: ["invalid token"],
    });

    expect(mocks.queueInternalMessage).not.toHaveBeenCalled();
    expect(mocks.artifactUpdateMany).not.toHaveBeenCalled();
  });

  it("does not request repair twice for the same artifact", async () => {
    mocks.systemFindUnique.mockResolvedValue({ repairAttempts: 1 });
    mocks.artifactFindUnique.mockResolvedValue({ repairRequestedAt: new Date() });

    await new DesignSystemService().requestArtifactRepair({
      artifactId: "artifact-1",
      designSystemId: "system-1",
      organizationId: "org-1",
      sessionGroupId: "group-1",
      commitSha: "commit-1",
      errors: ["invalid token"],
    });

    expect(mocks.queueInternalMessage).not.toHaveBeenCalled();
  });

  it("never lets an out-of-order worker regress the latest artifact pointer", () => {
    expect(shouldAdvanceLatestArtifact(null, 1)).toBe(true);
    expect(shouldAdvanceLatestArtifact(1, 2)).toBe(true);
    expect(shouldAdvanceLatestArtifact(3, 2)).toBe(false);
    expect(shouldAdvanceLatestArtifact(3, 3)).toBe(false);
  });

  it("only auto-publishes the valid artifact for the latest pushed commit", () => {
    expect(
      shouldAutoPublishArtifact({
        packageValid: true,
        artifactId: "artifact-2",
        artifactCommitSha: "commit-2",
        latestCommitArtifactId: "artifact-2",
        latestPushedCommitSha: "commit-2",
      }),
    ).toBe(true);
    expect(
      shouldAutoPublishArtifact({
        packageValid: false,
        artifactId: "artifact-2",
        artifactCommitSha: "commit-2",
        latestCommitArtifactId: "artifact-2",
        latestPushedCommitSha: "commit-2",
      }),
    ).toBe(false);
    expect(
      shouldAutoPublishArtifact({
        packageValid: true,
        artifactId: "artifact-1",
        artifactCommitSha: "commit-1",
        latestCommitArtifactId: "artifact-2",
        latestPushedCommitSha: "commit-2",
      }),
    ).toBe(false);
  });


  it("revalidates a saved artifact after a compatible validator upgrade", async () => {
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64",
    );
    const archive = await createDeterministicTarGz(
      new Map<string, Buffer>([
        [
          "design-system/manifest.json",
          Buffer.from(
            JSON.stringify({
              schemaVersion: "trace-design-system/v1",
              id: "fixture",
              name: "Fixture",
              description: "Fixture",
              platforms: ["web"],
              files: {
                guidance: "DESIGN.md",
                tokens: "tokens.css",
                components: "components.manifest.json",
                evidence: "source/evidence.json",
              },
              componentsDirectory: "components",
              assetsDirectory: "assets",
              previewDirectory: "preview",
            }),
          ),
        ],
        ["design-system/DESIGN.md", Buffer.from("# Fixture")],
        [
          "design-system/tokens.css",
          Buffer.from(
            ":root { --background:#fff; --surface:#fff; --foreground:#111; --muted-foreground:#555; --border:#ccc; --accent:#064; --accent-foreground:#fff; --destructive:#c00; --success:#080; --warning:#a60; --font-sans:system-ui; --text-base:1rem; --space-1:.25rem; --radius:.5rem; --shadow:none; --focus-ring:none; --motion-duration:150ms; }",
          ),
        ],
        ["design-system/components.manifest.json", Buffer.from('{"components":[]}')],
        [
          "design-system/preview/foundations.html",
          Buffer.from("<!doctype html><html><body>Foundations</body></html>"),
        ],
        [
          "design-system/preview/components.html",
          Buffer.from("<!doctype html><html><body>Components</body></html>"),
        ],
        ["design-system/preview/foundations.png", png],
        ["design-system/preview/components.png", png],
        ["design-system/source/evidence.json", Buffer.from("{}")],
      ]),
    );
    mocks.artifactFindMany.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: "artifact-1" }]);
    mocks.artifactFindUniqueOrThrow.mockResolvedValue({
      id: "artifact-1",
      designSystemId: "system-1",
      sequence: 1,
      commitSha: "commit-1",
      storageKey: "workbench.tar.gz",
      status: "saved",
      packageValid: false,
      designSystem: { organizationId: "org-1" },
    });
    mocks.storageGet.mockResolvedValue(archive);
    mocks.artifactUpdate.mockResolvedValue({
      id: "artifact-1",
      commitSha: "commit-1",
      packageValid: true,
    });
    mocks.systemUpdate.mockResolvedValue(
      system({ latestCommitArtifactId: "newer-artifact", latestPushedCommitSha: "commit-2" }),
    );

    await expect(new DesignSystemService().reconcileCommitArtifacts()).resolves.toBe(1);

    expect(mocks.artifactUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ packageValid: true }) }),
    );
    expect(mocks.systemUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { repairAttempts: 0 } }),
    );
    expect(mocks.eventCreate).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "design_system_commit_artifact_updated" }),
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

  it("resumes the concurrent winner when slug creation loses a uniqueness race", async () => {
    const winner = system({
      name: "Acme UI",
      slug: "acme-ui",
      sourceRepoId: "source-repo-1",
      sourceBranch: "main",
      sourcePath: "packages/ui",
      archivedAt: null,
    });
    (database as typeof database & { repo: { findFirstOrThrow: ReturnType<typeof vi.fn> } }).repo =
      {
        findFirstOrThrow: vi.fn().mockResolvedValue({ id: "source-repo-1", defaultBranch: "main" }),
      };
    mocks.systemFindUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(winner);
    mocks.sessionStart.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("unique", {
        code: "P2002",
        clientVersion: "test",
      }),
    );

    await expect(
      new DesignSystemService().create({
        organizationId: "org-1",
        actorType: "user",
        actorId: "user-1",
        name: "Acme UI",
        repoId: "source-repo-1",
        sourcePath: "packages/ui",
      }),
    ).resolves.toBe(winner);
  });

  it("archives the authoring group through the same service event", async () => {
    mocks.systemFindFirstOrThrow.mockResolvedValue(system({ authoringSessionGroupId: "group-1" }));
    mocks.systemUpdate.mockResolvedValue(system({ status: "archived", archivedAt: new Date() }));
    mocks.sessionGroupUpdate.mockResolvedValue({
      id: "group-1",
      archivedAt: new Date(),
      sessions: [{ id: "session-1" }],
    });

    await new DesignSystemService().archive({
      id: "system-1",
      organizationId: "org-1",
      actorType: "user",
      actorId: "user-1",
    });

    expect(mocks.eventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "design_system_archived",
        payload: expect.objectContaining({
          designSystem: expect.objectContaining({ status: "archived" }),
          sessionGroup: expect.objectContaining({ id: "group-1" }),
        }),
      }),
    );
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
