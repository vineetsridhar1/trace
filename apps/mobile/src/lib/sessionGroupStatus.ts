import type { SessionGroupStatus } from "@trace/gql";
import type { ChipVariant } from "@/components/design-system";

/**
 * Map server `SessionGroupStatus` to the design-system `Chip` variant.
 * Centralized here so subsequent tickets reuse the same translation rather
 * than each list re-inventing the camelCase mapping.
 *
 * `archived` returns `null` because archived rows live in their own segment
 * and don't render a chip — the segment label already conveys the state.
 */
export function mapStatusToChipVariant(
  status: SessionGroupStatus | null | undefined,
): ChipVariant | null {
  switch (status) {
    case "in_progress":
      return "inProgress";
    case "needs_input":
      return "needsInput";
    case "in_review":
      return "inReview";
    case "merged":
      return "merged";
    case "failed":
    case "stopped":
      return "failed";
    default:
      return null;
  }
}

export const CHIP_LABELS: Record<ChipVariant, string> = {
  inProgress: "In progress",
  needsInput: "Needs input",
  inReview: "In review",
  done: "Done",
  failed: "Failed",
  merged: "Merged",
};
