import { Prisma } from "@prisma/client";
import { prisma } from "../lib/db.js";
import { ValidationError } from "../lib/errors.js";
import { eventService } from "./event.js";
import { assertSessionGroupAccess } from "./access.js";
import type { ActorType } from "@trace/gql";
import {
  DESIGN_ARTIFACT_CONTENT_TYPE,
  buildPlaceholderDesignArtifactHtml,
} from "./design-artifact-html.js";

function serializeArtifact(artifact: {
  id: string;
  sessionGroupId: string;
  parentArtifactId: string | null;
  promptEventId: string | null;
  prompt: string | null;
  title: string;
  contentType: string;
  html: string;
  metadata: Prisma.JsonValue | null;
  publishedAt: Date | null;
  createdBy: unknown;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: artifact.id,
    sessionGroupId: artifact.sessionGroupId,
    parentArtifactId: artifact.parentArtifactId,
    promptEventId: artifact.promptEventId,
    prompt: artifact.prompt,
    title: artifact.title,
    contentType: artifact.contentType,
    html: artifact.html,
    metadata: artifact.metadata,
    publishedAt: artifact.publishedAt,
    createdBy: artifact.createdBy,
    createdAt: artifact.createdAt,
    updatedAt: artifact.updatedAt,
  };
}

export const artifactService = {
  async listForSessionGroup(sessionGroupId: string, organizationId: string, userId: string) {
    await assertSessionGroupAccess(sessionGroupId, userId, organizationId);

    return prisma.artifact.findMany({
      where: { sessionGroupId, organizationId },
      include: { createdBy: true },
      orderBy: [{ createdAt: "asc" }],
    });
  },

  async createDesignArtifact(input: {
    sessionGroupId: string;
    organizationId: string;
    actorId: string;
    actorType?: ActorType;
    prompt: string;
    html?: string | null;
  }) {
    await assertSessionGroupAccess(input.sessionGroupId, input.actorId, input.organizationId);

    const group = await prisma.sessionGroup.findFirst({
      where: { id: input.sessionGroupId, organizationId: input.organizationId },
      select: {
        id: true,
        kind: true,
        sessions: {
          select: { id: true },
          orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
          take: 1,
        },
      },
    });

    if (!group) {
      throw new Error("Session group not found");
    }
    if (group.kind !== "design") {
      throw new ValidationError("Artifacts can only be created for design sessions.");
    }

    const sessionId = group.sessions[0]?.id;
    if (!sessionId) {
      throw new ValidationError("Design session group has no session timeline.");
    }

    const title = input.prompt.trim().slice(0, 120) || "Untitled design";
    const artifact = await prisma.artifact.create({
      data: {
        sessionGroupId: input.sessionGroupId,
        organizationId: input.organizationId,
        createdById: input.actorId,
        prompt: input.prompt,
        title,
        contentType: DESIGN_ARTIFACT_CONTENT_TYPE,
        html: input.html ?? buildPlaceholderDesignArtifactHtml(input.prompt),
        metadata: {
          generator: input.html ? "provided" : "placeholder",
          source: "createDesignArtifact",
        },
      },
      include: { createdBy: true },
    });
    const serialized = serializeArtifact(artifact);

    await eventService.create({
      organizationId: input.organizationId,
      scopeType: "session",
      scopeId: sessionId,
      eventType: "design_artifact_created",
      payload: {
        artifact: serialized,
        sessionGroupId: input.sessionGroupId,
      } as Prisma.InputJsonValue,
      actorType: input.actorType ?? "user",
      actorId: input.actorId,
    });

    return artifact;
  },
};
