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
      costUsd: 0,
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
            usage: { inputTokens: 10, outputTokens: 20 },
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
    expect(result.metadata).toMatchObject({
      generator: "llm",
      source: "designGenerationService",
      promptComposer: "trace-open-design-v1",
      model: "anthropic/test",
      usage: { inputTokens: 10, outputTokens: 20 },
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
    expect(eventServiceMock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "session_output",
        scopeId: "session-1",
        payload: expect.objectContaining({
          type: "design_generation_completed",
          sessionGroupId: "group-1",
          htmlPreview: expect.stringContaining('<main data-el="hero">Hi</main>'),
          usage: { inputTokens: 10, outputTokens: 20 },
        }),
      }),
    );
    expect(prismaMock.session.update).toHaveBeenCalledWith({
      where: { id: "session-1" },
      data: {
        inputTokens: { increment: 10 },
        outputTokens: { increment: 20 },
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
          costUsd: 0,
        }),
      }),
    );
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

  it("allows placeholder generation only when explicitly enabled for local development", async () => {
    vi.stubEnv("TRACE_DESIGN_ALLOW_PLACEHOLDER_FALLBACK", "true");
    aiServiceMock.stream.mockReturnValue(
      (async function* () {
        yield { type: "error", error: new Error("No anthropic API key configured") };
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

    expect(result.html).toContain("Design artifact");
    expect(result.metadata).toMatchObject({
      generator: "local_fallback",
      fallbackReason: "missing_api_key",
    });
  });
});
