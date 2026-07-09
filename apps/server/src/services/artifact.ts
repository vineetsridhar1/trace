import { Prisma } from "@prisma/client";
import { randomUUID } from "crypto";
import { prisma } from "../lib/db.js";
import { ValidationError } from "../lib/errors.js";
import { storage } from "../lib/storage/index.js";
import { eventService } from "./event.js";
import { assertSessionGroupAccess } from "./access.js";
import type { ActorType } from "@trace/gql";
import { DESIGN_ARTIFACT_CONTENT_TYPE } from "./design-artifact-html.js";
import {
  hydrateDesignArtifactHtml,
  resolveDesignArtifactHtml,
  storeDesignArtifactHtml,
} from "./design-artifact-storage.js";
import { designGenerationService } from "./design-generation.js";
import { buildDesignArtifactPublicUrl } from "./design-artifact-serving.js";
import {
  countPdfPages,
  designPdfRenderer,
  type DesignPdfPageOptions,
} from "./design-pdf-renderer.js";
import { sessionService } from "./session.js";

function serializeArtifact(artifact: {
  id: string;
  sessionGroupId: string;
  parentArtifactId: string | null;
  organizationId: string;
  promptEventId: string | null;
  prompt: string | null;
  title: string;
  contentType: string;
  html: string;
  htmlStorageKey?: string | null;
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
    organizationId: artifact.organizationId,
    promptEventId: artifact.promptEventId,
    prompt: artifact.prompt,
    title: artifact.title,
    contentType: artifact.contentType,
    html: artifact.html,
    htmlStorageKey: artifact.htmlStorageKey ?? null,
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

function sanitizeFilename(value: string): string {
  const sanitized = value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return sanitized || "design";
}

function normalizePdfPageOptions(
  value: DesignPdfPageOptions | null | undefined,
): DesignPdfPageOptions | null {
  if (!value) return null;
  const normalized: DesignPdfPageOptions = {};
  const assignDimension = (key: "widthPx" | "heightPx", raw: number | null | undefined) => {
    if (raw == null) return;
    if (!Number.isFinite(raw) || raw < 100 || raw > 10000) {
      throw new ValidationError("PDF page dimensions must be between 100 and 10000 pixels.");
    }
    normalized[key] = Math.floor(raw);
  };
  const assignMargin = (
    key: "marginTopPx" | "marginRightPx" | "marginBottomPx" | "marginLeftPx",
    raw: number | null | undefined,
  ) => {
    if (raw == null) return;
    if (!Number.isFinite(raw) || raw < 0 || raw > 1000) {
      throw new ValidationError("PDF page margins must be between 0 and 1000 pixels.");
    }
    normalized[key] = Math.floor(raw);
  };

  assignDimension("widthPx", value.widthPx);
  assignDimension("heightPx", value.heightPx);
  assignMargin("marginTopPx", value.marginTopPx);
  assignMargin("marginRightPx", value.marginRightPx);
  assignMargin("marginBottomPx", value.marginBottomPx);
  assignMargin("marginLeftPx", value.marginLeftPx);

  if (
    (normalized.widthPx == null && normalized.heightPx != null) ||
    (normalized.widthPx != null && normalized.heightPx == null)
  ) {
    throw new ValidationError("PDF page width and height must be provided together.");
  }

  return Object.keys(normalized).length > 0 ? normalized : null;
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
  return { artifact: await hydrateDesignArtifactHtml(artifact), sessionId };
}

async function getComparisonArtifactsForIteration(input: {
  artifactIds?: string[] | null;
  parentArtifactId: string;
  sessionGroupId: string;
  organizationId: string;
}) {
  const uniqueIds = [
    ...new Set((input.artifactIds ?? []).filter((id) => id !== input.parentArtifactId)),
  ];
  if (uniqueIds.length === 0) return [];

  const artifacts = await prisma.artifact.findMany({
    where: {
      id: { in: uniqueIds },
      organizationId: input.organizationId,
      sessionGroupId: input.sessionGroupId,
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  if (artifacts.length !== uniqueIds.length) {
    throw new ValidationError("Comparison artifacts must belong to the same design session.");
  }

  const hydrated = await Promise.all(
    artifacts.map((artifact) => hydrateDesignArtifactHtml(artifact)),
  );
  const artifactById = new Map(hydrated.map((artifact) => [artifact.id, artifact]));
  return uniqueIds.map((artifactId) => {
    const artifact = artifactById.get(artifactId);
    if (!artifact) {
      throw new ValidationError("Comparison artifacts must belong to the same design session.");
    }
    return {
      id: artifact.id,
      title: artifact.title,
      prompt: artifact.prompt,
      metadata: jsonObject(artifact.metadata),
      html: artifact.html,
    };
  });
}

async function createStoredArtifact(input: {
  id?: string;
  sessionGroupId: string;
  organizationId: string;
  parentArtifactId?: string | null;
  createdById: string;
  promptEventId?: string | null;
  prompt?: string | null;
  title: string;
  html: string;
  metadata: Prisma.InputJsonValue;
}) {
  const artifactId = input.id ?? randomUUID();
  const htmlStorageKey = await storeDesignArtifactHtml({
    organizationId: input.organizationId,
    artifactId,
    html: input.html,
  });
  const artifact = await prisma.artifact.create({
    data: {
      id: artifactId,
      sessionGroupId: input.sessionGroupId,
      organizationId: input.organizationId,
      parentArtifactId: input.parentArtifactId ?? undefined,
      createdById: input.createdById,
      promptEventId: input.promptEventId ?? undefined,
      prompt: input.prompt ?? null,
      title: input.title,
      contentType: DESIGN_ARTIFACT_CONTENT_TYPE,
      html: "",
      htmlStorageKey,
      metadata: input.metadata,
    },
    include: { createdBy: true },
  });
  return hydrateDesignArtifactHtml(artifact);
}

export const artifactService = {
  async listForSessionGroup(sessionGroupId: string, organizationId: string, userId: string) {
    await assertSessionGroupAccess(sessionGroupId, userId, organizationId);

    const artifacts = await prisma.artifact.findMany({
      where: { sessionGroupId, organizationId },
      include: { createdBy: true },
      orderBy: [{ createdAt: "asc" }],
    });
    return Promise.all(artifacts.map((artifact) => hydrateDesignArtifactHtml(artifact)));
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

    const providedHtml = input.html?.trim() ? input.html : null;
    const generated = providedHtml
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
    const artifactHtml = providedHtml ?? generated?.html;
    if (!artifactHtml) {
      throw new Error("Design generation did not return artifact HTML.");
    }
    const artifact = await createStoredArtifact({
      sessionGroupId: input.sessionGroupId,
      organizationId: input.organizationId,
      createdById: input.actorId,
      promptEventId: input.promptEventId ?? null,
      prompt: input.prompt,
      title,
      html: artifactHtml,
      metadata: {
        ...(generated?.metadata ?? {}),
        generator: providedHtml ? "provided" : (generated?.metadata.generator ?? "llm"),
        source: "createDesignArtifact",
      },
    });
    const hydratedArtifact = await hydrateDesignArtifactHtml(artifact);
    const serialized = serializeArtifact(hydratedArtifact);

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

    return hydratedArtifact;
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
      Array.from({ length: directionCount }, (_, index) => {
        const label = DESIGN_DIRECTION_LABELS[index] ?? `Direction ${index + 1}`;
        return designGenerationService.generateHtml({
          organizationId: input.organizationId,
          actorId: input.actorId,
          actorType: input.actorType,
          sessionId,
          sessionGroupId: input.sessionGroupId,
          prompt: buildDirectionPrompt(input.prompt, index, directionCount),
          generationId: `${fanoutId}:${index}`,
          directionIndex: index,
          directionCount,
          directionLabel: label,
        });
      }),
    );

    const artifacts = [];
    for (const [index, result] of results.entries()) {
      if (result.status !== "fulfilled") continue;
      const label = DESIGN_DIRECTION_LABELS[index] ?? `Direction ${index + 1}`;
      const artifact = await createStoredArtifact({
        sessionGroupId: input.sessionGroupId,
        organizationId: input.organizationId,
        createdById: input.actorId,
        prompt: input.prompt,
        title: `${input.prompt.trim().slice(0, 96) || "Untitled design"} - ${label}`.slice(0, 120),
        html: result.value.html,
        metadata: {
          ...result.value.metadata,
          source: "generateDesignArtifacts",
          fanoutId,
          directionIndex: index,
          directionCount,
          directionLabel: label,
        },
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
    elementAnchors?: Array<Record<string, unknown>> | null;
    comparisonArtifactIds?: string[] | null;
  }) {
    const { artifact: parent, sessionId } = await getDesignArtifactForWrite(
      input.artifactId,
      input.organizationId,
      input.actorId,
    );
    const comparisonArtifacts = await getComparisonArtifactsForIteration({
      artifactIds: input.comparisonArtifactIds,
      parentArtifactId: parent.id,
      sessionGroupId: parent.sessionGroupId,
      organizationId: input.organizationId,
    });

    const providedHtml = input.html?.trim() ? input.html : null;
    const generated = providedHtml
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
          elementAnchors: input.elementAnchors ?? null,
          comparisonArtifacts,
        });
    const title = input.prompt.trim().slice(0, 120) || parent.title;
    const artifactHtml = providedHtml ?? generated?.html;
    if (!artifactHtml) {
      throw new Error("Design generation did not return artifact HTML.");
    }
    const artifact = await createStoredArtifact({
      sessionGroupId: parent.sessionGroupId,
      organizationId: input.organizationId,
      parentArtifactId: parent.id,
      createdById: input.actorId,
      prompt: input.prompt,
      title,
      html: artifactHtml,
      metadata: {
        ...jsonObject(parent.metadata),
        ...(generated?.metadata ?? {}),
        generator: providedHtml ? "provided" : (generated?.metadata.generator ?? "llm"),
        source: "iterateDesignArtifact",
        comparisonArtifactIds: comparisonArtifacts.map((artifact) => artifact.id),
      },
    });
    const hydratedArtifact = await hydrateDesignArtifactHtml(artifact);
    const serialized = serializeArtifact(hydratedArtifact);

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

    return hydratedArtifact;
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

    const artifact = await createStoredArtifact({
      sessionGroupId: parent.sessionGroupId,
      organizationId: input.organizationId,
      parentArtifactId: parent.id,
      createdById: input.actorId,
      prompt: parent.prompt,
      title: `${parent.title} tweak`.slice(0, 120),
      html,
      metadata: {
        ...jsonObject(parent.metadata),
        source: "patchDesignArtifactTokens",
        patchedTokens: input.tokens as Prisma.InputJsonValue,
      } as Prisma.InputJsonValue,
    });
    const serialized = serializeArtifact(await hydrateDesignArtifactHtml(artifact));

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
    const hydratedArtifact = await hydrateDesignArtifactHtml(artifact);
    const serialized = serializeArtifact(hydratedArtifact);

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

    return hydratedArtifact;
  },

  async exportDesignArtifactPdf(input: {
    artifactId: string;
    organizationId: string;
    actorId: string;
    actorType?: ActorType;
    pageOptions?: DesignPdfPageOptions | null;
  }) {
    const { artifact, sessionId } = await getDesignArtifactForWrite(
      input.artifactId,
      input.organizationId,
      input.actorId,
    );
    const pageOptions = normalizePdfPageOptions(input.pageOptions);
    const fileName = `${sanitizeFilename(artifact.title || "design")}.pdf`;
    const fileKey = `uploads/${input.organizationId}/${randomUUID()}-${fileName}`;

    await eventService.create({
      organizationId: input.organizationId,
      scopeType: "session",
      scopeId: sessionId,
      eventType: "design_export_requested",
      payload: {
        artifactId: artifact.id,
        sessionGroupId: artifact.sessionGroupId,
        exportType: "pdf",
        status: "requested",
        fileName,
        ...(pageOptions ? { pageOptions } : {}),
      } as Prisma.InputJsonValue,
      actorType: input.actorType ?? "user",
      actorId: input.actorId,
    });

    try {
      const pdf = await designPdfRenderer.renderHtmlToPdf({
        html: await resolveDesignArtifactHtml(artifact),
        artifactId: artifact.id,
        pageOptions,
      });
      const pageCount = countPdfPages(pdf);
      await storage.putObject(fileKey, pdf, "application/pdf");
      const fileUrl = await storage.getGetUrl(fileKey, { downloadFilename: fileName });

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
          fileName,
          fileId: fileKey,
          fileKey,
          fileUrl,
          byteSize: pdf.byteLength,
          ...(pageCount !== null ? { pageCount } : {}),
          ...(pageOptions ? { pageOptions } : {}),
        } as Prisma.InputJsonValue,
        actorType: "system",
        actorId: "system",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await eventService.create({
        organizationId: input.organizationId,
        scopeType: "session",
        scopeId: sessionId,
        eventType: "design_export_completed",
        payload: {
          artifactId: artifact.id,
          sessionGroupId: artifact.sessionGroupId,
          exportType: "pdf",
          status: "failed",
          fileName,
          error: message,
          ...(pageOptions ? { pageOptions } : {}),
        } as Prisma.InputJsonValue,
        actorType: "system",
        actorId: "system",
      });
      throw error;
    }
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
        elementAnchors: input.anchor ? [input.anchor] : null,
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
    referenceArtifactIds?: string[] | null;
  }) {
    const { artifact, sessionId } = await getDesignArtifactForWrite(
      input.artifactId,
      input.organizationId,
      input.actorId,
    );
    const referenceArtifacts = await getComparisonArtifactsForIteration({
      artifactIds: input.referenceArtifactIds,
      parentArtifactId: artifact.id,
      sessionGroupId: artifact.sessionGroupId,
      organizationId: input.organizationId,
    });
    const referenceSections = referenceArtifacts.flatMap((reference, index) => [
      "",
      `Reference artifact ${index + 2}: ${reference.title}`,
      reference.prompt ? `Original design brief: ${reference.prompt}` : null,
      "",
      "```html",
      reference.html,
      "```",
    ]);
    const brief = [
      input.prompt?.trim() || "Implement this design artifact in the product codebase.",
      "",
      `Primary artifact: ${artifact.title}`,
      artifact.prompt ? `Original design brief: ${artifact.prompt}` : null,
      "",
      referenceArtifacts.length > 0
        ? "Use the primary artifact as the implementation target and the additional selected artifacts as visual references. Preserve layout, interaction intent, typography, spacing, and token structure where they fit the target product."
        : "Use the HTML below as the visual reference. Preserve the layout, interaction intent, typography, spacing, and token structure where it fits the target product.",
      "",
      "```html",
      await resolveDesignArtifactHtml(artifact),
      "```",
      ...referenceSections,
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
        referenceArtifactIds: referenceArtifacts.map((reference) => reference.id),
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
