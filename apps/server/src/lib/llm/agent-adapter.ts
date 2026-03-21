/**
 * Lightweight LLM adapter for the agent worker process.
 *
 * Unlike the user-facing AIService (which looks up per-user API keys),
 * the agent uses a server-level ANTHROPIC_API_KEY from the environment.
 * Returns a cached singleton — safe to call repeatedly.
 */

import type { LLMAdapter } from "@trace/shared";
import { AnthropicAdapter } from "./anthropic.js";

/** Default model for summary generation — cheap and fast. */
export const SUMMARY_MODEL = "claude-haiku-4-5-20241022";

let cachedAdapter: LLMAdapter | null = null;

/**
 * Get the shared LLM adapter for agent background work.
 * Reads ANTHROPIC_API_KEY from process.env on first call.
 */
export function getAgentLLMAdapter(): LLMAdapter {
  if (cachedAdapter) return cachedAdapter;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is required for agent summary generation. " +
        "Set it in your environment or .env file.",
    );
  }

  cachedAdapter = new AnthropicAdapter(apiKey);
  return cachedAdapter;
}
