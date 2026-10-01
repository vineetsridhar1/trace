import type { ReviewThread } from "@trace/gql";

type DeliveryCandidate = Pick<
  ReviewThread,
  "scope" | "deliveryStatus" | "providerReviewId" | "providerCommentId" | "anchor" | "comments"
>;

/**
 * Mirrors the server's submission rule so the header and dialog never offer a thread that
 * `submitReviewToProvider` would reject. Kept in lockstep with `threadAppliesToSnapshot` and
 * `hasProviderDelivery` in `apps/server/src/services/review.ts`.
 */
export function isPendingGitHubThread(thread: DeliveryCandidate, snapshotId: string): boolean {
  const alreadyOnGitHub =
    thread.deliveryStatus === "delivered" ||
    !!thread.providerReviewId ||
    !!thread.providerCommentId ||
    thread.comments.some((comment) => !!comment.providerCommentId);
  const hasComment = thread.comments.some(
    (comment) => !comment.deletedAt && comment.body.trim().length > 0,
  );
  // An unanchored review-level comment is not tied to code, so a new snapshot cannot outdate it.
  const appliesToSnapshot = thread.anchor
    ? thread.anchor.snapshotId === snapshotId && thread.anchor.status !== "outdated"
    : true;

  return (
    appliesToSnapshot && thread.scope !== "guide_explanation" && hasComment && !alreadyOnGitHub
  );
}
