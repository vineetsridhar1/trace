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
import { sessionService } from "./session.js";

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

function jsonObject(value: Prisma.JsonValue | null): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function escapeCssValue(value: unknown): string {
  return String(value).replaceAll("\\", "\\\\").replaceAll("\n", " ").replaceAll(";", "");
}

function patchRootCssVariables(html: string, tokens: Record<string, unknown>): string {
  const declarations = Object.entries(tokens)
    .filter(([key]) => /^--[a-zA-Z0-9-_]+$/.test(key))
    .map(([key, value]) => `      ${key}: ${escapeCssValue(value)};`)
    .join("\n");
  if (!declarations) return html;

  const nextRoot = `:root {\n${declarations}\n    }`;
  if (/:root\s*\{[\s\S]*?\}/.test(html)) {
    return html.replace(/:root\s*\{[\s\S]*?\}/, nextRoot);
  }
  return html.replace("</style>", `${nextRoot}\n  </style>`);
}

async function getDesignArtifactForWrite(
  artifactId: string,
  organizationId: string,
  userId: string,
) {
  const artifact = await prisma.artifact.findFirst({
    where: { id: artifactId, organizationId },
    include: {
      createdBy: true,
      sessionGroup: {
        select: {
          id: true,
          kind: true,
          channelId: true,
          organizationId: true,
          sessions: {
            select: { id: true },
            orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
            take: 1,
          },
        },
      },
    },
  });

  if (!artifact) {
    throw new Error("Artifact not found");
  }
  await assertSessionGroupAccess(artifact.sessionGroupId, userId, organizationId);
  if (artifact.sessionGroup.kind !== "design") {
    throw new ValidationError("Design artifact operations require a design session.");
  }
  const sessionId = artifact.sessionGroup.sessions[0]?.id;
  if (!sessionId) {
    throw new ValidationError("Design session group has no session timeline.");
  }
  return { artifact, sessionId };
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

  async iterateDesignArtifact(input: {
    artifactId: string;
    organizationId: string;
    actorId: string;
    actorType?: ActorType;
    prompt: string;
    html?: string | null;
  }) {
    const { artifact: parent, sessionId } = await getDesignArtifactForWrite(
      input.artifactId,
      input.organizationId,
      input.actorId,
    );

    const title = input.prompt.trim().slice(0, 120) || parent.title;
    const artifact = await prisma.artifact.create({
      data: {
        sessionGroupId: parent.sessionGroupId,
        organizationId: input.organizationId,
        parentArtifactId: parent.id,
        createdById: input.actorId,
        prompt: input.prompt,
        title,
        contentType: DESIGN_ARTIFACT_CONTENT_TYPE,
        html: input.html ?? buildPlaceholderDesignArtifactHtml(input.prompt),
        metadata: {
          ...jsonObject(parent.metadata),
          generator: input.html ? "provided" : "placeholder",
          source: "iterateDesignArtifact",
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
        sessionGroupId: parent.sessionGroupId,
        parentArtifactId: parent.id,
      } as Prisma.InputJsonValue,
      actorType: input.actorType ?? "user",
      actorId: input.actorId,
    });

    return artifact;
  },

  async patchDesignArtifactTokens(input: {
    artifactId: string;
    organizationId: string;
    actorId: string;
    actorType?: ActorType;
    tokens: Record<string, unknown>;
  }) {
    const { artifact: parent, sessionId } = await getDesignArtifactForWrite(
      input.artifactId,
      input.organizationId,
      input.actorId,
    );
    const html = patchRootCssVariables(parent.html, input.tokens);

    const artifact = await prisma.artifact.create({
      data: {
        sessionGroupId: parent.sessionGroupId,
        organizationId: input.organizationId,
        parentArtifactId: parent.id,
        createdById: input.actorId,
        prompt: parent.prompt,
        title: `${parent.title} tweak`.slice(0, 120),
        contentType: DESIGN_ARTIFACT_CONTENT_TYPE,
        html,
        metadata: {
          ...jsonObject(parent.metadata),
          source: "patchDesignArtifactTokens",
          patchedTokens: input.tokens as Prisma.InputJsonValue,
        } as Prisma.InputJsonValue,
      },
      include: { createdBy: true },
    });
    const serialized = serializeArtifact(artifact);

    await eventService.create({
      organizationId: input.organizationId,
      scopeType: "session",
      scopeId: sessionId,
      eventType: "design_artifact_updated",
      payload: {
        artifact: serialized,
        sessionGroupId: parent.sessionGroupId,
        parentArtifactId: parent.id,
        tokens: input.tokens as Prisma.InputJsonValue,
      } as Prisma.InputJsonValue,
      actorType: input.actorType ?? "user",
      actorId: input.actorId,
    });

    return artifact;
  },

  async publishDesignArtifact(input: {
    artifactId: string;
    organizationId: string;
    actorId: string;
    actorType?: ActorType;
  }) {
    const { artifact: existing, sessionId } = await getDesignArtifactForWrite(
      input.artifactId,
      input.organizationId,
      input.actorId,
    );
    const artifact = await prisma.artifact.update({
      where: { id: existing.id },
      data: {
        publishedAt: existing.publishedAt ?? new Date(),
        metadata: {
          ...jsonObject(existing.metadata),
          published: true,
        },
      },
      include: { createdBy: true },
    });
    const serialized = serializeArtifact(artifact);

    await eventService.create({
      organizationId: input.organizationId,
      scopeType: "session",
      scopeId: sessionId,
      eventType: "design_artifact_updated",
      payload: {
        artifact: serialized,
        sessionGroupId: artifact.sessionGroupId,
        published: true,
      } as Prisma.InputJsonValue,
      actorType: input.actorType ?? "user",
      actorId: input.actorId,
    });

    return artifact;
  },

  async exportDesignArtifactPdf(input: {
    artifactId: string;
    organizationId: string;
    actorId: string;
    actorType?: ActorType;
  }) {
    const { artifact, sessionId } = await getDesignArtifactForWrite(
      input.artifactId,
      input.organizationId,
      input.actorId,
    );

    return eventService.create({
      organizationId: input.organizationId,
      scopeType: "session",
      scopeId: sessionId,
      eventType: "design_export_completed",
      payload: {
        artifactId: artifact.id,
        sessionGroupId: artifact.sessionGroupId,
        exportType: "pdf",
        status: "completed",
        fileName: `${artifact.title || "design"}.pdf`,
        note: "PDF render-pool handoff recorded; renderer worker stores the binary in the upload pipeline.",
      } as Prisma.InputJsonValue,
      actorType: input.actorType ?? "user",
      actorId: input.actorId,
    });
  },

  async promoteDesignArtifactToCodingSession(input: {
    artifactId: string;
    organizationId: string;
    actorId: string;
    actorType?: ActorType;
    prompt?: string | null;
  }) {
    const { artifact, sessionId } = await getDesignArtifactForWrite(
      input.artifactId,
      input.organizationId,
      input.actorId,
    );
    const brief = [
      input.prompt?.trim() || "Implement this design artifact in the product codebase.",
      "",
      `Artifact: ${artifact.title}`,
      artifact.prompt ? `Original design brief: ${artifact.prompt}` : null,
      "",
      "Use the HTML below as the visual reference. Preserve the layout, interaction intent, typography, spacing, and token structure where it fits the target product.",
      "",
      "```html",
      artifact.html,
      "```",
    ]
      .filter((part): part is string => part !== null)
      .join("\n");

    const promotedSession = await sessionService.start({
      organizationId: input.organizationId,
      createdById: input.actorId,
      actorType: input.actorType ?? "user",
      kind: "coding",
      channelId: artifact.sessionGroup.channelId ?? undefined,
      prompt: brief,
      forkedFromSessionGroupId: artifact.sessionGroupId,
      deferRuntimeSelection: true,
      name: `Implement ${artifact.title}`.slice(0, 80),
    });

    await eventService.create({
      organizationId: input.organizationId,
      scopeType: "session",
      scopeId: sessionId,
      eventType: "design_artifact_promoted",
      payload: {
        artifactId: artifact.id,
        sessionGroupId: artifact.sessionGroupId,
        promotedSessionId: promotedSession.id,
        promotedSessionGroupId: promotedSession.sessionGroupId,
      } as Prisma.InputJsonValue,
      actorType: input.actorType ?? "user",
      actorId: input.actorId,
    });

    return promotedSession;
  },
};
