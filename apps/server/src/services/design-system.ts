import { randomUUID } from "node:crypto";
import { Prisma, type ActorType, type DesignSystemCommitArtifact } from "@prisma/client";
import {
  designSystemCommitStorageKey,
  designSystemVersionStorageKey,
  type DesignSystemManifest,
} from "@trace/shared";
import { prisma } from "../lib/db.js";
import { ValidationError } from "../lib/errors.js";
import { gitStorage } from "../lib/git-storage/index.js";
import { storage } from "../lib/storage/index.js";
import {
  createDeterministicTarGz,
  packageFilesFromWorkbench,
  parseDesignSystemTarGz,
  parseGitTreeArchive,
  sha256,
  validateWorkbenchPackage,
} from "../lib/design-system-archive.js";
import { assertActorOrgAccess, assertActorOrgAdmin } from "./actor-auth.js";
import { eventService } from "./event.js";
import { sessionService } from "./session.js";

const ARTIFACT_BATCH_SIZE = 100;

export function shouldAdvanceLatestArtifact(
  currentSequence: number | null,
  candidateSequence: number,
): boolean {
  return currentSequence === null || candidateSequence > currentSequence;
}

function eventJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function slugify(name: string): string {
  const slug = name
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
  if (!slug) throw new ValidationError("Design system name must contain letters or numbers");
  return slug;
}

function sourcePath(value: string | null | undefined): string | null {
  const normalized = value?.trim().replace(/^\.\//, "").replace(/\/$/, "") ?? "";
  if (!normalized) return null;
  const segments = normalized.split("/");
  if (
    normalized.length > 512 ||
    segments.length > 20 ||
    normalized.startsWith("/") ||
    segments.some((segment) => !segment || segment === "." || segment === "..")
  ) {
    throw new ValidationError("Source path must stay inside the repository");
  }
  return normalized;
}

function sourceBranch(value: string): string {
  const branch = value.trim();
  if (
    !branch ||
    branch.length > 255 ||
    branch.startsWith("-") ||
    !/^[A-Za-z0-9._/-]+$/.test(branch) ||
    branch.includes("..") ||
    branch.includes("//")
  ) {
    throw new ValidationError("Invalid source branch");
  }
  return branch;
}

const DESIGN_SYSTEM_INCLUDE = {
  sourceRepo: true,
  activeVersion: true,
  latestCommitArtifact: true,
  authoringSessionGroup: {
    include: { repo: true, sessions: { orderBy: { createdAt: "desc" as const } } },
  },
} satisfies Prisma.DesignSystemInclude;

function packageArchiveFiles(workbenchFiles: ReadonlyMap<string, Buffer>): Map<string, Buffer> {
  const files = new Map<string, Buffer>();
  for (const [name, body] of packageFilesFromWorkbench(workbenchFiles)) {
    files.set(`design-system/${name}`, body);
  }
  return files;
}

async function putImmutableObject(key: string, body: Buffer): Promise<void> {
  try {
    await storage.putObject(key, body, "application/gzip", { ifAbsent: true });
  } catch (uploadError) {
    const existing = await storage.getObject(key).catch(() => null);
    if (!existing) throw uploadError;
    if (sha256(existing) !== sha256(body))
      throw new Error("Immutable storage key already contains different content");
  }
}

export class DesignSystemService {
  async reconcileCommitArtifacts(): Promise<number> {
    const staleBefore = new Date(Date.now() - 90_000);
    await prisma.designSystemCommitArtifact.updateMany({
      where: { status: "saving", createdAt: { lt: staleBefore } },
      data: { status: "pending", error: "Recovered interrupted artifact upload" },
    });
    const pending = await prisma.designSystemCommitArtifact.findMany({
      where: { status: "pending" },
      orderBy: [{ designSystemId: "asc" }, { sequence: "asc" }],
      take: 100,
      select: { id: true },
    });
    for (const artifact of pending) {
      await this.persistManagedCommitArtifact(artifact.id).catch((error: unknown) => {
        console.warn("[design-system] artifact reconciliation failed", {
          artifactId: artifact.id,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }
    return pending.length;
  }

  async list(input: {
    organizationId: string;
    actorType: ActorType;
    actorId: string;
    includeArchived?: boolean;
  }) {
    await prisma.$transaction((tx) =>
      assertActorOrgAccess(tx, input.organizationId, input.actorType, input.actorId),
    );
    return prisma.designSystem.findMany({
      where: {
        organizationId: input.organizationId,
        ...(!input.includeArchived ? { status: { not: "archived" } } : {}),
      },
      include: DESIGN_SYSTEM_INCLUDE,
      orderBy: { updatedAt: "desc" },
    });
  }

  async get(input: { id: string; organizationId: string; actorType: ActorType; actorId: string }) {
    await prisma.$transaction((tx) =>
      assertActorOrgAccess(tx, input.organizationId, input.actorType, input.actorId),
    );
    return prisma.designSystem.findFirst({
      where: { id: input.id, organizationId: input.organizationId },
      include: DESIGN_SYSTEM_INCLUDE,
    });
  }

  async listVersions(input: {
    designSystemId: string;
    organizationId: string;
    actorType: ActorType;
    actorId: string;
  }) {
    await this.requireSystem(input);
    return prisma.designSystemVersion.findMany({
      where: { designSystemId: input.designSystemId },
      orderBy: { version: "desc" },
    });
  }

  async listCommitArtifacts(input: {
    designSystemId: string;
    organizationId: string;
    actorType: ActorType;
    actorId: string;
    first?: number;
    after?: string | null;
  }) {
    await this.requireSystem(input);
    const take = Math.min(Math.max(input.first ?? 50, 1), 100);
    const rows = await prisma.designSystemCommitArtifact.findMany({
      where: { designSystemId: input.designSystemId },
      orderBy: { sequence: "desc" },
      take: take + 1,
      ...(input.after ? { cursor: { id: input.after }, skip: 1 } : {}),
    });
    const nodes = rows.slice(0, take);
    return {
      edges: nodes.map((node) => ({ cursor: node.id, node })),
      hasNextPage: rows.length > take,
      endCursor: nodes.at(-1)?.id ?? null,
    };
  }

  async create(input: {
    organizationId: string;
    actorType: ActorType;
    actorId: string;
    name: string;
    repoId: string;
    branch?: string | null;
    sourcePath?: string | null;
    environmentId?: string | null;
  }) {
    const name = input.name.trim();
    if (!name || name.length > 100) throw new ValidationError("Design system name is required");
    const repo = await prisma.$transaction(async (tx) => {
      await assertActorOrgAccess(tx, input.organizationId, input.actorType, input.actorId);
      return tx.repo.findFirstOrThrow({
        where: {
          id: input.repoId,
          organizationId: input.organizationId,
          provider: { not: "managed" },
        },
      });
    });
    const branch = sourceBranch(input.branch?.trim() || repo.defaultBranch);
    const normalizedSourcePath = sourcePath(input.sourcePath);
    const slug = slugify(name);
    const id = randomUUID();
    let createdEvent: Awaited<ReturnType<typeof eventService.create>> | null = null;
    const session = await sessionService.start({
      organizationId: input.organizationId,
      createdById: input.actorId,
      actorType: input.actorType,
      kind: "design_system",
      hosting: "cloud",
      environmentId: input.environmentId ?? undefined,
      name,
      visibility: "public",
      prompt: `Create the initial design system from the read-only source checkout. Source branch: ${branch}${normalizedSourcePath ? `; source path: ${normalizedSourcePath}` : ""}.`,
      afterCreate: async ({ tx, sessionGroup }) => {
        const designSystem = await tx.designSystem.create({
          data: {
            id,
            organizationId: input.organizationId,
            name,
            slug,
            sourceRepoId: repo.id,
            sourceBranch: branch,
            sourcePath: normalizedSourcePath,
            authoringSessionGroupId: sessionGroup.id,
            createdById: input.actorId,
          },
          include: DESIGN_SYSTEM_INCLUDE,
        });
        createdEvent = await eventService.create(
          {
            organizationId: input.organizationId,
            scopeType: "system",
            scopeId: id,
            eventType: "design_system_created",
            payload: eventJson({ designSystem }),
            actorType: input.actorType,
            actorId: input.actorId,
            deferPublish: true,
          },
          tx,
        );
      },
    });
    if (createdEvent) eventService.publishCreated(createdEvent);
    const designSystem = await prisma.designSystem.findUniqueOrThrow({
      where: { id },
      include: DESIGN_SYSTEM_INCLUDE,
    });
    console.info("[design-system] authoring session created", {
      organizationId: input.organizationId,
      designSystemId: id,
      sessionGroupId: designSystem.authoringSessionGroupId,
      sourceRepoId: repo.id,
    });
    return {
      ...designSystem,
      authoringSessionGroup: session.sessionGroup ?? designSystem.authoringSessionGroup,
    };
  }

  async archive(input: {
    id: string;
    organizationId: string;
    actorType: ActorType;
    actorId: string;
  }) {
    await prisma.$transaction((tx) =>
      assertActorOrgAdmin(tx, input.organizationId, input.actorType, input.actorId),
    );
    const designSystem = await prisma.designSystem.findFirstOrThrow({
      where: { id: input.id, organizationId: input.organizationId },
    });
    const updated = await prisma.designSystem.update({
      where: { id: designSystem.id },
      data: { status: "archived", archivedAt: new Date() },
      include: DESIGN_SYSTEM_INCLUDE,
    });
    await eventService.create({
      organizationId: input.organizationId,
      scopeType: "system",
      scopeId: updated.id,
      eventType: "design_system_archived",
      payload: eventJson({ designSystem: updated }),
      actorType: input.actorType,
      actorId: input.actorId,
    });
    return updated;
  }

  async enqueueCommitArtifactsForManagedPush(input: {
    organizationId: string;
    repoId: string;
    branch: string;
    oldSha: string;
    newSha: string;
    actorType: ActorType;
    actorId: string;
  }): Promise<void> {
    const systems = await prisma.designSystem.findMany({
      where: {
        organizationId: input.organizationId,
        authoringSessionGroup: {
          repoId: input.repoId,
          OR: [{ branch: input.branch }, { branch: null, repo: { defaultBranch: input.branch } }],
        },
      },
    });
    if (systems.length === 0) return;
    const commits = await gitStorage.listCommitsBetween(
      input.organizationId,
      input.repoId,
      input.oldSha,
      input.newSha,
    );
    for (const system of systems) {
      for (let offset = 0; offset < commits.length; offset += ARTIFACT_BATCH_SIZE) {
        const batch = commits.slice(offset, offset + ARTIFACT_BATCH_SIZE);
        const result = await prisma.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT "id" FROM "DesignSystem" WHERE "id" = ${system.id} FOR UPDATE`;
          const latest = await tx.designSystemCommitArtifact.findFirst({
            where: { designSystemId: system.id },
            orderBy: { sequence: "desc" },
            select: { sequence: true },
          });
          let sequence = latest?.sequence ?? 0;
          const artifacts: Array<{ artifact: DesignSystemCommitArtifact; created: boolean }> = [];
          for (const commitSha of batch) {
            const existing = await tx.designSystemCommitArtifact.findUnique({
              where: { designSystemId_commitSha: { designSystemId: system.id, commitSha } },
            });
            if (existing) {
              artifacts.push({ artifact: existing, created: false });
              continue;
            }
            sequence += 1;
            artifacts.push({
              artifact: await tx.designSystemCommitArtifact.create({
                data: {
                  designSystemId: system.id,
                  sequence,
                  commitSha,
                  storageKey: designSystemCommitStorageKey(
                    input.organizationId,
                    system.id,
                    commitSha,
                  ),
                  createdById: input.actorType === "user" ? input.actorId : null,
                },
              }),
              created: true,
            });
          }
          const designSystem = await tx.designSystem.update({
            where: { id: system.id },
            data: {
              latestPushedCommitSha: batch.at(-1),
              commitArtifactStatus: "pending",
              commitArtifactError: null,
            },
            include: DESIGN_SYSTEM_INCLUDE,
          });
          return { artifacts, designSystem };
        });
        for (const { artifact, created } of result.artifacts) {
          if (created) {
            await eventService.create({
              organizationId: input.organizationId,
              scopeType: "system",
              scopeId: system.id,
              eventType: "design_system_commit_artifact_created",
              payload: eventJson({
                designSystem: result.designSystem,
                designSystemCommitArtifact: artifact,
              }),
              actorType: input.actorType,
              actorId: input.actorId,
            });
          }
          setImmediate(() => {
            void this.persistManagedCommitArtifact(artifact.id).catch((error: unknown) => {
              console.warn("[design-system] queued artifact persistence failed", {
                artifactId: artifact.id,
                error: error instanceof Error ? error.message : String(error),
              });
            });
          });
        }
      }
    }
  }

  async persistManagedCommitArtifact(artifactId: string): Promise<void> {
    const startedAt = Date.now();
    const claimed = await prisma.designSystemCommitArtifact.updateMany({
      where: { id: artifactId, status: { in: ["pending", "failed"] } },
      data: { status: "saving", error: null },
    });
    if (claimed.count === 0) return;
    const artifact = await prisma.designSystemCommitArtifact.findUniqueOrThrow({
      where: { id: artifactId },
      include: {
        designSystem: { include: { authoringSessionGroup: { include: { repo: true } } } },
      },
    });
    const group = artifact.designSystem.authoringSessionGroup;
    if (!group.repoId || !group.repo) throw new Error("Authoring group has no managed repository");
    if (artifact.designSystem.latestPushedCommitSha === artifact.commitSha) {
      const saving = await prisma.designSystem.update({
        where: { id: artifact.designSystemId },
        data: { commitArtifactStatus: "saving", commitArtifactError: null },
        include: DESIGN_SYSTEM_INCLUDE,
      });
      await eventService.create({
        organizationId: artifact.designSystem.organizationId,
        scopeType: "system",
        scopeId: artifact.designSystemId,
        eventType: "design_system_commit_artifact_updated",
        payload: eventJson({
          designSystem: saving,
          designSystemCommitArtifact: { ...artifact, status: "saving" },
        }),
        actorType: "system",
        actorId: "system",
      });
    }
    try {
      const gitTar = await gitStorage.archiveTreeAtCommit(
        artifact.designSystem.organizationId,
        group.repoId,
        artifact.commitSha,
      );
      const workbench = await parseGitTreeArchive(gitTar);
      const archive = await createDeterministicTarGz(workbench.files);
      if (archive.byteLength > 25 * 1024 * 1024)
        throw new Error("Compressed workbench artifact exceeds 25 MiB");
      const validation = validateWorkbenchPackage(workbench.files);
      const packageArchive = await createDeterministicTarGz(packageArchiveFiles(workbench.files));
      if (packageArchive.byteLength > 25 * 1024 * 1024)
        throw new Error("Compressed design-system package exceeds 25 MiB");
      await putImmutableObject(artifact.storageKey, archive);
      const saved = await prisma.$transaction(async (tx) => {
        const row = await tx.designSystemCommitArtifact.update({
          where: { id: artifact.id },
          data: {
            status: "saved",
            contentDigest: sha256(archive),
            byteSize: archive.byteLength,
            packageValid: validation.valid,
            packageDigest: sha256(packageArchive),
            validationSummary: eventJson(validation),
            error: null,
            savedAt: new Date(),
          },
        });
        const current = await tx.designSystem.findUniqueOrThrow({
          where: { id: artifact.designSystemId },
          include: { latestCommitArtifact: true },
        });
        const pointerIsNewer = shouldAdvanceLatestArtifact(
          current.latestCommitArtifact?.sequence ?? null,
          artifact.sequence,
        );
        return tx.designSystem
          .update({
            where: { id: current.id },
            data: {
              ...(pointerIsNewer ? { latestCommitArtifactId: artifact.id } : {}),
              ...(current.latestPushedCommitSha === artifact.commitSha
                ? { commitArtifactStatus: "saved", commitArtifactError: null }
                : {}),
            },
            include: DESIGN_SYSTEM_INCLUDE,
          })
          .then((designSystem) => ({ row, designSystem }));
      });
      await eventService.create({
        organizationId: artifact.designSystem.organizationId,
        scopeType: "system",
        scopeId: artifact.designSystemId,
        eventType: "design_system_commit_artifact_updated",
        payload: eventJson({
          designSystem: saved.designSystem,
          designSystemCommitArtifact: saved.row,
        }),
        actorType: "system",
        actorId: "system",
      });
      console.info("[design-system] commit artifact saved", {
        organizationId: artifact.designSystem.organizationId,
        designSystemId: artifact.designSystemId,
        sessionGroupId: group.id,
        artifactId: artifact.id,
        commitSha: artifact.commitSha,
        byteSize: archive.byteLength,
        fileCount: workbench.files.size,
        packageValid: validation.valid,
        digestPrefix: sha256(archive).slice(0, 12),
        durationMs: Date.now() - startedAt,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message.slice(0, 500) : "Artifact persistence failed";
      const failed = await prisma.$transaction(async (tx) => {
        const row = await tx.designSystemCommitArtifact.update({
          where: { id: artifact.id },
          data: { status: "failed", error: message },
        });
        const current = await tx.designSystem.findUniqueOrThrow({
          where: { id: artifact.designSystemId },
        });
        const designSystem =
          current.latestPushedCommitSha === artifact.commitSha
            ? await tx.designSystem.update({
                where: { id: current.id },
                data: { commitArtifactStatus: "failed", commitArtifactError: message },
                include: DESIGN_SYSTEM_INCLUDE,
              })
            : await tx.designSystem.findUniqueOrThrow({
                where: { id: current.id },
                include: DESIGN_SYSTEM_INCLUDE,
              });
        return { row, designSystem };
      });
      await eventService.create({
        organizationId: artifact.designSystem.organizationId,
        scopeType: "system",
        scopeId: artifact.designSystemId,
        eventType: "design_system_commit_artifact_updated",
        payload: eventJson({
          designSystem: failed.designSystem,
          designSystemCommitArtifact: failed.row,
        }),
        actorType: "system",
        actorId: "system",
      });
      console.warn("[design-system] commit artifact failed", {
        organizationId: artifact.designSystem.organizationId,
        designSystemId: artifact.designSystemId,
        artifactId: artifact.id,
        commitSha: artifact.commitSha,
        failureStage: "archive_or_upload",
        durationMs: Date.now() - startedAt,
        error: message,
      });
      throw error;
    }
  }

  async retryCommitArtifact(input: {
    designSystemId: string;
    organizationId: string;
    actorType: ActorType;
    actorId: string;
  }) {
    const system = await this.requireSystem(input);
    const artifact = await prisma.designSystemCommitArtifact.findFirst({
      where: { designSystemId: system.id, commitSha: system.latestPushedCommitSha ?? undefined },
    });
    if (!artifact || artifact.status !== "failed")
      throw new ValidationError("No failed latest artifact to retry");
    await prisma.designSystemCommitArtifact.update({
      where: { id: artifact.id },
      data: { status: "pending", error: null },
    });
    await this.persistManagedCommitArtifact(artifact.id);
    return prisma.designSystem.findUniqueOrThrow({
      where: { id: system.id },
      include: DESIGN_SYSTEM_INCLUDE,
    });
  }

  async refreshSource(input: {
    id: string;
    organizationId: string;
    actorType: ActorType;
    actorId: string;
  }) {
    return sessionService.refreshDesignSystemSource({
      designSystemId: input.id,
      organizationId: input.organizationId,
      actorType: input.actorType,
      actorId: input.actorId,
    });
  }

  async save(input: { id: string; organizationId: string; actorType: ActorType; actorId: string }) {
    const startedAt = Date.now();
    const system = await this.requireSystem({ ...input, designSystemId: input.id });
    if (system.status === "archived")
      throw new ValidationError("Archived design systems cannot be published");
    const group = system.authoringSessionGroup;
    const activeSession = group.sessions[0];
    if (activeSession?.agentStatus === "active")
      throw new ValidationError("Wait for the authoring agent to finish");
    if (!group.repoId) throw new ValidationError("Authoring repository is unavailable");
    const branch = group.branch || group.repo?.defaultBranch || "main";
    const head = await gitStorage.getBranchHead(input.organizationId, group.repoId, branch);
    if (!head) throw new ValidationError("Authoring branch has no commit");
    const artifact = system.latestCommitArtifact;
    if (!artifact || artifact.commitSha !== head)
      throw new ValidationError("Latest saved artifact is not managed branch HEAD");
    const existing = await prisma.designSystemVersion.findUnique({
      where: { designSystemCommitArtifactId: artifact.id },
    });
    if (existing) return existing;
    if (artifact.status !== "saved")
      throw new ValidationError("The HEAD artifact is not cloud saved");
    if (!artifact.packageValid || !artifact.packageDigest)
      throw new ValidationError("The HEAD package is not valid");

    const publishing = await prisma.designSystem.update({
      where: { id: system.id },
      data: { publishStatus: "publishing", publishAttemptedAt: new Date(), publishError: null },
      include: DESIGN_SYSTEM_INCLUDE,
    });
    await eventService.create({
      organizationId: input.organizationId,
      scopeType: "system",
      scopeId: system.id,
      eventType: "design_system_publish_updated",
      payload: eventJson({ designSystem: publishing }),
      actorType: input.actorType,
      actorId: input.actorId,
    });

    const versionId = randomUUID();
    const key = designSystemVersionStorageKey(input.organizationId, system.id, versionId);
    let uploaded = false;
    try {
      const stored = await storage.getObject(artifact.storageKey);
      if (artifact.contentDigest && sha256(stored) !== artifact.contentDigest)
        throw new Error("Commit artifact digest mismatch");
      const workbench = await parseDesignSystemTarGz(stored);
      const validation = validateWorkbenchPackage(workbench.files);
      if (!validation.valid || !validation.manifest)
        throw new ValidationError(validation.errors.join("; "));
      const packageArchive = await createDeterministicTarGz(packageArchiveFiles(workbench.files));
      const digest = sha256(packageArchive);
      const evidence = JSON.parse(
        packageFilesFromWorkbench(workbench.files).get("source/evidence.json")?.toString("utf8") ??
          "{}",
      ) as { sourceCommit?: unknown; commit?: unknown };
      const sourceCommitSha =
        typeof evidence.sourceCommit === "string"
          ? evidence.sourceCommit
          : typeof evidence.commit === "string"
            ? evidence.commit
            : null;
      if (digest !== artifact.packageDigest)
        throw new Error("Package digest changed during publication");
      await putImmutableObject(key, packageArchive);
      uploaded = true;
      const result = await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "DesignSystem" WHERE "id" = ${system.id} FOR UPDATE`;
        const duplicate = await tx.designSystemVersion.findFirst({
          where: {
            designSystemId: system.id,
            OR: [{ contentDigest: digest }, { designSystemCommitArtifactId: artifact.id }],
          },
        });
        if (duplicate)
          return {
            version: duplicate,
            designSystem: await tx.designSystem.findUniqueOrThrow({
              where: { id: system.id },
              include: DESIGN_SYSTEM_INCLUDE,
            }),
          };
        const latest = await tx.designSystemVersion.findFirst({
          where: { designSystemId: system.id },
          orderBy: { version: "desc" },
        });
        const version = await tx.designSystemVersion.create({
          data: {
            id: versionId,
            designSystemId: system.id,
            version: (latest?.version ?? 0) + 1,
            storageKey: key,
            contentDigest: digest,
            byteSize: packageArchive.byteLength,
            sourceCommitSha,
            authoringSessionGroupId: group.id,
            designSystemCommitArtifactId: artifact.id,
            workbenchCommitSha: head,
            manifest: eventJson(validation.manifest as DesignSystemManifest),
            validationSummary: eventJson(validation),
            createdById: input.actorId,
          },
        });
        const designSystem = await tx.designSystem.update({
          where: { id: system.id },
          data: {
            activeVersionId: version.id,
            status: "ready",
            publishStatus: "published",
            publishedCommitSha: head,
            publishError: null,
          },
          include: DESIGN_SYSTEM_INCLUDE,
        });
        return { version, designSystem };
      });
      if (result.version.id !== versionId) {
        await storage.deleteObject(key).catch(() => {});
        uploaded = false;
      }
      await eventService.create({
        organizationId: input.organizationId,
        scopeType: "system",
        scopeId: system.id,
        eventType: "design_system_version_created",
        payload: eventJson({
          designSystem: result.designSystem,
          designSystemVersion: result.version,
        }),
        actorType: input.actorType,
        actorId: input.actorId,
      });
      console.info("[design-system] version published", {
        organizationId: input.organizationId,
        designSystemId: system.id,
        sessionGroupId: group.id,
        versionId: result.version.id,
        version: result.version.version,
        sourceCommitSha,
        commitSha: head,
        byteSize: packageArchive.byteLength,
        fileCount: packageFilesFromWorkbench(workbench.files).size,
        digestPrefix: digest.slice(0, 12),
        durationMs: Date.now() - startedAt,
      });
      return result.version;
    } catch (error) {
      if (uploaded) await storage.deleteObject(key).catch(() => {});
      const message = error instanceof Error ? error.message.slice(0, 500) : "Publication failed";
      const failed = await prisma.designSystem.update({
        where: { id: system.id },
        data: { publishStatus: "failed", publishError: message },
        include: DESIGN_SYSTEM_INCLUDE,
      });
      await eventService.create({
        organizationId: input.organizationId,
        scopeType: "system",
        scopeId: system.id,
        eventType: "design_system_publish_updated",
        payload: eventJson({ designSystem: failed }),
        actorType: input.actorType,
        actorId: input.actorId,
      });
      console.warn("[design-system] version publication failed", {
        organizationId: input.organizationId,
        designSystemId: system.id,
        commitSha: head,
        failureStage: "validation_upload_or_transaction",
        durationMs: Date.now() - startedAt,
        error: message,
      });
      throw error;
    }
  }

  private async requireSystem(input: {
    designSystemId: string;
    organizationId: string;
    actorType: ActorType;
    actorId: string;
  }) {
    await prisma.$transaction((tx) =>
      assertActorOrgAccess(tx, input.organizationId, input.actorType, input.actorId),
    );
    return prisma.designSystem.findFirstOrThrow({
      where: { id: input.designSystemId, organizationId: input.organizationId },
      include: DESIGN_SYSTEM_INCLUDE,
    });
  }
}

export const designSystemService = new DesignSystemService();
