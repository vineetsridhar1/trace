import { describe, expect, it } from "vitest";
import {
  getDefaultModel,
  getDefaultReasoningEffort,
  getModelProviderForModel,
  getModelProviderGroupsForTool,
  getModelsForTool,
  isSupportedModel,
  isSupportedReasoningEffort,
  resolveCursorComposerModel,
} from "../src/models.js";

describe("model catalog", () => {
  it("exposes Fable 5 as an option while defaulting Claude Code to Opus 4.8 (1M)", () => {
    expect(getDefaultModel("claude_code")).toBe("claude-opus-4-8[1m]");
    expect(getModelsForTool("claude_code")).toEqual([
      { value: "claude-fable-5", label: "Fable 5" },
      { value: "claude-sonnet-5", label: "Sonnet 5" },
      { value: "claude-sonnet-4-6", label: "Sonnet 4.6" },
      { value: "claude-opus-4-8", label: "Opus 4.8" },
      { value: "claude-opus-4-8[1m]", label: "Opus 4.8 (1M)" },
      { value: "claude-haiku-4-5", label: "Haiku 4.5" },
    ]);
    expect(isSupportedModel("claude_code", "claude-fable-5")).toBe(true);
    expect(isSupportedModel("claude_code", "claude-opus-4-8[1m]")).toBe(true);
    expect(isSupportedModel("claude_code", "claude-opus-4-7")).toBe(false);
  });

  it("exposes GPT-5.6 as the default Codex model", () => {
    expect(getDefaultModel("codex")).toBe("gpt-5.6");
    expect(getModelsForTool("codex")).toContainEqual({
      value: "gpt-5.6",
      label: "GPT-5.6",
    });
    expect(isSupportedModel("codex", "gpt-5.6")).toBe(true);
  });

  it("exposes Pi-backed API and subscription models and defaults to API OpenAI", () => {
    expect(getDefaultModel("pi")).toBe("openai/gpt-5.6");
    expect(getDefaultReasoningEffort("pi")).toBe("medium");
    expect(getModelsForTool("pi")).toContainEqual({
      value: "openai/gpt-5.6",
      label: "OpenAI GPT-5.6",
    });
    expect(getModelsForTool("pi")).toContainEqual({
      value: "openai/gpt-5.5",
      label: "OpenAI GPT-5.5",
    });
    expect(getModelsForTool("pi")).toContainEqual({
      value: "openai/gpt-5.4",
      label: "OpenAI GPT-5.4",
    });
    expect(getModelsForTool("pi")).toContainEqual({
      value: "openai-codex/gpt-5.6",
      label: "Codex GPT-5.6 (ChatGPT)",
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
      value: "anthropic/claude-sonnet-5",
      label: "Claude Sonnet 5",
    });
    expect(getModelsForTool("pi")).toContainEqual({
      value: "anthropic/claude-sonnet-4-6",
      label: "Claude Sonnet 4.6",
    });
    expect(getModelsForTool("pi")).toHaveLength(9);
    expect(isSupportedModel("pi", "openai-codex/gpt-5.4-mini")).toBe(false);
    expect(isSupportedModel("pi", "openai/gpt-5.6")).toBe(true);
    expect(isSupportedModel("pi", "openai/gpt-5.5")).toBe(true);
    expect(isSupportedModel("pi", "anthropic/claude-fable-5")).toBe(true);
    expect(isSupportedReasoningEffort("pi", "high")).toBe(true);
    expect(getModelProviderGroupsForTool("pi")).toEqual([
      expect.objectContaining({
        value: "openai",
        label: "OpenAI API",
        models: [
          { value: "openai/gpt-5.6", label: "OpenAI GPT-5.6" },
          { value: "openai/gpt-5.5", label: "OpenAI GPT-5.5" },
          { value: "openai/gpt-5.4", label: "OpenAI GPT-5.4" },
        ],
      }),
      expect.objectContaining({
        value: "openai-codex",
        label: "ChatGPT",
        models: [
          { value: "openai-codex/gpt-5.6", label: "Codex GPT-5.6 (ChatGPT)" },
          { value: "openai-codex/gpt-5.5", label: "Codex GPT-5.5 (ChatGPT)" },
          { value: "openai-codex/gpt-5.4", label: "Codex GPT-5.4 (ChatGPT)" },
        ],
      }),
      expect.objectContaining({
        value: "anthropic",
        label: "Claude",
        description: "Uses a Claude subscription",
        models: [
          { value: "anthropic/claude-sonnet-5", label: "Claude Sonnet 5" },
          { value: "anthropic/claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
          { value: "anthropic/claude-fable-5", label: "Claude Fable 5" },
        ],
      }),
    ]);
    expect(getModelProviderForModel("pi", "openai-codex/gpt-5.5")?.value).toBe(
      "openai-codex",
    );
    expect(getModelProviderForModel("pi", "openai-codex/gpt-5.6")?.value).toBe(
      "openai-codex",
    );
  });
});

describe("resolveCursorComposerModel", () => {
  it("passes auto through and ignores the level", () => {
    expect(resolveCursorComposerModel("auto", "high")).toBe("auto");
    expect(resolveCursorComposerModel(undefined, "high")).toBeUndefined();
  });

  it("folds the thinking level into Claude model ids", () => {
    expect(resolveCursorComposerModel("opus-4.8", "low")).toBe("claude-opus-4-8-thinking-low");
    expect(resolveCursorComposerModel("opus-4.8", "max")).toBe("claude-opus-4-8-thinking-max");
    expect(resolveCursorComposerModel("sonnet-5", "high")).toBe("claude-sonnet-5-thinking-high");
  });

  it("maps GPT-5 levels and clamps xhigh/max to extra-high", () => {
    expect(resolveCursorComposerModel("gpt-5.6", "low")).toBe("gpt-5.6-low");
    expect(resolveCursorComposerModel("gpt-5.6", "high")).toBe("gpt-5.6-high");
    expect(resolveCursorComposerModel("gpt-5.6", "xhigh")).toBe("gpt-5.6-extra-high");
    expect(resolveCursorComposerModel("gpt-5.6", "max")).toBe("gpt-5.6-extra-high");
    expect(resolveCursorComposerModel("gpt-5.5", "low")).toBe("gpt-5.5-low");
    expect(resolveCursorComposerModel("gpt-5.5", "high")).toBe("gpt-5.5-high");
    expect(resolveCursorComposerModel("gpt-5.5", "xhigh")).toBe("gpt-5.5-extra-high");
    expect(resolveCursorComposerModel("gpt-5.5", "max")).toBe("gpt-5.5-extra-high");
  });

  it("defaults to medium when the level is missing or foreign", () => {
    expect(resolveCursorComposerModel("opus-4.8", undefined)).toBe(
      "claude-opus-4-8-thinking-medium",
    );
    expect(resolveCursorComposerModel("opus-4.8", "auto")).toBe(
      "claude-opus-4-8-thinking-medium",
    );
  });
});
