import { describe, expect, it } from "vitest";
import {
  getDefaultModelForProvider,
  getDefaultModel,
  getDefaultReasoningEffort,
  getModelProviderForModel,
  getModelProviderGroupsForTool,
  getModelsForTool,
  isSupportedModel,
  isSupportedReasoningEffort,
} from "../src/models.js";

describe("model catalog", () => {
  it("exposes Pi-backed API and subscription models and defaults to API OpenAI", () => {
    expect(getDefaultModel("pi")).toBe("openai/gpt-5.5");
    expect(getDefaultReasoningEffort("pi")).toBe("medium");
    expect(getModelsForTool("pi")).toContainEqual({
      value: "openai/gpt-5.5",
      label: "OpenAI GPT-5.5",
    });
    expect(getModelsForTool("pi")).toContainEqual({
      value: "openai/gpt-5.4",
      label: "OpenAI GPT-5.4",
    });
    expect(getModelsForTool("pi")).toContainEqual({
      value: "openai-codex/gpt-5.5",
      label: "Codex GPT-5.5 (ChatGPT)",
    });
    expect(getModelsForTool("pi")).toContainEqual({
      value: "openai-codex/gpt-5.4",
      label: "Codex GPT-5.4 (ChatGPT)",
    });
    expect(getModelsForTool("pi")).toContainEqual({
      value: "anthropic/claude-sonnet-4-6",
      label: "Claude Sonnet 4.6",
    });
    expect(getModelsForTool("pi")).toHaveLength(6);
    expect(isSupportedModel("pi", "openai-codex/gpt-5.4-mini")).toBe(false);
    expect(isSupportedModel("pi", "openai/gpt-5.5")).toBe(true);
    expect(isSupportedModel("pi", "anthropic/claude-opus-4-7")).toBe(true);
    expect(isSupportedReasoningEffort("pi", "high")).toBe(true);
    expect(getModelProviderGroupsForTool("pi")).toEqual([
      expect.objectContaining({
        value: "openai",
        label: "OpenAI API",
        models: [
          { value: "openai/gpt-5.5", label: "OpenAI GPT-5.5" },
          { value: "openai/gpt-5.4", label: "OpenAI GPT-5.4" },
        ],
      }),
      expect.objectContaining({
        value: "openai-codex",
        label: "ChatGPT",
        models: [
          { value: "openai-codex/gpt-5.5", label: "Codex GPT-5.5 (ChatGPT)" },
          { value: "openai-codex/gpt-5.4", label: "Codex GPT-5.4 (ChatGPT)" },
        ],
      }),
      expect.objectContaining({
        value: "anthropic",
        label: "Claude",
        description: "Uses a Claude subscription or Anthropic API key",
        models: [
          { value: "anthropic/claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
          { value: "anthropic/claude-opus-4-7", label: "Claude Opus 4.7" },
        ],
      }),
    ]);
    expect(getModelProviderForModel("pi", "openai-codex/gpt-5.5")?.value).toBe(
      "openai-codex",
    );
    expect(getDefaultModelForProvider("pi", "anthropic")).toBe(
      "anthropic/claude-sonnet-4-6",
    );
  });
});
