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

const aiServiceMock = aiService as any;
const eventServiceMock = eventService as any;
const prismaMock = prisma as ReturnType<typeof import("../../test/helpers.js").createPrismaMock>;

describe("designGenerationService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.sessionGroup.findFirst.mockResolvedValue({
      designSystemId: "trace-core",
      designSkillIds: ["dashboard", "a11y"],
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
      }),
    ).rejects.toThrow("model unavailable");

    expect(eventServiceMock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "design_generation_failed",
        scopeId: "session-1",
        payload: expect.objectContaining({
          sessionGroupId: "group-1",
          error: "model unavailable",
        }),
      }),
    );
  });
});
