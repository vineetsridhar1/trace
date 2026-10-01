import { useCallback, useEffect, useMemo, useState } from "react";
import { gql } from "@urql/core";
import { useEntityStore } from "@trace/client-core";
import type {
  Review,
  ReviewGuide,
  ReviewInquiry,
  ReviewThread as ReviewThreadType,
} from "@trace/gql";
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
import { useSidebar } from "../ui/sidebar";
import { isPendingGitHubThread } from "./review-delivery";

const REFRESH = gql`
  mutation RefreshReviewSnapshot($reviewId: ID!) {
    refreshReviewSnapshot(reviewId: $reviewId) {
      id
    }
  }
`;
const ENQUEUE_INQUIRY = gql`
  mutation EnqueueReviewInquiry($input: EnqueueReviewInquiryInput!) {
    enqueueReviewInquiry(input: $input) {
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
  const closeFilesSidebar = useWorkspaceSidebarStore((state) => state.closeFiles);
  const { isMobile, setOpen, setOpenMobile } = useSidebar();
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [submissionOpen, setSubmissionOpen] = useState(false);

  const snapshot = review?.currentSnapshot ?? null;
  const snapshotId = snapshot?.id ?? "";
  const view = ui?.view ?? "changes";
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
    () =>
      (Object.values(reviewGuides) as ReviewGuide[])
        .filter(
          (candidate) => candidate.reviewId === reviewId && candidate.snapshotId === snapshot?.id,
        )
        .sort((a, b) => b.version - a.version)[0] ?? null,
    [reviewGuides, reviewId, snapshot?.id],
  );
  useEffect(() => {
    if (!active) return;
    if (view === "guide") {
      closeFilesSidebar();
      if (isMobile) setOpenMobile(false);
      else setOpen(false);
      return;
    }
    openFilesSidebar(sessionGroupId, "changes", reviewId);
    if (isMobile) setOpenMobile(true);
    else setOpen(true);
  }, [
    active,
    closeFilesSidebar,
    isMobile,
    openFilesSidebar,
    reviewId,
    sessionGroupId,
    setOpen,
    setOpenMobile,
    view,
  ]);

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

  const ask = useCallback(
    async (
      question: string,
      options?: {
        sourceKind?: "diff_anchor" | "guide_anchor" | "thread";
        context?: Record<string, unknown>;
      },
    ) => {
      if (!snapshot) return;
      try {
        await mutateReview(ENQUEUE_INQUIRY, {
          input: {
            reviewId,
            snapshotId: snapshot.id,
            sourceKind: options?.sourceKind ?? "thread",
            question,
            context: options?.context ?? {},
          },
        });
      } catch (reason) {
        toast.error(reason instanceof Error ? reason.message : "Could not queue the question");
      }
    },
    [reviewId, snapshot],
  );

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
            onAskAboutChapter={(chapterId) =>
              void ask("Explain this Guide chapter in more depth.", {
                sourceKind: "guide_anchor",
                context: { guideChapterId: chapterId },
              })
            }
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
