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
import { useReviewUiStore } from "../../stores/review-ui";
import { useWorkspaceSidebarStore } from "../../stores/workspace-sidebar";
import { ReviewChangesView } from "./ReviewChangesView";
import { ReviewEmptyState } from "./ReviewEmptyState";
import { ReviewGuideView } from "./ReviewGuideView";
import { ReviewHeader } from "./ReviewHeader";
import { ReviewLoadingState } from "./ReviewLoadingState";
import { ReviewSubmissionSheet } from "./ReviewSubmissionSheet";
import { fetchReview, mutateReview } from "./review-operations";

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
const CREATE_THREAD = gql`
  mutation CreateReviewThread($input: CreateReviewThreadInput!) {
    createReviewThread(input: $input) {
      id
    }
  }
`;

export function ReviewTab({
  reviewId,
  sessionGroupId,
  active,
}: {
  reviewId: string;
  sessionGroupId: string;
  active: boolean;
}) {
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
  const threads = useMemo(
    () =>
      (Object.values(reviewThreads) as ReviewThreadType[]).filter(
        (thread) => thread.reviewId === reviewId,
      ),
    [reviewId, reviewThreads],
  );
  const guideInquiries = useMemo(
    () =>
      (Object.values(reviewInquiries) as ReviewInquiry[])
        .filter(
          (inquiry) => inquiry.reviewId === reviewId && inquiry.sourceKind === "guide_generation",
        )
        .sort((a, b) => a.position - b.position),
    [reviewId, reviewInquiries],
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

  const view = ui?.view ?? "changes";
  const snapshotThreads = threads.filter(
    (thread) => thread.originSnapshotId === snapshot.id && thread.scope !== "guide_explanation",
  );
  const selectedCount = snapshotThreads.filter(
    (thread) => thread.deliveryStatus === "selected",
  ).length;
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
    <div className="relative flex h-full min-w-0 flex-col overflow-hidden bg-[#141414]">
      <ReviewHeader
        review={review}
        snapshot={snapshot}
        view={view}
        refreshing={refreshing}
        selectedThreadCount={selectedCount}
        onView={(next) => patchUi(reviewId, { view: next })}
        onRefresh={() => void refresh()}
        onSubmit={() => setSubmissionOpen(true)}
      />
      <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
        {view === "changes" ? (
          <ReviewChangesView
            reviewId={reviewId}
            snapshotId={snapshot.id}
            files={snapshot.files}
            threads={snapshotThreads}
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
            onCommentOnChapter={(chapterId) =>
              void mutateReview(CREATE_THREAD, {
                input: {
                  reviewId,
                  snapshotId: snapshot.id,
                  scope: "guide_explanation",
                  body: "",
                  guideChapterId: chapterId,
                },
              }).catch((reason) =>
                toast.error(reason instanceof Error ? reason.message : "Comment failed"),
              )
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
        threads={threads}
      />
    </div>
  );
}
