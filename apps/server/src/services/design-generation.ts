import { Prisma } from "@prisma/client";
import { randomUUID } from "crypto";
import { composeTraceDesignPrompt, getDefaultModel, type LLMResponse } from "@trace/shared";
import { aiService } from "./ai.js";
import { eventService } from "./event.js";
import { buildPlaceholderDesignArtifactHtml } from "./design-artifact-html.js";
import type { ActorType } from "@trace/gql";

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

function isMissingKeyError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /^No \w+ API key configured/.test(message);
}

export type GeneratedDesignArtifact = {
  html: string;
  metadata: Record<string, unknown>;
};

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
  }): Promise<GeneratedDesignArtifact> {
    const model = input.model ?? DEFAULT_DESIGN_MODEL;
    const generationId = input.generationId ?? randomUUID();
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
          parentHtml: input.parentHtml,
        }),
        maxTokens: 8192,
        temperature: 0.8,
        messages: [
          {
            role: "user",
            content: [
              input.parentHtml
                ? `Brief:\n${input.prompt}\n\nPrevious artifact HTML:\n${input.parentHtml}`
                : input.prompt,
            ].join("\n"),
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
      if (isMissingKeyError(error)) {
        return {
          html: buildPlaceholderDesignArtifactHtml(input.prompt),
          metadata: {
            generator: "local_fallback",
            source: "designGenerationService",
            promptComposer: "trace-open-design-v1",
            generationId,
            model,
            fallbackReason: "missing_api_key",
          },
        };
      }

      const message = error instanceof Error ? error.message : String(error);
      await eventService.create({
        organizationId: input.organizationId,
        scopeType: "session",
        scopeId: input.sessionId,
        eventType: "design_generation_failed",
        payload: {
          sessionGroupId: input.sessionGroupId,
          parentArtifactId: input.parentArtifactId ?? null,
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
    return {
      html,
      metadata: {
        generator: "llm",
        source: "designGenerationService",
        promptComposer: "trace-open-design-v1",
        generationId,
        model: response?.model ?? model,
        usage: response?.usage ?? null,
      },
    };
  },
};
