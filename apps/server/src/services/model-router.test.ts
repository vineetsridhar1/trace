import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./ai.js", () => ({
  aiService: {
    complete: vi.fn(),
  },
}));

import { aiService } from "./ai.js";
import { modelRouterService } from "./model-router.js";

const aiServiceMock = aiService as unknown as {
  complete: ReturnType<typeof vi.fn>;
};

describe("ModelRouterService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves classifier tiers to the configured model for the selected tool", async () => {
    aiServiceMock.complete.mockResolvedValueOnce({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            complexity: "complex",
            risk: "high",
            confidence: "high",
            tier: "high_thinking",
            reasonCode: "architecture_change",
            explanation: "Architecture-level change",
          }),
        },
      ],
    });

    const decision = await modelRouterService.route({
      organizationId: "org-1",
      userId: "user-1",
      tool: "codex",
      prompt: "Plan a multi-package module boundary change.",
      organizationSettings: {
        modelRouter: {
          prompt: "Prefer high thinking for cross-package planning.",
          routerModelByTool: { codex: "gpt-5.1-codex-mini" },
          modelTiersByTool: {
            codex: {
              fast: "gpt-5.1-codex-mini",
              balanced: "gpt-5.3-codex",
              high_thinking: "gpt-5.5",
            },
          },
        },
      },
    });

    expect(decision).toMatchObject({
      selectedModel: "gpt-5.5",
      tier: "high_thinking",
      complexity: "complex",
      risk: "high",
      reasonCode: "architecture_change",
    });
    expect(aiServiceMock.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-5.1-codex-mini",
        system: expect.stringMatching(
          /Return compact JSON with these fields only:[\s\S]*Routing guidance:[\s\S]*Prefer high thinking for cross-package planning\./,
        ),
        messages: [
          expect.objectContaining({
            content: expect.stringContaining('"high_thinking":"gpt-5.5"'),
          }),
        ],
      }),
    );
  });

  it("uses the high thinking tier for deterministic protected-domain rules", async () => {
    const decision = await modelRouterService.route({
      organizationId: "org-1",
      userId: "user-1",
      tool: "claude_code",
      prompt: "Update auth and payment migration logic.",
      organizationSettings: {
        modelRouter: {
          modelTiersByTool: {
            claude_code: {
              fast: "claude-haiku-4-5",
              balanced: "claude-sonnet-4-6",
              high_thinking: "claude-opus-4-8[1m]",
            },
          },
        },
      },
    });

    expect(decision).toMatchObject({
      selectedModel: "claude-opus-4-8[1m]",
      tier: "high_thinking",
      reasonCode: "protected_domain",
    });
    expect(aiServiceMock.complete).not.toHaveBeenCalled();
  });

  it("tries fallback router models before using the execution fallback", async () => {
    aiServiceMock.complete
      .mockRejectedValueOnce(new Error("No openai API key configured"))
      .mockResolvedValueOnce({
        content: [
          {
            type: "text",
            text: JSON.stringify({
              complexity: "simple",
              risk: "low",
              confidence: "high",
              tier: "fast",
              reasonCode: "small_change",
              explanation: "Small low-risk change",
            }),
          },
        ],
      });

    const decision = await modelRouterService.route({
      organizationId: "org-1",
      userId: "user-1",
      tool: "codex",
      prompt: "Change one button label.",
      organizationSettings: {
        modelRouter: {
          routerModelByTool: { codex: "bad-router-model" },
          modelTiersByTool: {
            codex: {
              fast: "gpt-5.1-codex-mini",
              balanced: "gpt-5.3-codex",
              high_thinking: "gpt-5.5",
            },
          },
        },
      },
    });

    expect(decision).toMatchObject({
      selectedModel: "gpt-5.1-codex-mini",
      tier: "fast",
      fallback: false,
      reasonCode: "small_change",
    });
    expect(aiServiceMock.complete).toHaveBeenCalledTimes(2);
  });

  it("uses a local heuristic instead of fallback when router API keys are missing", async () => {
    aiServiceMock.complete
      .mockRejectedValueOnce(new Error("No anthropic API key configured"))
      .mockRejectedValueOnce(new Error("No openai API key configured"))
      .mockRejectedValueOnce(new Error("No anthropic API key configured"));

    const decision = await modelRouterService.route({
      organizationId: "org-1",
      userId: "user-1",
      tool: "codex",
      prompt: "Change one label.",
      organizationSettings: {
        modelRouter: {
          routerModelByTool: { codex: "bad-router-model" },
          modelTiersByTool: {
            codex: {
              fast: "gpt-5.1-codex-mini",
              balanced: "gpt-5.3-codex",
              high_thinking: "gpt-5.5",
            },
          },
        },
      },
    });

    expect(decision).toMatchObject({
      selectedModel: "gpt-5.1-codex-mini",
      tier: "fast",
      fallback: false,
      reasonCode: "router_api_key_missing",
      confidence: "low",
    });
  });
});
