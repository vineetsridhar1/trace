import { useCallback, useEffect, useMemo, useState } from "react";
import { gql } from "@urql/core";
import { useEntityStore } from "@trace/client-core";
import type { Review, ReviewInquiry, ReviewThread as ReviewThreadType } from "@trace/gql";
import { toast } from "sonner";
import { useReviewEvents } from "../../hooks/useReviewEvents";
import { useReviewUiStore } from "../../stores/review-ui";
import { useWorkspaceSidebarStore } from "../../stores/workspace-sidebar";
import { ReviewChangesView } from "./ReviewChangesView";
import { ReviewEmptyState } from "./ReviewEmptyState";
import { ReviewGuideView } from "./ReviewGuideView";
import { ReviewHeader } from "./ReviewHeader";
import { ReviewLoadingState } from "./ReviewLoadingState";
import { ReviewSubmissionSheet } from "./ReviewSubmissionSheet";
import { fetchReview, mutateReview } from "./review-operations";
import { isPendingGitHubThread } from "./review-delivery";
import { selectReviewGuide } from "./guide/review-guide-selection";

const REFRESH = gql`
  mutation RefreshReviewSnapshot($reviewId: ID!) {
    refreshReviewSnapshot(reviewId: $reviewId) {
      id
    }
  }
`;

export function ReviewTab({
  reviewId,
  sessionGroupId,
  active,
  onOpenAttachedSession,
}: {
  reviewId: string;
  sessionGroupId: string;
  active: boolean;
  onOpenAttachedSession(): void;
}) {
  useReviewEvents(reviewId, active);
  const review = useEntityStore((state) => state.reviews[reviewId]) as Review | undefined;
  const reviewThreads = useEntityStore((state) => state.reviewThreads);
  const reviewInquiries = useEntityStore((state) => state.reviewInquiries);
  const reviewGuides = useEntityStore((state) => state.reviewGuides);
  const ui = useReviewUiStore((state) => state.byReviewId[reviewId]);
  const patchUi = useReviewUiStore((state) => state.patch);
  const navigate = useReviewUiStore((state) => state.navigate);
  const openFilesSidebar = useWorkspaceSidebarStore((state) => state.openFiles);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [submissionOpen, setSubmissionOpen] = useState(false);

  const snapshot = review?.currentSnapshot ?? null;
  const snapshotId = snapshot?.id ?? "";
  const threads = useMemo(
    () =>
      (Object.values(reviewThreads) as ReviewThreadType[]).filter(
        (thread) => thread.reviewId === reviewId,
      ),
    [reviewId, reviewThreads],
    );
  // Memoized rather than derived in the render body: this array is the `threads` prop of every
  // file card, so a fresh identity each render would invalidate their own memos.
  const snapshotThreads = useMemo(
    () =>
      threads.filter(
        (thread) =>
          thread.scope !== "guide_explanation" &&
          // An unanchored review-level comment is not tied to a snapshot, so it always shows.
          (!thread.anchor || thread.anchor.snapshotId === snapshotId),
      ),
    [snapshotId, threads],
  );
  const pendingThreads = useMemo(
    () =>
      snapshotId
        ? snapshotThreads.filter((thread) => isPendingGitHubThread(thread, snapshotId))
        : [],
    [snapshotId, snapshotThreads],
  );
  const inquiries = useMemo(
    () =>
      (Object.values(reviewInquiries) as ReviewInquiry[])
        .filter((inquiry) => inquiry.reviewId === reviewId)
        .sort((a, b) => a.position - b.position),
    [reviewId, reviewInquiries],
  );
  const guideInquiries = useMemo(
    () => inquiries.filter((inquiry) => inquiry.sourceKind === "guide_generation"),
    [inquiries],
  );
  const guide = useMemo(
    () => selectReviewGuide(Object.values(reviewGuides), reviewId, snapshotId),
    [reviewGuides, reviewId, snapshotId],
  );
  useEffect(() => {
    if (active) openFilesSidebar(sessionGroupId, "changes", reviewId);
  }, [active, openFilesSidebar, reviewId, sessionGroupId]);

  useEffect(() => {
    void fetchReview(reviewId).catch((reason: unknown) =>
      setError(reason instanceof Error ? reason.message : String(reason)),
    );
  }, [reviewId]);

  useEffect(() => {
    if (snapshot && !ui?.activeFilePath)
      patchUi(reviewId, { activeFilePath: snapshot.files[0]?.path ?? null });
  }, [patchUi, reviewId, snapshot, ui?.activeFilePath]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await mutateReview(REFRESH, { reviewId });
      await fetchReview(reviewId);
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Refresh failed");
    } finally {
      setRefreshing(false);
    }
  }, [reviewId]);

  if (error)
    return (
      <ReviewEmptyState
        title="Review unavailable"
        description={`${error} Your drafts and threads are safe in Trace.`}
        tone="error"
        actionLabel="Try again"
        onAction={() => {
          setError(null);
          void fetchReview(reviewId).catch((reason: unknown) =>
            setError(reason instanceof Error ? reason.message : String(reason)),
          );
        }}
      />
  );
  if (!review || !snapshot) return <ReviewLoadingState label="Loading review…" />;

  const view = ui?.view ?? "changes";
  const guideGenerating = guideInquiries.some(
    (inquiry) =>
      inquiry.snapshotId === snapshot.id &&
      (inquiry.state === "queued" || inquiry.state === "running"),
  );
  const guideFailure =
    guideInquiries
      .filter((inquiry) => inquiry.snapshotId === snapshot.id && inquiry.state === "failed")
      .at(-1) ?? null;

  return (
    <div className="relative flex h-full min-w-0 flex-col overflow-hidden bg-[var(--th-review-canvas)]">
      <ReviewHeader
        reviewId={reviewId}
        fileCount={snapshot.files.length}
        view={view}
        refreshing={refreshing}
        pendingThreadCount={pendingThreads.length}
        onView={(next) => patchUi(reviewId, { view: next })}
        onRefresh={() => void refresh()}
        onSubmit={() => setSubmissionOpen(true)}
        onOpenAttachedSession={onOpenAttachedSession}
      />
      <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
        {view === "changes" ? (
          <ReviewChangesView
            reviewId={reviewId}
            snapshotId={snapshot.id}
            title={review.title}
            description={review.description}
            pullRequestNumber={review.pullRequestNumber}
            files={snapshot.files}
            threads={snapshotThreads}
            inquiries={inquiries}
            onRefresh={() => void refresh()}
          />
        ) : (
          <ReviewGuideView
            reviewId={reviewId}
            snapshotId={snapshot.id}
            files={snapshot.files}
            guide={guide}
            generating={guideGenerating}
            lastFailure={guideFailure}
            onOpenInChanges={(anchor) => navigate(reviewId, anchor)}
            onReviewAllChanges={() => patchUi(reviewId, { view: "changes" })}
          />
        )}
      </div>
      <ReviewSubmissionSheet
        open={submissionOpen}
        onOpenChange={setSubmissionOpen}
        reviewId={reviewId}
        snapshotId={snapshot.id}
        headSha={snapshot.headSha}
        pullRequestNumber={review.pullRequestNumber}
        pullRequestUrl={review.pullRequestUrl}
        threads={pendingThreads}
      />
    </div>
  );
}
