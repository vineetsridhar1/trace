import { describe, expect, it } from "vitest";
import {
  getDefaultModel,
  getDefaultReasoningEffort,
  getModelProviderForModel,
  getModelProviderGroupsForTool,
  getModelsForTool,
  getReasoningEffortsForTool,
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

  it("exposes GPT-5.6 Sol as the default Codex model", () => {
    expect(getDefaultModel("codex")).toBe("gpt-5.6-sol");
    expect(getModelsForTool("codex")).toContainEqual({
      value: "gpt-5.6-sol",
      label: "GPT-5.6 Sol",
    });
    expect(getModelsForTool("codex")).toContainEqual({
      value: "gpt-5.6-terra",
      label: "GPT-5.6 Terra",
    });
    expect(getModelsForTool("codex")).toContainEqual({
      value: "gpt-5.6-luna",
      label: "GPT-5.6 Luna",
    });
    expect(isSupportedModel("codex", "gpt-5.6-sol")).toBe(true);
    expect(isSupportedModel("codex", "gpt-5.5")).toBe(true);
    expect(isSupportedModel("codex", "gpt-5.4")).toBe(false);
  });

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
      value: "openai-codex/gpt-5.6-sol",
      label: "Codex GPT-5.6 Sol (ChatGPT)",
    });
    expect(getModelsForTool("pi")).toContainEqual({
      value: "openai-codex/gpt-5.6-terra",
      label: "Codex GPT-5.6 Terra (ChatGPT)",
    });
    expect(getModelsForTool("pi")).toContainEqual({
      value: "openai-codex/gpt-5.6-luna",
      label: "Codex GPT-5.6 Luna (ChatGPT)",
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
    expect(isSupportedModel("pi", "openai-codex/gpt-5.6-sol")).toBe(true);
    expect(isSupportedModel("pi", "openai/gpt-5.6-sol")).toBe(false);
    expect(isSupportedModel("pi", "openai/gpt-5.5")).toBe(true);
    expect(isSupportedModel("pi", "anthropic/claude-fable-5")).toBe(true);
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
          { value: "openai-codex/gpt-5.6-sol", label: "Codex GPT-5.6 Sol (ChatGPT)" },
          { value: "openai-codex/gpt-5.6-terra", label: "Codex GPT-5.6 Terra (ChatGPT)" },
          { value: "openai-codex/gpt-5.6-luna", label: "Codex GPT-5.6 Luna (ChatGPT)" },
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
    expect(getModelProviderForModel("pi", "openai-codex/gpt-5.6-terra")?.value).toBe(
      "openai-codex",
    );
    expect(getModelProviderForModel("pi", "openai/gpt-5.5")?.value).toBe(
      "openai",
    );
  });

  it("limits Grok 4.5 effort options to the levels Cursor exposes", () => {
    expect(getReasoningEffortsForTool("cursor_composer", "grok-4.5")).toEqual([
      { value: "medium", label: "Medium" },
      { value: "high", label: "High" },
      { value: "xhigh", label: "Extra high" },
    ]);
    expect(isSupportedReasoningEffort("cursor_composer", "low", "grok-4.5")).toBe(false);
    expect(isSupportedReasoningEffort("cursor_composer", "medium", "grok-4.5")).toBe(true);
    expect(isSupportedReasoningEffort("cursor_composer", "max", "grok-4.5")).toBe(false);
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

  it("folds the thinking level into GPT-5.6 model ids as a plain suffix", () => {
    expect(resolveCursorComposerModel("gpt-5.6-sol", "low")).toBe("gpt-5.6-sol-low");
    expect(resolveCursorComposerModel("gpt-5.6-sol", "medium")).toBe("gpt-5.6-sol-medium");
    expect(resolveCursorComposerModel("gpt-5.6-sol", "high")).toBe("gpt-5.6-sol-high");
    expect(resolveCursorComposerModel("gpt-5.6-sol", "xhigh")).toBe("gpt-5.6-sol-xhigh");
    expect(resolveCursorComposerModel("gpt-5.6-sol", "max")).toBe("gpt-5.6-sol-max");
    expect(resolveCursorComposerModel("gpt-5.6-terra", "xhigh")).toBe("gpt-5.6-terra-xhigh");
    expect(resolveCursorComposerModel("gpt-5.6-luna", "max")).toBe("gpt-5.6-luna-max");
  });

  it("maps Grok 4.5 levels to the Cursor ids that exist", () => {
    expect(resolveCursorComposerModel("grok-4.5", "low")).toBe("grok-4.5-medium");
    expect(resolveCursorComposerModel("grok-4.5", "medium")).toBe("grok-4.5-medium");
    expect(resolveCursorComposerModel("grok-4.5", "high")).toBe("grok-4.5-high");
    expect(resolveCursorComposerModel("grok-4.5", "xhigh")).toBe("grok-4.5-xhigh");
    expect(resolveCursorComposerModel("grok-4.5", "max")).toBe("grok-4.5-xhigh");
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
