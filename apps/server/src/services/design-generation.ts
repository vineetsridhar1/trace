import { Prisma } from "@prisma/client";
import { randomUUID } from "crypto";
import {
  composeTraceDesignPrompt,
  getDefaultModel,
  type LLMResponse,
  type LLMUsage,
} from "@trace/shared";
import { aiService } from "./ai.js";
import { eventService } from "./event.js";
import { loadTraceDesignPromptContent } from "./design-content.js";
import type { ActorType } from "@trace/gql";
import { prisma } from "../lib/db.js";

const DEFAULT_DESIGN_MODEL = getDefaultModel("claude_code") ?? "anthropic/claude-sonnet-5";

function textFromResponse(response: LLMResponse | null): string {
  if (!response) return "";
  return response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");
}

function extractHtml(text: string): string {
  const trimmed = text.trim();
  const fenced = /```(?:html)?\s*([\s\S]*?)```/i.exec(trimmed);
  const withoutOpeningFence = trimmed.replace(/^```(?:html)?\s*/i, "").replace(/```\s*$/i, "");
  const candidate = (fenced?.[1] ?? withoutOpeningFence).trim();
  if (/<!doctype html/i.test(candidate) || /<html[\s>]/i.test(candidate)) {
    return candidate;
  }
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Trace design artifact</title>
</head>
<body>
${candidate}
</body>
</html>`;
}

function numberFromBigInt(value: bigint | number | null | undefined): number {
  return typeof value === "bigint" ? Number(value) : (value ?? 0);
}

async function recordDesignUsage(input: {
  organizationId: string;
  sessionId: string;
  usage: LLMUsage | null | undefined;
}): Promise<void> {
  const inputTokens = input.usage?.inputTokens ?? 0;
  const outputTokens = input.usage?.outputTokens ?? 0;
  if (inputTokens === 0 && outputTokens === 0) return;

  const updated = await prisma.session.update({
    where: { id: input.sessionId },
    data: {
      inputTokens: { increment: inputTokens },
      outputTokens: { increment: outputTokens },
    },
    select: {
      inputTokens: true,
      outputTokens: true,
      cacheReadTokens: true,
      cacheCreationTokens: true,
      costUsd: true,
    },
  });

  await eventService.create({
    organizationId: input.organizationId,
    scopeType: "session",
    scopeId: input.sessionId,
    eventType: "session_output",
    payload: {
      type: "usage_updated",
      inputTokens: numberFromBigInt(updated.inputTokens),
      outputTokens: numberFromBigInt(updated.outputTokens),
      cacheReadTokens: numberFromBigInt(updated.cacheReadTokens),
      cacheCreationTokens: numberFromBigInt(updated.cacheCreationTokens),
      costUsd: updated.costUsd,
    } as Prisma.InputJsonValue,
    actorType: "system",
    actorId: "system",
  });
}

export type GeneratedDesignArtifact = {
  html: string;
  metadata: Record<string, unknown>;
};

export type DesignComparisonArtifact = {
  id: string;
  title: string;
  prompt: string | null;
  metadata: Record<string, unknown>;
  html: string;
};

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function buildArtifactContext(input: {
  parentHtml?: string | null;
  directionLabel?: string | null;
  comparisonArtifacts?: DesignComparisonArtifact[] | null;
}): string | null {
  const parts: string[] = [];
  if (input.parentHtml) {
    parts.push(`Previous artifact HTML:\n${input.parentHtml}`);
  } else if (input.directionLabel) {
    parts.push(`Generate design direction: ${input.directionLabel}.`);
  }

  if (input.comparisonArtifacts?.length) {
    parts.push(
      [
        "Selected comparison artifacts:",
        ...input.comparisonArtifacts.map((artifact, index) =>
          [
            `Comparison ${index + 1}: ${artifact.title} (${artifact.id})`,
            artifact.prompt ? `Prompt: ${artifact.prompt}` : null,
            `Metadata: ${JSON.stringify(artifact.metadata)}`,
            `HTML:\n${artifact.html}`,
          ]
            .filter((line): line is string => line !== null)
            .join("\n"),
        ),
      ].join("\n\n"),
    );
  }

  return parts.length > 0 ? parts.join("\n\n") : null;
}

export const designGenerationService = {
  async generateHtml(input: {
    organizationId: string;
    actorId: string;
    actorType?: ActorType;
    sessionId: string;
    sessionGroupId: string;
    prompt: string;
    model?: string | null;
    parentArtifactId?: string | null;
    parentHtml?: string | null;
    generationId?: string | null;
    directionIndex?: number | null;
    directionCount?: number | null;
    directionLabel?: string | null;
    elementAnchors?: Array<Record<string, unknown>> | null;
    comparisonArtifacts?: DesignComparisonArtifact[] | null;
  }): Promise<GeneratedDesignArtifact> {
    const model = input.model ?? DEFAULT_DESIGN_MODEL;
    const generationId = input.generationId ?? randomUUID();
    const group = await prisma.sessionGroup.findFirst({
      where: { id: input.sessionGroupId, organizationId: input.organizationId },
      select: { designSystemId: true, designSkillIds: true },
    });
    const designSystemId = group?.designSystemId ?? null;
    const skillIds = stringList(group?.designSkillIds);
    const content = loadTraceDesignPromptContent({ designSystemId, skillIds });
    const artifactContext = buildArtifactContext({
      parentHtml: input.parentHtml,
      directionLabel: input.directionLabel,
      comparisonArtifacts: input.comparisonArtifacts ?? null,
    });
    const streamPayloadBase = {
      generationId,
      sessionGroupId: input.sessionGroupId,
      parentArtifactId: input.parentArtifactId ?? null,
      directionIndex: input.directionIndex ?? null,
      directionCount: input.directionCount ?? null,
      directionLabel: input.directionLabel ?? null,
      model,
      prompt: input.prompt,
    };
    await eventService.create({
      organizationId: input.organizationId,
      scopeType: "session",
      scopeId: input.sessionId,
      eventType: "design_generation_started",
      payload: {
        ...streamPayloadBase,
      } as Prisma.InputJsonValue,
      actorType: input.actorType ?? "user",
      actorId: input.actorId,
    });

    let text = "";
    let response: LLMResponse | null = null;
    try {
      for await (const event of aiService.stream({
        organizationId: input.organizationId,
        userId: input.actorId,
        model,
        system: composeTraceDesignPrompt({
          kind: "design",
          userBrief: input.prompt,
          designSystemId,
          skillIds,
          content,
          artifactContext,
          elementAnchors: input.elementAnchors ?? null,
        }),
        maxTokens: 8192,
        temperature: 0.8,
        messages: [
          {
            role: "user",
            content: input.prompt,
          },
        ],
      })) {
        if (event.type === "text_delta") {
          text += event.text;
          await eventService.create({
            organizationId: input.organizationId,
            scopeType: "session",
            scopeId: input.sessionId,
            eventType: "session_output",
            payload: {
              type: "design_generation_delta",
              ...streamPayloadBase,
              delta: event.text,
              htmlPreview: extractHtml(text),
            } as Prisma.InputJsonValue,
            actorType: input.actorType ?? "user",
            actorId: input.actorId,
          });
        } else if (event.type === "complete") {
          response = event.response;
        } else if (event.type === "error") {
          throw event.error;
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await eventService.create({
        organizationId: input.organizationId,
        scopeType: "session",
        scopeId: input.sessionId,
        eventType: "design_generation_failed",
        payload: {
          ...streamPayloadBase,
          model,
          error: message,
        } as Prisma.InputJsonValue,
        actorType: input.actorType ?? "user",
        actorId: input.actorId,
      });
      throw error;
    }

    const responseText = text || textFromResponse(response);
    const html = extractHtml(responseText);
    await eventService.create({
      organizationId: input.organizationId,
      scopeType: "session",
      scopeId: input.sessionId,
      eventType: "session_output",
      payload: {
        type: "design_generation_completed",
        ...streamPayloadBase,
        htmlPreview: html,
        usage: response?.usage ?? null,
      } as Prisma.InputJsonValue,
      actorType: input.actorType ?? "user",
      actorId: input.actorId,
    });
    await recordDesignUsage({
      organizationId: input.organizationId,
      sessionId: input.sessionId,
      usage: response?.usage,
    });
    return {
      html,
      metadata: {
        generator: "llm",
        source: "designGenerationService",
        promptComposer: "trace-open-design-v1",
        generationId,
        model: response?.model ?? model,
        designSystemId,
        skillIds,
        usage: response?.usage ?? null,
        comparisonArtifactIds:
          input.comparisonArtifacts?.map((artifact) => artifact.id).filter(Boolean) ?? [],
      },
    };
  },
};
