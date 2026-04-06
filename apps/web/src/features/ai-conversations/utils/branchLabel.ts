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
