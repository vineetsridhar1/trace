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
  it("exposes Fable 5 as an option while defaulting Claude Code to Opus 5 (1M)", () => {
    expect(getDefaultModel("claude_code")).toBe("claude-opus-5[1m]");
    expect(getModelsForTool("claude_code")).toEqual([
      { value: "claude-fable-5", label: "Fable 5" },
      { value: "claude-sonnet-5", label: "Sonnet 5" },
      { value: "claude-opus-5", label: "Opus 5" },
      { value: "claude-opus-5[1m]", label: "Opus 5 (1M)" },
    ]);
    expect(isSupportedModel("claude_code", "claude-fable-5")).toBe(true);
    expect(isSupportedModel("claude_code", "claude-opus-5[1m]")).toBe(true);
    expect(isSupportedModel("claude_code", "claude-opus-unknown")).toBe(false);
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
    expect(getModelProviderForModel("pi", "openai/gpt-5.5")?.value).toBe(
      "openai",
    );
  });

  it("limits Grok 4.5 effort options to the levels Cursor exposes", () => {
    expect(getReasoningEffortsForTool("cursor_composer", "grok-4.5")).toEqual([
      { value: "low", label: "Low" },
      { value: "medium", label: "Medium" },
      { value: "high", label: "High" },
    ]);
    expect(isSupportedReasoningEffort("cursor_composer", "low", "grok-4.5")).toBe(true);
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
    expect(resolveCursorComposerModel("opus-5", "low")).toBe("claude-opus-5-thinking-low");
    expect(resolveCursorComposerModel("opus-5", "max")).toBe("claude-opus-5-thinking-max");
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
    expect(resolveCursorComposerModel("grok-4.5", "low")).toBe("cursor-grok-4.5-low");
    expect(resolveCursorComposerModel("grok-4.5", "medium")).toBe("cursor-grok-4.5-medium");
    expect(resolveCursorComposerModel("grok-4.5", "high")).toBe("cursor-grok-4.5-high");
    expect(resolveCursorComposerModel("grok-4.5", "xhigh")).toBe("cursor-grok-4.5-high");
    expect(resolveCursorComposerModel("grok-4.5", "max")).toBe("cursor-grok-4.5-high");
  });

  it("clamps gpt-5.5 to extra-high for xhigh/max instead of emitting rejected ids", () => {
    expect(resolveCursorComposerModel("gpt-5.5", "xhigh")).toBe("gpt-5.5-extra-high");
    expect(resolveCursorComposerModel("gpt-5.5", "max")).toBe("gpt-5.5-extra-high");
    expect(resolveCursorComposerModel("gpt-5.5", "low")).toBe("gpt-5.5-low");
    expect(resolveCursorComposerModel("gpt-5.5", "high")).toBe("gpt-5.5-high");
  });

  it("defaults to medium when the level is missing or foreign", () => {
    expect(resolveCursorComposerModel("opus-5", undefined)).toBe(
      "claude-opus-5-thinking-medium",
    );
    expect(resolveCursorComposerModel("opus-5", "auto")).toBe(
      "claude-opus-5-thinking-medium",
    );
  });
});
