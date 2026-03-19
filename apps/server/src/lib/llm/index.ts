import type { LLMAdapter } from "@trace/shared";
import { AnthropicAdapter } from "./anthropic.js";
import { OpenAIAdapter } from "./openai.js";

export type LLMProvider = "anthropic" | "openai";

export function providerForModel(model: string): LLMProvider {
  if (/^(gpt-|o1|o3|o4)/i.test(model)) {
    return "openai";
  }
  return "anthropic";
}

export function createLLMAdapter(params: {
  provider: LLMProvider;
  apiKey: string;
}): LLMAdapter {
  switch (params.provider) {
    case "anthropic":
      return new AnthropicAdapter(params.apiKey);
    case "openai":
      return new OpenAIAdapter(params.apiKey);
  }
}
