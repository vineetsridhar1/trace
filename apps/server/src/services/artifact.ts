import { Prisma, type Artifact, type Session } from "@prisma/client";
import { randomUUID } from "crypto";
import { prisma } from "../lib/db.js";
import { storage } from "../lib/storage/index.js";
import { eventService } from "./event.js";
import { TRACE_AI_USER_ID } from "../lib/ai-user.js";
import { ValidationError } from "../lib/errors.js";
import { canViewSessionGroup } from "./access.js";
import { parseArtifactArchive, type ArtifactBundleManifest } from "../lib/artifact-bundle.js";
import { validatePlanHtml } from "../lib/plan-html.js";
import { sessionService } from "./session.js";

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
    visualPlanHtmlPath(manifest);
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

export function visualPlanHtmlPath(manifest: ArtifactBundleManifest): string {
  const htmlFiles = manifest.files.filter((file) => file.mediaType === "text/html");
  if (htmlFiles.length === 0) {
    throw new ValidationError("Visual plan artifacts require one HTML file");
  }
  if (htmlFiles.length > 1) {
    throw new ValidationError("Visual plan artifacts contain more than one HTML file");
  }
  return htmlFiles[0].path;
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
      const planPath = visualPlanHtmlPath(parsed.manifest);
      const plan = parsed.files.get(planPath);
      if (!plan) throw new ValidationError("Visual plan HTML could not be read from the bundle");
      validatePlanHtml(plan.toString("utf8"));
    }
    const artifactId = randomUUID();
    const storageKey = `artifacts/${input.organizationId}/${artifactId}.tar.gz`;
    await storage.putObject(storageKey, input.archive, "application/gzip", { ifAbsent: true });

    const eventId = randomUUID();
    let result: {
      artifact: Artifact;
      event: Awaited<ReturnType<typeof eventService.create>>;
      inboxEvent: Awaited<ReturnType<typeof eventService.create>> | null;
    };
    try {
      result = await prisma.$transaction(async (tx) => {
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
    } catch (error) {
      await storage.deleteObject(storageKey).catch(() => undefined);
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const replayAfterRace = await prisma.artifact.findUnique({
          where: { idempotencyKey: input.idempotencyKey },
        });
        if (
          replayAfterRace &&
          replayAfterRace.organizationId === input.organizationId &&
          replayAfterRace.sessionId === input.sessionId &&
          replayAfterRace.type === type &&
          replayAfterRace.key === input.key
        ) {
          return replayAfterRace;
        }
      }
      throw error;
    }

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
    action: "NEW_SESSION" | "KEEP_CONTEXT";
    prompt: string;
    clientSource?: string | null;
  }): Promise<{ artifact: Artifact; implementationSession: Session }> {
    const prompt = input.prompt.trim();
    if (!prompt || prompt.length > 1024 * 1024) {
      throw new ValidationError("Artifact approval prompt must be between 1 byte and 1 MiB");
    }
    const artifact = await prisma.artifact.findFirstOrThrow({
      where: { id: input.artifactId, organizationId: input.organizationId },
      include: {
        session: {
          select: {
            id: true,
            tool: true,
            model: true,
            reasoningEffort: true,
            channelId: true,
            repoId: true,
            branch: true,
            sessionGroupId: true,
            sessionGroup: { select: { visibility: true, ownerUserId: true, kind: true } },
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

    if (artifact.approvalStatus === "approved" && artifact.implementationSessionId) {
      const implementationSession = await prisma.session.findUniqueOrThrow({
        where: { id: artifact.implementationSessionId },
      });
      return { artifact, implementationSession };
    }
    const claim = await prisma.artifact.updateMany({
      where: { id: artifact.id, approvalStatus: "pending" },
      data: { approvalStatus: "processing", approvalAction: input.action },
    });
    if (claim.count !== 1) {
      throw new ValidationError("This plan approval is already being processed");
    }

    try {
      let implementationSession: Session;
      if (input.action === "KEEP_CONTEXT") {
        await sessionService.sendMessage({
          sessionId: artifact.sessionId,
          text: prompt,
          actorType: "user",
          actorId: input.actorId,
          clientMutationId: `artifact-approval:${artifact.id}`,
          clientSource: input.clientSource,
        });
        implementationSession = await prisma.session.findUniqueOrThrow({
          where: { id: artifact.sessionId },
        });
      } else {
        const source = artifact.session;
        implementationSession = await sessionService.start({
          organizationId: artifact.organizationId,
          createdById: input.actorId,
          actorType: "user",
          clientSource: input.clientSource,
          tool: source.tool,
          model: source.model,
          reasoningEffort: source.reasoningEffort,
          channelId: source.channelId,
          repoId: source.repoId,
          branch: source.branch,
          sessionGroupId: source.sessionGroupId,
          sourceSessionId:
            !source.sessionGroup || source.sessionGroup.kind === "coding" ? source.id : undefined,
          allowVisibleSourceSession: true,
          prompt,
        });
        await sessionService.run(implementationSession.id, prompt, undefined, {
          userId: input.actorId,
          organizationId: artifact.organizationId,
          clientSource: input.clientSource,
        });
        await sessionService.terminate(artifact.sessionId, "user", input.actorId);
      }

      const approvedAt = new Date();
      const result = await prisma.$transaction(async (tx) => {
        const approved = await tx.artifact.update({
          where: { id: artifact.id },
          data: {
            approvalStatus: "approved",
            approvalAction: input.action,
            approvedAt,
            approvedById: input.actorId,
            implementationSessionId: implementationSession.id,
          },
        });
        const event = await eventService.create(
          {
            organizationId: artifact.organizationId,
            scopeType: "session",
            scopeId: artifact.sessionId,
            eventType: "artifact_approved",
            payload: {
              artifactId: artifact.id,
              bundleDigest: artifact.bundleDigest,
              action: input.action,
              implementationSessionId: implementationSession.id,
            },
            actorType: "user",
            actorId: input.actorId,
            deferPublish: true,
          },
          tx,
        );
        return { approved, event };
      });
      eventService.publishCreated(result.event);
      return { artifact: result.approved, implementationSession };
    } catch (error) {
      await prisma.artifact.updateMany({
        where: { id: artifact.id, approvalStatus: "processing" },
        data: { approvalStatus: "pending", approvalAction: null },
      });
      throw error;
    }
  }
}

export const artifactService = new ArtifactService();
