import { describe, expect, it } from "vitest";
import {
  getDefaultModel,
  getDefaultReasoningEffort,
  getModelsForTool,
  isSupportedModel,
  isSupportedReasoningEffort,
} from "../src/models.js";

describe("model catalog", () => {
  it("exposes Pi-backed Codex models and defaults", () => {
    expect(getDefaultModel("pi")).toBe("openai-codex/gpt-5.5");
    expect(getDefaultReasoningEffort("pi")).toBe("medium");
    expect(getModelsForTool("pi")).toContainEqual({
      value: "openai-codex/gpt-5.5",
      label: "Codex GPT-5.5 via Pi",
    });
    expect(getModelsForTool("pi")).toContainEqual({
      value: "openai-codex/gpt-5.4-mini",
      label: "Codex GPT-5.4 Mini via Pi",
    });
    expect(getModelsForTool("pi")).toContainEqual({
      value: "anthropic/claude-sonnet-4-6",
      label: "Claude Sonnet 4.6 via Pi",
    });
    expect(isSupportedModel("pi", "openai-codex/gpt-5.3-codex")).toBe(true);
    expect(isSupportedModel("pi", "anthropic/claude-opus-4-7")).toBe(true);
    expect(isSupportedReasoningEffort("pi", "high")).toBe(true);
  });
});
