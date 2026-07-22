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
import {
  createDesignSystemStaticPreview,
  designSystemStaticPreviewStorageKey,
} from "../lib/design-system-static-preview.js";
import { assertActorOrgAccess, assertActorOrgAdmin } from "./actor-auth.js";
import { eventService } from "./event.js";
import { sessionService } from "./session.js";

const ARTIFACT_BATCH_SIZE = 100;
const DESIGN_SYSTEM_REPAIR_SOURCE = "internal:design-system-repair";
const MAX_REPAIR_ATTEMPTS = 3;

export function shouldAdvanceLatestArtifact(
  currentSequence: number | null,
  candidateSequence: number,
): boolean {
  return currentSequence === null || candidateSequence > currentSequence;
}

export function shouldAutoPublishArtifact(input: {
  packageValid: boolean;
  artifactId: string;
  artifactCommitSha: string;
  latestCommitArtifactId: string | null;
  latestPushedCommitSha: string | null;
}): boolean {
  return (
    input.packageValid &&
    input.latestCommitArtifactId === input.artifactId &&
    input.latestPushedCommitSha === input.artifactCommitSha
  );
}

function eventJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(
    JSON.stringify(value, (_key, nested) => (typeof nested === "bigint" ? Number(nested) : nested)),
  ) as Prisma.InputJsonValue;
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

async function putImmutableObject(
  key: string,
  body: Buffer,
  contentType = "application/gzip",
): Promise<void> {
  try {
    await storage.putObject(key, body, contentType, { ifAbsent: true });
  } catch (uploadError) {
    const existing = await storage.getObject(key).catch(() => null);
    if (!existing) throw uploadError;
    if (sha256(existing) !== sha256(body))
      throw new Error("Immutable storage key already contains different content");
  }
}

export class DesignSystemService {
  async requestArtifactRepair(input: {
    artifactId: string;
    designSystemId: string;
    organizationId: string;
    sessionGroupId: string;
    commitSha: string;
    errors: string[];
  }): Promise<void> {
    const repairState = await prisma.designSystem.findUnique({
      where: { id: input.designSystemId },
      select: { repairAttempts: true },
    });
    const artifact = await prisma.designSystemCommitArtifact.findUnique({
      where: { id: input.artifactId },
      select: { repairRequestedAt: true },
    });
    if (!repairState || artifact?.repairRequestedAt) return;
    if (repairState.repairAttempts >= MAX_REPAIR_ATTEMPTS) {
      console.warn("[design-system] repair attempt limit reached", {
        designSystemId: input.designSystemId,
        artifactId: input.artifactId,
        commitSha: input.commitSha,
        errors: input.errors,
      });
      return;
    }

    const claimed = await prisma.$transaction(async (tx) => {
      const incremented = await tx.designSystem.updateMany({
        where: { id: input.designSystemId, repairAttempts: { lt: MAX_REPAIR_ATTEMPTS } },
        data: { repairAttempts: { increment: 1 } },
      });
      if (incremented.count === 0) return false;
      const marked = await tx.designSystemCommitArtifact.updateMany({
        where: { id: input.artifactId, repairRequestedAt: null },
        data: { repairRequestedAt: new Date() },
      });
      if (marked.count === 1) return true;
      await tx.designSystem.updateMany({
        where: { id: input.designSystemId, repairAttempts: { gt: 0 } },
        data: { repairAttempts: { decrement: 1 } },
      });
      return false;
    });
    if (!claimed) {
      console.warn("[design-system] repair attempt was already claimed", {
        designSystemId: input.designSystemId,
        artifactId: input.artifactId,
      });
      return;
    }

    let queueResult: Awaited<ReturnType<typeof sessionService.queueInternalMessage>>;
    try {
      queueResult = await sessionService.queueInternalMessage({
        sessionGroupId: input.sessionGroupId,
        organizationId: input.organizationId,
        clientSource: DESIGN_SYSTEM_REPAIR_SOURCE,
        text: [
          "The latest design-system commit failed the server package validator.",
          `Commit: ${input.commitSha}`,
          "Repair the package in the managed workbench, then run the design-system checks, commit the fix, and push it.",
          "Do not wait for user input; this is an automatic repair pass.",
          "Validation errors:",
          ...input.errors.slice(0, 20).map((error) => `- ${error.slice(0, 500)}`),
        ].join("\n"),
      });
    } catch (error) {
      await this.releaseArtifactRepairClaim(input.artifactId, input.designSystemId);
      throw error;
    }
    if (queueResult !== "queued") {
      await this.releaseArtifactRepairClaim(input.artifactId, input.designSystemId);
      console.warn(`[design-system] repair skipped: ${queueResult.replaceAll("_", " ")}`, {
        designSystemId: input.designSystemId,
        artifactId: input.artifactId,
      });
      return;
    }
    console.info("[design-system] repair prompt queued", {
      designSystemId: input.designSystemId,
      artifactId: input.artifactId,
      commitSha: input.commitSha,
      errorCount: input.errors.length,
    });
  }

  private async releaseArtifactRepairClaim(
    artifactId: string,
    designSystemId: string,
  ): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const released = await tx.designSystemCommitArtifact.updateMany({
        where: { id: artifactId, repairRequestedAt: { not: null } },
        data: { repairRequestedAt: null },
      });
      if (released.count === 0) return;
      await tx.designSystem.updateMany({
        where: { id: designSystemId, repairAttempts: { gt: 0 } },
        data: { repairAttempts: { decrement: 1 } },
      });
    });
  }

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
    const invalidSaved = await prisma.designSystemCommitArtifact.findMany({
      where: { status: "saved", packageValid: false },
      orderBy: [{ designSystemId: "asc" }, { sequence: "desc" }],
      take: 100,
      select: { id: true },
    });
    let revalidated = 0;
    for (const artifact of invalidSaved) {
      try {
        if (await this.revalidateSavedArtifact(artifact.id)) revalidated += 1;
      } catch (error) {
        console.warn("[design-system] saved artifact revalidation failed", {
          artifactId: artifact.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    const missingPreviews = await prisma.designSystem.findMany({
      where: {
        latestCommitArtifact: { status: "saved", packageValid: true },
        authoringSessionGroup: { designPreviewKey: null },
      },
      select: {
        id: true,
        organizationId: true,
        authoringSessionGroupId: true,
        latestCommitArtifact: {
          select: { id: true, commitSha: true, storageKey: true },
        },
      },
      take: 100,
    });
    for (const system of missingPreviews) {
      const artifact = system.latestCommitArtifact;
      if (!artifact) continue;
      await this.persistSavedArtifactPreview({
        organizationId: system.organizationId,
        designSystemId: system.id,
        sessionGroupId: system.authoringSessionGroupId,
        artifactId: artifact.id,
        commitSha: artifact.commitSha,
        artifactStorageKey: artifact.storageKey,
      }).catch((error: unknown) => {
        console.warn("[design-system] static preview reconciliation failed", {
          designSystemId: system.id,
          artifactId: artifact.id,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }
    return pending.length + revalidated + missingPreviews.length;
  }

  private async revalidateSavedArtifact(artifactId: string): Promise<boolean> {
    const artifact = await prisma.designSystemCommitArtifact.findUniqueOrThrow({
      where: { id: artifactId },
      include: { designSystem: true },
    });
    if (artifact.status !== "saved" || artifact.packageValid !== false) return false;
    const stored = await storage.getObject(artifact.storageKey);
    const workbench = await parseDesignSystemTarGz(stored);
    const validation = validateWorkbenchPackage(workbench.files);
    if (!validation.valid) return false;
    const packageArchive = await createDeterministicTarGz(packageArchiveFiles(workbench.files));
    const row = await prisma.designSystemCommitArtifact.update({
      where: { id: artifact.id },
      data: {
        packageValid: true,
        packageDigest: sha256(packageArchive),
        validationSummary: eventJson(validation),
      },
    });
    const designSystem = await prisma.designSystem.update({
      where: { id: artifact.designSystemId },
      data: { repairAttempts: 0 },
      include: DESIGN_SYSTEM_INCLUDE,
    });
    await eventService.create({
      organizationId: artifact.designSystem.organizationId,
      scopeType: "system",
      scopeId: artifact.designSystemId,
      eventType: "design_system_commit_artifact_updated",
      payload: eventJson({ designSystem, designSystemCommitArtifact: row }),
      actorType: "system",
      actorId: "system",
    });
    if (
      shouldAutoPublishArtifact({
        packageValid: true,
        artifactId: row.id,
        artifactCommitSha: row.commitSha,
        latestCommitArtifactId: designSystem.latestCommitArtifactId,
        latestPushedCommitSha: designSystem.latestPushedCommitSha,
      })
    ) {
      await this.save({
        id: artifact.designSystemId,
        organizationId: artifact.designSystem.organizationId,
        actorType: "system",
        actorId: "system",
      }).catch((error: unknown) => {
        console.warn("[design-system] revalidated artifact publication failed", {
          designSystemId: artifact.designSystemId,
          artifactId: artifact.id,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }
    return true;
  }

  private async persistSavedArtifactPreview(input: {
    organizationId: string;
    designSystemId: string;
    sessionGroupId: string;
    artifactId: string;
    commitSha: string;
    artifactStorageKey: string;
  }): Promise<void> {
    const stored = await storage.getObject(input.artifactStorageKey);
    const workbench = await parseDesignSystemTarGz(stored);
    const preview = createDesignSystemStaticPreview(workbench.files);
    const previewKey = designSystemStaticPreviewStorageKey(
      input.organizationId,
      input.designSystemId,
      input.commitSha,
    );
    await putImmutableObject(previewKey, preview, "text/html; charset=utf-8");
    const updated = await prisma.sessionGroup.updateMany({
      where: {
        id: input.sessionGroupId,
        designPreviewKey: null,
        authoredDesignSystem: { latestCommitArtifactId: input.artifactId },
      },
      data: {
        designPreviewStatus: "captured",
        designPreviewKey: previewKey,
        designPreviewCommitSha: input.commitSha,
        designPreviewCapturedAt: new Date(),
      },
    });
    if (updated.count > 0) {
      await this.emitStaticPreviewUpdate(
        input.organizationId,
        input.sessionGroupId,
        input.commitSha,
      );
    }
  }

  private async emitStaticPreviewUpdate(
    organizationId: string,
    sessionGroupId: string,
    commitSha: string,
  ): Promise<void> {
    await eventService.create({
      organizationId,
      scopeType: "system",
      scopeId: sessionGroupId,
      eventType: "design_preview_updated",
      payload: {
        sessionGroupId,
        designPreviewStatus: "captured",
        designPreviewCommitSha: commitSha,
        designPreviewUrl: `/design-previews/groups/${encodeURIComponent(sessionGroupId)}`,
      },
      actorType: "system",
      actorId: "system",
    });
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
    const baseSlug = slugify(name);
    const existing = await prisma.designSystem.findUnique({
      where: { organizationId_slug: { organizationId: input.organizationId, slug: baseSlug } },
      include: DESIGN_SYSTEM_INCLUDE,
    });
    if (existing && !existing.archivedAt) {
      if (
        existing.sourceRepoId === repo.id &&
        existing.sourceBranch === branch &&
        existing.sourcePath === normalizedSourcePath
      ) {
        console.info("[design-system] resuming existing authoring session", {
          organizationId: input.organizationId,
          designSystemId: existing.id,
          sessionGroupId: existing.authoringSessionGroupId,
        });
        return existing;
      }
      throw new ValidationError(`A design system named "${name}" already exists`);
    }
    // Archived systems remain available for history, but their names should
    // be reusable. Keep the archived row and allocate a fresh unique slug.
    const slug = existing?.archivedAt ? `${baseSlug}-${randomUUID().slice(0, 8)}` : baseSlug;
    const id = randomUUID();
    let createdEvent: Awaited<ReturnType<typeof eventService.create>> | null = null;
    let session: Awaited<ReturnType<typeof sessionService.start>>;
    try {
      session = await sessionService.start({
        organizationId: input.organizationId,
        createdById: input.actorId,
        actorType: input.actorType,
        kind: "design_system",
        hosting: "cloud",
        environmentId: input.environmentId ?? undefined,
        name,
        visibility: "public",
        prompt: `Create the initial design system from the read-only source checkout. Source branch: ${branch}${normalizedSourcePath ? `; source path: ${normalizedSourcePath}` : ""}.`,
        afterCreate: async ({ tx, session: createdSession, sessionGroup }) => {
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
              payload: eventJson({
                designSystem,
                session: createdSession,
                sessionGroup,
              }),
              actorType: input.actorType,
              actorId: input.actorId,
              deferPublish: true,
            },
            tx,
          );
        },
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
        throw error;
      }
      const winner = await prisma.designSystem.findUnique({
        where: { organizationId_slug: { organizationId: input.organizationId, slug: baseSlug } },
        include: DESIGN_SYSTEM_INCLUDE,
      });
      if (
        winner &&
        !winner.archivedAt &&
        winner.sourceRepoId === repo.id &&
        winner.sourceBranch === branch &&
        winner.sourcePath === normalizedSourcePath
      ) {
        return winner;
      }
      throw new ValidationError(`A design system named "${name}" already exists`);
    }
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
    const archivedAt = new Date();
    const { designSystem: updated, sessionGroup } = await prisma.$transaction(async (tx) => {
      const archived = await tx.designSystem.update({
        where: { id: designSystem.id },
        data: { status: "archived", archivedAt },
        include: DESIGN_SYSTEM_INCLUDE,
      });
      const sessionGroup = await tx.sessionGroup.update({
        where: { id: designSystem.authoringSessionGroupId },
        data: { archivedAt },
        include: { sessions: true },
      });
      return { designSystem: archived, sessionGroup };
    });
    await eventService.create({
      organizationId: input.organizationId,
      scopeType: "system",
      scopeId: updated.id,
      eventType: "design_system_archived",
      payload: eventJson({ designSystem: updated, sessionGroup }),
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
      const preview = validation.valid ? createDesignSystemStaticPreview(workbench.files) : null;
      const previewKey = preview
        ? designSystemStaticPreviewStorageKey(
            artifact.designSystem.organizationId,
            artifact.designSystemId,
            artifact.commitSha,
          )
        : null;
      if (preview && previewKey) {
        await putImmutableObject(previewKey, preview, "text/html; charset=utf-8");
      }
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
        const designSystem = await tx.designSystem.update({
          where: { id: current.id },
          data: {
            ...(pointerIsNewer ? { latestCommitArtifactId: artifact.id } : {}),
            ...(current.latestPushedCommitSha === artifact.commitSha
              ? {
                  commitArtifactStatus: "saved",
                  commitArtifactError: null,
                  ...(validation.valid ? { repairAttempts: 0 } : {}),
                }
              : {}),
          },
          include: DESIGN_SYSTEM_INCLUDE,
        });
        const previewPublished = pointerIsNewer && previewKey !== null;
        if (previewPublished) {
          await tx.sessionGroup.update({
            where: { id: group.id },
            data: {
              designPreviewStatus: "captured",
              designPreviewKey: previewKey,
              designPreviewCommitSha: artifact.commitSha,
              designPreviewCapturedAt: new Date(),
            },
          });
        }
        return { row, designSystem, previewPublished };
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
      if (saved.previewPublished) {
        await this.emitStaticPreviewUpdate(
          artifact.designSystem.organizationId,
          group.id,
          artifact.commitSha,
        );
      }
      if (
        shouldAutoPublishArtifact({
          packageValid: validation.valid,
          artifactId: saved.row.id,
          artifactCommitSha: saved.row.commitSha,
          latestCommitArtifactId: saved.designSystem.latestCommitArtifactId,
          latestPushedCommitSha: saved.designSystem.latestPushedCommitSha,
        })
      ) {
        await this.save({
          id: artifact.designSystemId,
          organizationId: artifact.designSystem.organizationId,
          actorType: "system",
          actorId: "system",
        }).catch((error: unknown) => {
          console.warn("[design-system] automatic publication failed", {
            designSystemId: artifact.designSystemId,
            artifactId: artifact.id,
            commitSha: artifact.commitSha,
            error: error instanceof Error ? error.message : String(error),
          });
        });
      }
      if (!validation.valid) {
        setImmediate(() => {
          void this.requestArtifactRepair({
            artifactId: artifact.id,
            designSystemId: artifact.designSystemId,
            organizationId: artifact.designSystem.organizationId,
            sessionGroupId: group.id,
            commitSha: artifact.commitSha,
            errors: validation.errors,
          }).catch((error: unknown) => {
            console.warn("[design-system] automatic artifact repair request failed", {
              artifactId: artifact.id,
              error: error instanceof Error ? error.message : String(error),
            });
          });
        });
      }
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
    if (input.actorType === "user" && activeSession?.agentStatus === "active")
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
            createdById: input.actorType === "user" ? input.actorId : system.createdById,
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
