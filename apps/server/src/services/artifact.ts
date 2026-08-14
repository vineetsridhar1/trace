import { Prisma, type Artifact } from "@prisma/client";
import { randomUUID } from "crypto";
import { prisma } from "../lib/db.js";
import { storage } from "../lib/storage/index.js";
import { eventService } from "./event.js";
import { TRACE_AI_USER_ID } from "../lib/ai-user.js";
import { ValidationError } from "../lib/errors.js";
import { canViewSessionGroup } from "./access.js";
import { parseArtifactArchive, type ArtifactBundleManifest } from "../lib/artifact-bundle.js";

const TYPE_ALIASES: Record<string, string> = {
  image: "trace.image.v1",
  video: "trace.video.v1",
  document: "trace.document.v1",
  "file-bundle": "trace.file-bundle.v1",
};
const SUPPORTED_TYPES = new Set([
  "trace.image.v1",
  "trace.video.v1",
  "trace.document.v1",
  "trace.file-bundle.v1",
]);
const KEY_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/;

function normalizeType(input: string): string {
  const type = TYPE_ALIASES[input] ?? input;
  if (!SUPPORTED_TYPES.has(type)) throw new ValidationError(`Unsupported artifact type: ${input}`);
  return type;
}

export function validateType(type: string, manifest: ArtifactBundleManifest): void {
  const matchingFiles = manifest.files.filter((file) =>
    type === "trace.image.v1"
      ? file.mediaType.startsWith("image/")
      : type === "trace.video.v1"
        ? file.mediaType.startsWith("video/")
        : true,
  );
  if (matchingFiles.length === 0) {
    throw new ValidationError(
      type === "trace.image.v1"
        ? "Image artifacts require an image file"
        : "Video artifacts require a video file",
    );
  }
  if ((type === "trace.image.v1" || type === "trace.video.v1") && manifest.files.length !== 1) {
    throw new ValidationError("Media artifacts require exactly one file");
  }
}

export class ArtifactService {
  async create(input: {
    organizationId: string;
    sessionId: string;
    invocationId: string;
    type: string;
    key: string;
    idempotencyKey: string;
    archive: Buffer;
  }): Promise<Artifact> {
    const type = normalizeType(input.type);
    if (!KEY_PATTERN.test(input.key)) throw new ValidationError("Invalid artifact key");
    if (!input.idempotencyKey || input.idempotencyKey.length > 200) {
      throw new ValidationError("Invalid idempotency key");
    }

    const session = await prisma.session.findFirst({
      where: {
        id: input.sessionId,
        organizationId: input.organizationId,
        activeInvocationId: input.invocationId,
      },
      select: { id: true },
    });
    if (!session) throw new ValidationError("The artifact invocation is no longer active");

    const replay = await prisma.artifact.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (replay) {
      if (
        replay.organizationId !== input.organizationId ||
        replay.sessionId !== input.sessionId ||
        replay.type !== type ||
        replay.key !== input.key
      ) {
        throw new ValidationError("Idempotency key was already used for another artifact");
      }
      return replay;
    }

    const parsed = await parseArtifactArchive(input.archive);
    validateType(type, parsed.manifest);
    const artifactId = randomUUID();
    const storageKey = `artifacts/${input.organizationId}/${artifactId}.tar.gz`;
    await storage.putObject(storageKey, input.archive, "application/gzip", { ifAbsent: true });

    try {
      const result = await prisma.$transaction(async (tx) => {
        const artifact = await tx.artifact.create({
          data: {
            id: artifactId,
            organizationId: input.organizationId,
            sessionId: input.sessionId,
            type,
            key: input.key,
            bundleDigest: parsed.bundleDigest,
            manifest: parsed.manifest as unknown as Prisma.InputJsonValue,
            storageKey,
            byteSize: input.archive.length,
            createdById: TRACE_AI_USER_ID,
            idempotencyKey: input.idempotencyKey,
          },
        });
        const event = await eventService.create(
          {
            organizationId: input.organizationId,
            scopeType: "session",
            scopeId: input.sessionId,
            eventType: "artifact_created",
            payload: { artifact } as unknown as Prisma.InputJsonValue,
            actorType: "agent",
            actorId: TRACE_AI_USER_ID,
            deferPublish: true,
          },
          tx,
        );
        return { artifact, event };
      });
      eventService.publishCreated(result.event);
      return result.artifact;
    } catch (error) {
      await storage.deleteObject(storageKey).catch(() => undefined);
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const raced = await prisma.artifact.findUnique({
          where: { idempotencyKey: input.idempotencyKey },
        });
        if (
          raced &&
          raced.organizationId === input.organizationId &&
          raced.sessionId === input.sessionId &&
          raced.type === type &&
          raced.key === input.key
        ) {
          return raced;
        }
      }
      throw error;
    }
  }

  async list(input: {
    organizationId: string;
    sessionId: string;
    type?: string;
    key?: string;
  }): Promise<Artifact[]> {
    return prisma.artifact.findMany({
      where: {
        organizationId: input.organizationId,
        sessionId: input.sessionId,
        ...(input.type ? { type: normalizeType(input.type) } : {}),
        ...(input.key ? { key: input.key } : {}),
      },
      orderBy: { createdAt: "asc" },
    });
  }

  async listForSessionGroup(input: {
    organizationId: string;
    sessionGroupId: string;
    userId: string;
    type?: string;
    key?: string;
  }): Promise<Artifact[]> {
    const group = await prisma.sessionGroup.findFirst({
      where: { id: input.sessionGroupId, organizationId: input.organizationId },
      select: { visibility: true, ownerUserId: true },
    });
    if (!group || !canViewSessionGroup(group, input.userId)) {
      throw new ValidationError("Session group is not accessible");
    }
    return prisma.artifact.findMany({
      where: {
        organizationId: input.organizationId,
        session: { sessionGroupId: input.sessionGroupId },
        ...(input.type ? { type: normalizeType(input.type) } : {}),
        ...(input.key ? { key: input.key } : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
  }
}

export const artifactService = new ArtifactService();
