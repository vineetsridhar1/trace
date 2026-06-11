/** Format a token count compactly: 950 → "950", 12_400 → "12.4k", 3_200_000 → "3.2M". */
export function formatTokens(tokens: number): string {
  if (tokens < 1_000) return String(tokens);
  if (tokens < 1_000_000) return `${(tokens / 1_000).toFixed(1)}k`;
  return `${(tokens / 1_000_000).toFixed(1)}M`;
}

/** Format a USD cost: <$0.01 shows "<$0.01", otherwise two decimals. */
export function formatCostUsd(costUsd: number): string {
  if (costUsd > 0 && costUsd < 0.01) return "<$0.01";
  return `$${costUsd.toFixed(2)}`;
}
