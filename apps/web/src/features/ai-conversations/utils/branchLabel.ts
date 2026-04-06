import type { AiBranchEntity } from "../../../stores/entity";

/**
 * Returns a display label for a branch.
 * Prefers the user-set label, falls back to "Branch {depth}" or "Main" for root.
 */
export function getBranchDisplayLabel(branch: {
  label: string | null;
  depth: number;
}): string {
  if (branch.label) return branch.label;
  if (branch.depth === 0) return "Main";
  return `Branch ${branch.depth}`;
}

/** Truncate text at a word boundary for compact branch labels in dense UI surfaces. */
export function truncateAtWord(text: string, max = 30): string {
  if (text.length <= max) return text;
  const truncated = text.slice(0, max);
  const lastSpace = truncated.lastIndexOf(" ");
  return `${lastSpace > 10 ? truncated.slice(0, lastSpace) : truncated}...`;
}
