import type { SessionGroupStatus, SessionStatus } from "@trace/gql";
import type { ChipVariant } from "@/components/design-system";
import type { Theme } from "@/theme";

/**
 * Color used by the leading status dot/spinner/X on a session row, and by
 * the section header pill. Mirrors the web `sessionStatusColor` map so the
 * two platforms read the same.
 */
export function statusIndicatorColor(
  theme: Theme,
  status: SessionGroupStatus | SessionStatus | null | undefined,
): string {
  switch (status) {
    case "needs_input":
      return theme.colors.statusNeedsInput;
    case "in_review":
      return theme.colors.statusInReview;
    case "in_progress":
      return theme.colors.statusActive;
    case "failed":
      return theme.colors.statusFailed;
    case "merged":
      return theme.colors.statusMerged;
    case "stopped":
    case "archived":
    default:
      return theme.colors.dimForeground;
  }
}

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
