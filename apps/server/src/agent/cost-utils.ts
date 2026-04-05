/**
 * Shared cost estimation utilities for the agent runtime.
 *
 * Used by pipeline.ts and summary-worker.ts to estimate LLM call costs
 * in cents based on model name and token counts.
 */

/** Cost per token in dollars, matched by most-specific model prefix first. */
const MODEL_COST_PREFIXES: Array<[string, { input: number; output: number }]> = [
  // Claude Haiku 4.5 uses higher pricing than older generic Haiku snapshots.
  ["claude-haiku-4-5", { input: 0.000001, output: 0.000005 }],
  ["claude-haiku", { input: 0.00000025, output: 0.00000125 }],
  ["claude-sonnet", { input: 0.000003, output: 0.000015 }],
  ["claude-opus", { input: 0.000015, output: 0.000075 }],
];

const DEFAULT_COST = { input: 0.00000025, output: 0.00000125 }; // Generic Haiku fallback

/**
 * Estimate cost in cents for an LLM call based on model name and token usage.
 * Matches the model name against known prefixes; falls back to Haiku pricing.
 */
export function estimateCostCents(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const match = MODEL_COST_PREFIXES.find(([prefix]) =>
    model.startsWith(prefix),
  );
  const rates = match ? match[1] : DEFAULT_COST;
  return (inputTokens * rates.input + outputTokens * rates.output) * 100;
}
