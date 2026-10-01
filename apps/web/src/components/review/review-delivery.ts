import type { ReviewThread } from "@trace/gql";

type DeliveryCandidate = Pick<
  ReviewThread,
  | "originSnapshotId"
  | "scope"
  | "deliveryStatus"
  | "providerReviewId"
  | "providerCommentId"
  | "comments"
>;

export function isPendingGitHubThread(thread: DeliveryCandidate, snapshotId: string): boolean {
  const alreadyOnGitHub =
    thread.deliveryStatus === "delivered" ||
    !!thread.providerReviewId ||
    !!thread.providerCommentId ||
    thread.comments.some((comment) => !!comment.providerCommentId);
  const hasComment = thread.comments.some(
    (comment) => !comment.deletedAt && comment.body.trim().length > 0,
  );

  return (
    thread.originSnapshotId === snapshotId &&
    thread.scope !== "guide_explanation" &&
    hasComment &&
    !alreadyOnGitHub
  );
}
