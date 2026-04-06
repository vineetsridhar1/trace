import type { AiBranchEntity } from "../../../stores/entity";

/**
 * Truncates text at a word boundary within the given max length.
 * Returns the truncated text with "..." appended if it was shortened.
 */
export function truncateAtWord(text: string, maxLength: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxLength) return trimmed;

  const truncated = trimmed.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(" ");
  const cutPoint = lastSpace > 0 ? lastSpace : maxLength;
  return trimmed.slice(0, cutPoint) + "...";
}

/**
 * Resolves the display label for a branch.
 * Priority: explicit label > truncated first turn content > fallback "New branch".
 */
export function getBranchDisplayLabel(
  branch: Pick<AiBranchEntity, "label">,
  firstTurnContent?: string,
): string {
  if (branch.label) return branch.label;
  if (firstTurnContent) return truncateAtWord(firstTurnContent, 30);
  return "New branch";
}
