import { Prisma } from "@prisma/client";
import { randomUUID } from "crypto";
import { prisma } from "../lib/db.js";
import { ValidationError } from "../lib/errors.js";
import { eventService } from "./event.js";
import { assertSessionGroupAccess } from "./access.js";
import type { ActorType } from "@trace/gql";
import {
  DESIGN_ARTIFACT_CONTENT_TYPE,
  buildPlaceholderDesignArtifactHtml,
} from "./design-artifact-html.js";
import { designGenerationService } from "./design-generation.js";
import { buildDesignArtifactPublicUrl } from "./design-artifact-serving.js";
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
    publicUrl: buildDesignArtifactPublicUrl(artifact.id, artifact.publishedAt),
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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function patchRootCssVariables(html: string, tokens: Record<string, unknown>): string {
  const validTokens = Object.entries(tokens).filter(([key]) => /^--[a-zA-Z0-9-_]+$/.test(key));
  if (validTokens.length === 0) return html;

  const rootMatch = /:root\s*\{([\s\S]*?)\}/.exec(html);
  if (rootMatch) {
    const rootBlock = rootMatch[0];
    let body = rootMatch[1] ?? "";
    const existingIndentMatch = body.match(/\n(\s*)--[a-zA-Z0-9-_]+\s*:/);
    const indent = existingIndentMatch?.[1] ?? "      ";

    for (const [key, value] of validTokens) {
      const declaration = `${indent}${key}: ${escapeCssValue(value)};`;
      const declarationPattern = new RegExp(`(^|\\n)(\\s*)${escapeRegExp(key)}\\s*:[^;\\n]*(?:;)?`);
      if (declarationPattern.test(body)) {
        body = body.replace(declarationPattern, (_, prefix: string) => `${prefix}${declaration}`);
      } else {
        body = `${body.replace(/\s*$/, "")}\n${declaration}\n`;
      }
    }

    return html.replace(rootBlock, `:root {${body}}`);
  }

  const declarations = validTokens
    .map(([key, value]) => `      ${key}: ${escapeCssValue(value)};`)
    .join("\n");
  const nextRoot = `:root {\n${declarations}\n    }`;
  if (html.includes("</style>")) {
    return html.replace("</style>", `${nextRoot}\n  </style>`);
  }
  return `${html}\n<style>\n${nextRoot}\n</style>`;
}

function buildCommentIterationPrompt(input: {
  body: string;
  anchor?: Record<string, unknown> | null;
  originalPrompt?: string | null;
}) {
  return [
    "Apply this design review comment as the next artifact iteration.",
    "",
    `Comment: ${input.body}`,
    input.anchor ? `Anchor context: ${JSON.stringify(input.anchor)}` : null,
    input.originalPrompt ? `Original design brief: ${input.originalPrompt}` : null,
    "",
    "Return a complete updated HTML artifact that preserves the strongest parts of the current version while addressing the comment.",
  ]
    .filter((part): part is string => part !== null)
    .join("\n");
}

const DESIGN_DIRECTION_LABELS = [
  "Refined product direction",
  "Bold editorial direction",
  "Dense workflow direction",
  "Calm executive direction",
] as const;

function normalizeDirectionCount(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 3;
  return Math.min(Math.max(Math.floor(value), 1), 4);
}

function buildDirectionPrompt(prompt: string, index: number, count: number): string {
  if (count === 1) return prompt;
  const label = DESIGN_DIRECTION_LABELS[index] ?? `Direction ${index + 1}`;
  return [
    prompt,
    "",
    `Create variant ${index + 1} of ${count}: ${label}.`,
    "Make this direction meaningfully distinct while preserving the user brief and Trace design artifact requirements.",
  ].join("\n");
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
    promptEventId?: string | null;
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

    const generated = input.html
      ? null
      : await designGenerationService.generateHtml({
          organizationId: input.organizationId,
          actorId: input.actorId,
          actorType: input.actorType,
          sessionId,
          sessionGroupId: input.sessionGroupId,
          prompt: input.prompt,
        });
    const title = input.prompt.trim().slice(0, 120) || "Untitled design";
    const artifact = await prisma.artifact.create({
      data: {
        sessionGroupId: input.sessionGroupId,
        organizationId: input.organizationId,
        createdById: input.actorId,
        promptEventId: input.promptEventId ?? undefined,
        prompt: input.prompt,
        title,
        contentType: DESIGN_ARTIFACT_CONTENT_TYPE,
        html: input.html ?? generated?.html ?? buildPlaceholderDesignArtifactHtml(input.prompt),
        metadata: {
          ...(generated?.metadata ?? {}),
          generator: input.html ? "provided" : (generated?.metadata.generator ?? "placeholder"),
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

  async generateDesignArtifacts(input: {
    sessionGroupId: string;
    organizationId: string;
    actorId: string;
    actorType?: ActorType;
    prompt: string;
    directionCount?: number | null;
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
      throw new ValidationError("Artifacts can only be generated for design sessions.");
    }

    const sessionId = group.sessions[0]?.id;
    if (!sessionId) {
      throw new ValidationError("Design session group has no session timeline.");
    }

    const directionCount = normalizeDirectionCount(input.directionCount);
    const fanoutId = randomUUID();
    const results = await Promise.allSettled(
      Array.from({ length: directionCount }, (_, index) =>
        designGenerationService.generateHtml({
          organizationId: input.organizationId,
          actorId: input.actorId,
          actorType: input.actorType,
          sessionId,
          sessionGroupId: input.sessionGroupId,
          prompt: buildDirectionPrompt(input.prompt, index, directionCount),
        }),
      ),
    );

    const artifacts = [];
    for (const [index, result] of results.entries()) {
      if (result.status !== "fulfilled") continue;
      const label = DESIGN_DIRECTION_LABELS[index] ?? `Direction ${index + 1}`;
      const artifact = await prisma.artifact.create({
        data: {
          sessionGroupId: input.sessionGroupId,
          organizationId: input.organizationId,
          createdById: input.actorId,
          prompt: input.prompt,
          title: `${input.prompt.trim().slice(0, 96) || "Untitled design"} - ${label}`.slice(
            0,
            120,
          ),
          contentType: DESIGN_ARTIFACT_CONTENT_TYPE,
          html: result.value.html,
          metadata: {
            ...result.value.metadata,
            source: "generateDesignArtifacts",
            fanoutId,
            directionIndex: index,
            directionCount,
            directionLabel: label,
          },
        },
        include: { createdBy: true },
      });
      const serialized = serializeArtifact(artifact);
      artifacts.push(artifact);

      await eventService.create({
        organizationId: input.organizationId,
        scopeType: "session",
        scopeId: sessionId,
        eventType: "design_artifact_created",
        payload: {
          artifact: serialized,
          sessionGroupId: input.sessionGroupId,
          fanoutId,
          directionIndex: index,
          directionCount,
        } as Prisma.InputJsonValue,
        actorType: input.actorType ?? "user",
        actorId: input.actorId,
      });
    }

    if (artifacts.length === 0) {
      throw new Error("Design generation failed for every direction.");
    }

    return artifacts;
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

    const generated = input.html
      ? null
      : await designGenerationService.generateHtml({
          organizationId: input.organizationId,
          actorId: input.actorId,
          actorType: input.actorType,
          sessionId,
          sessionGroupId: parent.sessionGroupId,
          prompt: input.prompt,
          parentArtifactId: parent.id,
          parentHtml: parent.html,
        });
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
        html: input.html ?? generated?.html ?? buildPlaceholderDesignArtifactHtml(input.prompt),
        metadata: {
          ...jsonObject(parent.metadata),
          ...(generated?.metadata ?? {}),
          generator: input.html ? "provided" : (generated?.metadata.generator ?? "placeholder"),
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
      eventType: "design_export_requested",
      payload: {
        artifactId: artifact.id,
        sessionGroupId: artifact.sessionGroupId,
        exportType: "pdf",
        status: "requested",
        fileName: `${artifact.title || "design"}.pdf`,
        note: "PDF export requested. A render worker must emit design_export_completed with the stored file when rendering finishes.",
      } as Prisma.InputJsonValue,
      actorType: input.actorType ?? "user",
      actorId: input.actorId,
    });
  },

  async commentDesignArtifact(input: {
    artifactId: string;
    organizationId: string;
    actorId: string;
    actorType?: ActorType;
    body: string;
    anchor?: Record<string, unknown> | null;
    sendToAgent?: boolean | null;
  }) {
    const trimmedBody = input.body.trim();
    if (!trimmedBody) {
      throw new ValidationError("Comment body is required.");
    }
    const { artifact, sessionId } = await getDesignArtifactForWrite(
      input.artifactId,
      input.organizationId,
      input.actorId,
    );

    const commentEvent = await eventService.create({
      organizationId: input.organizationId,
      scopeType: "session",
      scopeId: sessionId,
      eventType: "design_comment_added",
      payload: {
        artifactId: artifact.id,
        sessionGroupId: artifact.sessionGroupId,
        parentArtifactId: artifact.parentArtifactId,
        body: trimmedBody,
        anchor: input.anchor ?? null,
        sendToAgent: input.sendToAgent ?? false,
      } as Prisma.InputJsonValue,
      actorType: input.actorType ?? "user",
      actorId: input.actorId,
    });

    if (input.sendToAgent) {
      await artifactService.iterateDesignArtifact({
        artifactId: artifact.id,
        organizationId: input.organizationId,
        actorId: input.actorId,
        actorType: input.actorType,
        prompt: buildCommentIterationPrompt({
          body: trimmedBody,
          anchor: input.anchor,
          originalPrompt: artifact.prompt,
        }),
      });
    }

    return commentEvent;
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
