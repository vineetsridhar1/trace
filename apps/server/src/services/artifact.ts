import { Prisma, type Artifact } from "@prisma/client";
import { randomUUID } from "crypto";
import { prisma } from "../lib/db.js";
import { storage } from "../lib/storage/index.js";
import { eventService } from "./event.js";
import { TRACE_AI_USER_ID } from "../lib/ai-user.js";
import { ValidationError } from "../lib/errors.js";
import { canViewSessionGroup } from "./access.js";
import {
  parseArtifactArchive,
  readArtifactFile,
  type ArtifactBundleManifest,
} from "../lib/artifact-bundle.js";
import { validatePlanHtml } from "../lib/plan-html.js";

const TYPE_ALIASES: Record<string, string> = {
  "visual-plan": "trace.visual-plan.v1",
  image: "trace.image.v1",
  video: "trace.video.v1",
  document: "trace.document.v1",
  "file-bundle": "trace.file-bundle.v1",
};
const SUPPORTED_TYPES = new Set([
  "trace.visual-plan.v1",
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
  if (type === "trace.visual-plan.v1") {
    // A plan is one self-contained page: no sibling stylesheet, script, or image to go missing.
    if (!manifest.files.some((file) => file.path === "plan.html")) {
      throw new ValidationError("Visual plan artifacts require plan.html at the root");
    }
    const stray = manifest.files.find((file) => file.path !== "plan.html");
    if (stray) {
      throw new ValidationError(
        `Visual plans contain only plan.html, with everything inlined. Remove ${stray.path}`,
      );
    }
  }
  if (
    type === "trace.image.v1" &&
    !manifest.files.some((file) => file.mediaType.startsWith("image/"))
  ) {
    throw new ValidationError("Image artifacts require an image file");
  }
  if (
    type === "trace.video.v1" &&
    !manifest.files.some((file) => file.mediaType.startsWith("video/"))
  ) {
    throw new ValidationError("Video artifacts require a video file");
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

    const session = await prisma.session.findFirst({
      where: {
        id: input.sessionId,
        organizationId: input.organizationId,
        activeInvocationId: input.invocationId,
      },
      select: { id: true, name: true, createdById: true, sessionGroupId: true },
    });
    if (!session) throw new ValidationError("The artifact invocation is no longer active");

    const parsed = await parseArtifactArchive(input.archive);
    validateType(type, parsed.manifest);
    if (type === "trace.visual-plan.v1") {
      const plan = await readArtifactFile(input.archive, "plan.html");
      if (!plan) throw new ValidationError("plan.html could not be read from the bundle");
      validatePlanHtml(plan.toString("utf8"));
    }
    const artifactId = randomUUID();
    const storageKey = `artifacts/${input.organizationId}/${artifactId}.tar.gz`;
    await storage.putObject(storageKey, input.archive, "application/gzip", { ifAbsent: true });

    const eventId = randomUUID();
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

      let inboxEvent = null;
      if (type === "trace.visual-plan.v1") {
        await tx.session.update({
          where: { id: input.sessionId },
          data: { sessionStatus: "needs_input" },
        });
        const inboxItem = await tx.inboxItem.create({
          data: {
            organizationId: input.organizationId,
            userId: session.createdById,
            itemType: "plan",
            title: `Plan ready: ${session.name}`,
            sourceType: "session",
            sourceId: input.sessionId,
            payload: { artifactId: artifact.id },
          },
        });
        inboxEvent = await eventService.create(
          {
            organizationId: input.organizationId,
            scopeType: "system",
            scopeId: input.organizationId,
            eventType: "inbox_item_created",
            payload: { inboxItem },
            actorType: "system",
            actorId: "system",
            deferPublish: true,
          },
          tx,
        );
      }

      const event = await eventService.create(
        {
          id: eventId,
          organizationId: input.organizationId,
          scopeType: "session",
          scopeId: input.sessionId,
          eventType: "artifact_created",
          payload: {
            artifact,
            ...(type === "trace.visual-plan.v1"
              ? { sessionStatus: "needs_input", sessionId: input.sessionId }
              : {}),
          } as unknown as Prisma.InputJsonValue,
          actorType: "agent",
          actorId: TRACE_AI_USER_ID,
          deferPublish: true,
        },
        tx,
      );

      return { artifact, event, inboxEvent };
    });

    eventService.publishCreated(result.event);
    if (result.inboxEvent) eventService.publishCreated(result.inboxEvent);
    return result.artifact;
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

  async approve(input: {
    artifactId: string;
    organizationId: string;
    actorId: string;
  }): Promise<Artifact> {
    const artifact = await prisma.artifact.findFirstOrThrow({
      where: { id: input.artifactId, organizationId: input.organizationId },
      include: {
        session: {
          select: {
            sessionGroup: { select: { visibility: true, ownerUserId: true } },
          },
        },
      },
    });
    if (
      artifact.session.sessionGroup &&
      !canViewSessionGroup(artifact.session.sessionGroup, input.actorId)
    ) {
      throw new ValidationError("Artifact is not accessible");
    }
    if (artifact.type !== "trace.visual-plan.v1") {
      throw new ValidationError("Only visual plans can be approved");
    }
    const latest = await prisma.artifact.findFirst({
      where: {
        sessionId: artifact.sessionId,
        type: artifact.type,
        key: artifact.key,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { id: true },
    });
    if (latest?.id !== artifact.id) {
      throw new ValidationError("A newer plan artifact is available");
    }
    await eventService.create({
      organizationId: artifact.organizationId,
      scopeType: "session",
      scopeId: artifact.sessionId,
      eventType: "artifact_approved",
      payload: { artifactId: artifact.id, bundleDigest: artifact.bundleDigest },
      actorType: "user",
      actorId: input.actorId,
    });
    return artifact;
  }
}

export const artifactService = new ArtifactService();
