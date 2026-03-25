/**
 * Shared cost estimation utilities for the agent runtime.
 *
 * Used by pipeline.ts and summary-worker.ts to estimate LLM call costs
 * in cents based on model name and token counts.
 */

/** Cost per token in dollars, keyed by model name prefix. */
const MODEL_COST_MAP: Record<string, { input: number; output: number }> = {
  "claude-haiku": { input: 0.00000025, output: 0.00000125 },
  "claude-sonnet": { input: 0.000003, output: 0.000015 },
  "claude-opus": { input: 0.000015, output: 0.000075 },
};

const DEFAULT_COST = { input: 0.00000025, output: 0.00000125 }; // Haiku fallback

/**
 * Estimate cost in cents for an LLM call based on model name and token usage.
 * Matches the model name against known prefixes; falls back to Haiku pricing.
 */
export function estimateCostCents(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const match = Object.entries(MODEL_COST_MAP).find(([prefix]) =>
    model.startsWith(prefix),
  );
  const rates = match ? match[1] : DEFAULT_COST;
  return (inputTokens * rates.input + outputTokens * rates.output) * 100;
}
