import { describe, expect, it } from "vitest";
import {
  CLAUDE_CODE_CONFIGURED_DEFAULT_MODEL,
  CODEX_CONFIGURED_DEFAULT_MODEL,
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
  it("exposes Fable 5.1 while defaulting Claude Code to Opus 5 (1M)", () => {
    expect(getDefaultModel("claude_code")).toBe("claude-opus-5[1m]");
    expect(getModelsForTool("claude_code")).toEqual([
      { value: CLAUDE_CODE_CONFIGURED_DEFAULT_MODEL, label: "Configured default" },
      { value: "claude-fable-5-1", label: "Fable 5.1" },
      { value: "claude-fable-5", label: "Fable 5" },
      { value: "claude-sonnet-5", label: "Sonnet 5" },
      { value: "claude-opus-5", label: "Opus 5" },
      { value: "claude-opus-5[1m]", label: "Opus 5 (1M)" },
    ]);
    expect(isSupportedModel("claude_code", CLAUDE_CODE_CONFIGURED_DEFAULT_MODEL)).toBe(true);
    expect(isSupportedModel("claude_code", "claude-astra-5-1")).toBe(false);
    expect(isSupportedModel("claude_code", "claude-fable-5-1")).toBe(true);
    expect(isSupportedModel("claude_code", "claude-fable-5")).toBe(true);
    expect(isSupportedModel("claude_code", "claude-opus-5[1m]")).toBe(true);
    expect(isSupportedModel("claude_code", "claude-opus-unknown")).toBe(false);
  });

  it("exposes GPT-6 Astra as the default Codex model", () => {
    expect(getDefaultModel("codex")).toBe("gpt-6-astra");
    expect(getModelsForTool("codex")).toContainEqual({
      value: CODEX_CONFIGURED_DEFAULT_MODEL,
      label: "Configured default",
    });
    expect(getModelsForTool("codex")).toContainEqual({
      value: "gpt-6-astra",
      label: "GPT-6 Astra",
    });
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
    expect(isSupportedModel("codex", "gpt-6-astra")).toBe(true);
    expect(isSupportedModel("codex", "gpt-5.6-sol")).toBe(true);
    expect(isSupportedModel("codex", CODEX_CONFIGURED_DEFAULT_MODEL)).toBe(true);
    expect(isSupportedModel("codex", "gpt-5.5")).toBe(true);
    expect(isSupportedModel("codex", "gpt-5.4")).toBe(false);
  });

  it("exposes Pi-backed OpenAI API models and defaults to GPT-5.5", () => {
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
    expect(getModelsForTool("pi")).toHaveLength(2);
    expect(isSupportedModel("pi", "openai-codex/gpt-5.4-mini")).toBe(false);
    expect(isSupportedModel("pi", "openai-codex/gpt-5.6-sol")).toBe(false);
    expect(isSupportedModel("pi", "openai/gpt-5.6-sol")).toBe(false);
    expect(isSupportedModel("pi", "openai/gpt-5.5")).toBe(true);
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
    ]);
    expect(getModelProviderForModel("pi", "openai-codex/gpt-5.6-terra")).toBeUndefined();
    expect(getModelProviderForModel("pi", "openai/gpt-5.5")?.value).toBe("openai");
  });

  it("limits Cursor to frontier model families with their supported effort levels", () => {
    expect(getModelsForTool("cursor_composer")).toEqual([
      { value: "auto", label: "Auto" },
      { value: "grok-4.6", label: "Grok 4.6" },
      { value: "gpt-5.6-sol", label: "GPT-5.6 Sol" },
      { value: "gpt-5.6-terra", label: "GPT-5.6 Terra" },
      { value: "gpt-5.6-luna", label: "GPT-5.6 Luna" },
      { value: "opus-5", label: "Opus 5" },
      { value: "sonnet-5", label: "Sonnet 5" },
      { value: "fable-5-1", label: "Fable 5.1" },
      { value: "gemini-3.8-flash", label: "Gemini 3.8 Flash" },
    ]);
    expect(isSupportedModel("cursor_composer", "gpt-5.3-codex")).toBe(false);
    expect(isSupportedModel("cursor_composer", "gpt-5.2")).toBe(false);
    expect(isSupportedModel("cursor_composer", "composer-2.5")).toBe(false);
    expect(getReasoningEffortsForTool("cursor_composer", "grok-4.6")).toEqual([
      { value: "low", label: "Low" },
      { value: "medium", label: "Medium" },
      { value: "high", label: "High" },
      { value: "xhigh", label: "Extra high" },
    ]);
    expect(getReasoningEffortsForTool("cursor_composer", "gemini-3.8-flash")).toHaveLength(3);
    expect(getReasoningEffortsForTool("cursor_composer", "auto")).toEqual([]);
    expect(isSupportedReasoningEffort("cursor_composer", "xhigh", "grok-4.6")).toBe(true);
    expect(isSupportedReasoningEffort("cursor_composer", "max", "grok-4.6")).toBe(false);
  });
});

describe("resolveCursorComposerModel", () => {
  it("passes auto through and ignores the level", () => {
    expect(resolveCursorComposerModel("auto", "high")).toBe("auto");
    expect(resolveCursorComposerModel(undefined, "high")).toBeUndefined();
  });

  it("folds the thinking level into Claude model ids", () => {
    expect(resolveCursorComposerModel("opus-5", "low")).toBe("claude-opus-5-thinking-low");
    expect(resolveCursorComposerModel("opus-5", "max")).toBe("claude-opus-5-thinking-max");
    expect(resolveCursorComposerModel("sonnet-5", "high")).toBe("claude-sonnet-5-thinking-high");
    expect(resolveCursorComposerModel("fable-5-1", "xhigh")).toBe(
      "claude-fable-5-1-thinking-xhigh",
    );
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

  it("maps Cursor-specific families to concrete catalog ids", () => {
    expect(resolveCursorComposerModel("grok-4.6", "low")).toBe("cursor-grok-4.6-low");
    expect(resolveCursorComposerModel("grok-4.6", "xhigh")).toBe("cursor-grok-4.6-xhigh");
    expect(resolveCursorComposerModel("grok-4.6", "max")).toBe("cursor-grok-4.6-xhigh");
    expect(resolveCursorComposerModel("gemini-3.8-flash", "high")).toBe("gemini-3.8-flash-high");
  });

  it("clamps gpt-5.5 to extra-high for xhigh/max instead of emitting rejected ids", () => {
    expect(resolveCursorComposerModel("gpt-5.5", "xhigh")).toBe("gpt-5.5-extra-high");
    expect(resolveCursorComposerModel("gpt-5.5", "max")).toBe("gpt-5.5-extra-high");
    expect(resolveCursorComposerModel("gpt-5.5", "low")).toBe("gpt-5.5-low");
    expect(resolveCursorComposerModel("gpt-5.5", "high")).toBe("gpt-5.5-high");
  });

  it("defaults to medium when the level is missing or foreign", () => {
    expect(resolveCursorComposerModel("opus-5", undefined)).toBe("claude-opus-5-thinking-medium");
    expect(resolveCursorComposerModel("opus-5", "auto")).toBe("claude-opus-5-thinking-medium");
  });
});
