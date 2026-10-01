import type { ReviewGuide } from "@trace/gql";

/** Prefer the current diff's Guide, retaining the latest saved walkthrough until it is replaced. */
export function selectReviewGuide(
  guides: ReviewGuide[],
  reviewId: string,
  snapshotId: string,
): ReviewGuide | null {
  const candidates = guides
    .filter((guide) => guide.reviewId === reviewId)
    .sort((a, b) => {
      const current = Number(b.snapshotId === snapshotId) - Number(a.snapshotId === snapshotId);
      if (current) return current;
      // Versions restart for each snapshot, so compare dates across snapshots.
      return Date.parse(b.createdAt) - Date.parse(a.createdAt) || b.version - a.version;
    });
  return candidates[0] ?? null;
}
