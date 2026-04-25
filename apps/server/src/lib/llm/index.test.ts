import { describe, expect, it } from "vitest";
import { AnthropicAdapter } from "./anthropic.js";
import { createLLMAdapter, providerForModel } from "./index.js";
import { OpenAIAdapter } from "./openai.js";

describe("llm adapter selection", () => {
  it("routes gpt and o-series models to openai", () => {
    expect(providerForModel("gpt-5.5")).toBe("openai");
    expect(providerForModel("o3-mini")).toBe("openai");
    expect(providerForModel("o4")).toBe("openai");
  });

  it("routes all other models to anthropic", () => {
    expect(providerForModel("claude-sonnet-4-20250514")).toBe("anthropic");
  });

  it("creates an anthropic adapter", () => {
    const adapter = createLLMAdapter({ provider: "anthropic", apiKey: "a-key" });

    expect(adapter).toBeInstanceOf(AnthropicAdapter);
  });

  it("creates an openai adapter", () => {
    const adapter = createLLMAdapter({ provider: "openai", apiKey: "o-key" });

    expect(adapter).toBeInstanceOf(OpenAIAdapter);
  });
});
