import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./ai.js", () => ({
  aiService: {
    stream: vi.fn(),
  },
}));

vi.mock("./event.js", () => ({
  eventService: {
    create: vi.fn().mockResolvedValue({ id: "event-1" }),
  },
}));

vi.mock("../lib/db.js", async () => {
  const { createPrismaMock } = await import("../../test/helpers.js");
  return { prisma: createPrismaMock() };
});

import { prisma } from "../lib/db.js";
import { aiService } from "./ai.js";
import * as designContent from "./design-content.js";
import { eventService } from "./event.js";
import { designGenerationService } from "./design-generation.js";

type MockedDeep<T> = {
  [K in keyof T]: T[K] extends (...args: infer A) => infer R
    ? ReturnType<typeof vi.fn<T[K]>>
    : T[K] extends object
      ? MockedDeep<T[K]>
      : T[K];
};

const aiServiceMock = aiService as unknown as MockedDeep<typeof aiService>;
const eventServiceMock = eventService as unknown as MockedDeep<typeof eventService>;
const prismaMock = prisma as ReturnType<typeof import("../../test/helpers.js").createPrismaMock>;

describe("designGenerationService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    prismaMock.sessionGroup.findFirst.mockResolvedValue({
      designSystemId: "trace-core",
      designSkillIds: ["dashboard", "a11y"],
    });
    prismaMock.session.update.mockResolvedValue({
      inputTokens: BigInt(10),
      outputTokens: BigInt(20),
      cacheReadTokens: BigInt(0),
      cacheCreationTokens: BigInt(0),
      costUsd: 1.12,
    });
  });

  it("streams HTML through the LLM adapter and records generation metadata", async () => {
    aiServiceMock.stream.mockReturnValue(
      (async function* () {
        yield { type: "text_delta", text: "```html\n<!doctype html><html>" };
        yield {
          type: "text_delta",
          text: '<body><main data-el="hero">Hi</main></body></html>\n```',
        };
        yield {
          type: "complete",
          response: {
            content: [
              {
                type: "text",
                text: "<!doctype html><html><body>fallback complete</body></html>",
              },
            ],
            stopReason: "end_turn",
            usage: { inputTokens: 10, outputTokens: 20, costUsd: 1.12 },
            model: "anthropic/test",
          },
        };
      })(),
    );

    const result = await designGenerationService.generateHtml({
      organizationId: "org-1",
      actorId: "user-1",
      sessionId: "session-1",
      sessionGroupId: "group-1",
      prompt: "Design a dashboard",
      model: "anthropic/test",
    });

    expect(result.html).toContain('<main data-el="hero">Hi</main>');
    expect(result.generationId).toEqual(expect.any(String));
    expect(result.model).toBe("anthropic/test");
    expect(result.usage).toEqual({ inputTokens: 10, outputTokens: 20, costUsd: 1.12 });
    expect(result.metadata).toMatchObject({
      generator: "llm",
      source: "designGenerationService",
      promptComposer: "trace-open-design-v1",
      model: "anthropic/test",
      usage: { inputTokens: 10, outputTokens: 20, costUsd: 1.12 },
    });
    expect(aiServiceMock.stream).toHaveBeenCalledWith(
      expect.objectContaining({
        system: expect.stringContaining("origin-isolated user-content iframe"),
        messages: [
          {
            role: "user",
            content: "Design a dashboard",
          },
        ],
      }),
    );
    const streamInput = aiServiceMock.stream.mock.calls[0]?.[0] as { system?: string } | undefined;
    expect(streamInput?.system).toContain("Open Design System Prompt");
    expect(streamInput?.system).toContain("Design a dashboard");
    expect(streamInput?.system).toContain("trace-core");
    expect(streamInput?.system).toContain("dashboard, a11y");
    expect(eventServiceMock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "design_generation_started",
        scopeId: "session-1",
        payload: expect.objectContaining({
          sessionGroupId: "group-1",
          model: "anthropic/test",
        }),
      }),
    );
    expect(eventServiceMock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "session_output",
        scopeId: "session-1",
        payload: expect.objectContaining({
          type: "design_generation_delta",
          sessionGroupId: "group-1",
          delta: "```html\n<!doctype html><html>",
          htmlPreview: expect.stringContaining("<!doctype html><html>"),
        }),
      }),
    );
    expect(
      eventServiceMock.create.mock.calls.some(
        ([event]) =>
          event.eventType === "session_output" &&
          event.payload?.type === "design_generation_completed",
      ),
    ).toBe(false);
    expect(prismaMock.session.update).toHaveBeenCalledWith({
      where: { id: "session-1" },
      data: {
        inputTokens: { increment: 10 },
        outputTokens: { increment: 20 },
        costUsd: { increment: 1.12 },
      },
      select: {
        inputTokens: true,
        outputTokens: true,
        cacheReadTokens: true,
        cacheCreationTokens: true,
        costUsd: true,
      },
    });
    expect(eventServiceMock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "session_output",
        scopeId: "session-1",
        payload: expect.objectContaining({
          type: "usage_updated",
          inputTokens: 10,
          outputTokens: 20,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
          costUsd: 1.12,
        }),
      }),
    );
  });

  it("includes selected comparison artifacts in the design system prompt", async () => {
    aiServiceMock.stream.mockReturnValue(
      (async function* () {
        yield {
          type: "complete",
          response: {
            content: [
              {
                type: "text",
                text: "<!doctype html><html><body>merged</body></html>",
              },
            ],
            stopReason: "end_turn",
            usage: { inputTokens: 1, outputTokens: 2 },
            model: "anthropic/test",
          },
        };
      })(),
    );

    await designGenerationService.generateHtml({
      organizationId: "org-1",
      actorId: "user-1",
      sessionId: "session-1",
      sessionGroupId: "group-1",
      prompt: "Merge these directions",
      parentArtifactId: "artifact-1",
      parentHtml: "<!doctype html><html><body>Primary</body></html>",
      comparisonArtifacts: [
        {
          id: "artifact-2",
          title: "Editorial direction",
          prompt: "Make it editorial",
          metadata: { directionLabel: "Bold editorial direction" },
          html: "<!doctype html><html><body>Editorial</body></html>",
        },
      ],
    });

    const streamInput = aiServiceMock.stream.mock.calls[0]?.[0] as { system?: string } | undefined;
    expect(streamInput?.system).toContain("Previous artifact HTML");
    expect(streamInput?.system).toContain("Selected comparison artifacts");
    expect(streamInput?.system).toContain("Editorial direction");
    expect(streamInput?.system).toContain("<!doctype html><html><body>Editorial</body></html>");
  });

  it("emits generation failure events for model errors", async () => {
    aiServiceMock.stream.mockReturnValue(
      (async function* () {
        yield { type: "error", error: new Error("model unavailable") };
      })(),
    );

    await expect(
      designGenerationService.generateHtml({
        organizationId: "org-1",
        actorId: "user-1",
        sessionId: "session-1",
        sessionGroupId: "group-1",
        prompt: "Design a dashboard",
        model: "anthropic/test",
        generationId: "generation-1",
        directionIndex: 1,
        directionCount: 3,
        directionLabel: "Operational dashboard",
      }),
    ).rejects.toThrow("model unavailable");

    expect(eventServiceMock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "design_generation_failed",
        scopeId: "session-1",
        payload: expect.objectContaining({
          generationId: "generation-1",
          sessionGroupId: "group-1",
          directionIndex: 1,
          directionCount: 3,
          directionLabel: "Operational dashboard",
          prompt: "Design a dashboard",
          error: "model unavailable",
        }),
      }),
    );
  });

  it("does not silently create placeholder artifacts when model credentials are missing", async () => {
    aiServiceMock.stream.mockReturnValue(
      (async function* () {
        yield { type: "error", error: new Error("No anthropic API key configured") };
      })(),
    );

    await expect(
      designGenerationService.generateHtml({
        organizationId: "org-1",
        actorId: "user-1",
        sessionId: "session-1",
        sessionGroupId: "group-1",
        prompt: "Design a dashboard",
        model: "anthropic/test",
      }),
    ).rejects.toThrow("No anthropic API key configured");

    expect(eventServiceMock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "design_generation_failed",
        scopeId: "session-1",
        payload: expect.objectContaining({
          sessionGroupId: "group-1",
          error: "No anthropic API key configured",
        }),
      }),
    );
  });

  it("does not create placeholder artifacts even when the old fallback env is set", async () => {
    vi.stubEnv("TRACE_DESIGN_ALLOW_PLACEHOLDER_FALLBACK", "true");
    aiServiceMock.stream.mockReturnValue(
      (async function* () {
        yield { type: "error", error: new Error("No anthropic API key configured") };
      })(),
    );

    await expect(
      designGenerationService.generateHtml({
        organizationId: "org-1",
        actorId: "user-1",
        sessionId: "session-1",
        sessionGroupId: "group-1",
        prompt: "Design a dashboard",
        model: "anthropic/test",
      }),
    ).rejects.toThrow("No anthropic API key configured");

    expect(eventServiceMock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "design_generation_failed",
        payload: expect.objectContaining({
          error: "No anthropic API key configured",
        }),
      }),
    );
  });

  it("emits generation failure events for prompt setup errors before model streaming", async () => {
    vi.spyOn(designContent, "loadTraceDesignPromptContent").mockImplementationOnce(() => {
      throw new Error("design content unavailable");
    });

    await expect(
      designGenerationService.generateHtml({
        organizationId: "org-1",
        actorId: "user-1",
        sessionId: "session-1",
        sessionGroupId: "group-1",
        prompt: "Design a dashboard",
        model: "anthropic/test",
        generationId: "generation-setup",
        directionIndex: 2,
        directionCount: 3,
        directionLabel: "Experimental dashboard",
      }),
    ).rejects.toThrow("design content unavailable");

    expect(aiServiceMock.stream).not.toHaveBeenCalled();
    expect(eventServiceMock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "design_generation_failed",
        scopeId: "session-1",
        payload: expect.objectContaining({
          generationId: "generation-setup",
          sessionGroupId: "group-1",
          directionIndex: 2,
          directionCount: 3,
          directionLabel: "Experimental dashboard",
          prompt: "Design a dashboard",
          error: "design content unavailable",
        }),
      }),
    );
  });
});
