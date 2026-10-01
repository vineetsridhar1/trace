import { useEffect, useMemo, useState } from "react";
import { gql } from "@urql/core";
import { useEntityStore } from "@trace/client-core";
import type { Review, ReviewGuide, ReviewInquiry, ReviewThread } from "@trace/gql";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useReviewUiStore } from "../../stores/review-ui";
import { ReviewChangesView } from "./ReviewChangesView";
import { ReviewChatPanel } from "./ReviewChatPanel";
import { ReviewGuideView } from "./ReviewGuideView";
import { ReviewHeader } from "./ReviewHeader";
import { ReviewSubmissionSheet } from "./ReviewSubmissionSheet";
import { fetchReview, mutateReview } from "./review-operations";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";

const REFRESH = gql`
  mutation RefreshReviewSnapshot($reviewId: ID!) {
    refreshReviewSnapshot(reviewId: $reviewId) {
      id
    }
  }
`;
const CREATE_GENERAL_THREAD = gql`
  mutation CreateGeneralReviewThread($input: CreateReviewThreadInput!) {
    createReviewThread(input: $input) {
      id
    }
  }
`;

export function ReviewTab({ reviewId }: { reviewId: string }) {
  const review = useEntityStore((state) => state.reviews[reviewId]) as Review | undefined;
  const threads = useEntityStore((state) =>
    Object.values(state.reviewThreads).filter((thread) => thread.reviewId === reviewId),
  ) as ReviewThread[];
  const inquiries = useEntityStore((state) =>
    Object.values(state.reviewInquiries)
      .filter((inquiry) => inquiry.reviewId === reviewId)
      .sort((a, b) => a.position - b.position),
  ) as ReviewInquiry[];
  const guides = useEntityStore((state) =>
    Object.values(state.reviewGuides).filter((guide) => guide.reviewId === reviewId),
  ) as ReviewGuide[];
  const ui = useReviewUiStore((state) => state.byReviewId[reviewId]);
  const patchUi = useReviewUiStore((state) => state.patch);
  const navigate = useReviewUiStore((state) => state.navigate);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [submissionOpen, setSubmissionOpen] = useState(false);
  const [generalCommentOpen, setGeneralCommentOpen] = useState(false);
  const [generalComment, setGeneralComment] = useState("");

  useEffect(() => {
    void fetchReview(reviewId).catch((reason: unknown) =>
      setError(reason instanceof Error ? reason.message : String(reason)),
    );
  }, [reviewId]);
  useEffect(() => {
    if (review?.currentSnapshotId && !ui?.snapshotId)
      patchUi(reviewId, {
        snapshotId: review.currentSnapshotId,
        activeFilePath: review.currentSnapshot?.files[0]?.path ?? null,
      });
  }, [patchUi, review, reviewId, ui?.snapshotId]);

  const snapshot =
    review?.snapshots.find(
      (candidate) => candidate.id === (ui?.snapshotId ?? review.currentSnapshotId),
    ) ?? review?.currentSnapshot;
  const guide = useMemo(
    () =>
      guides
        .filter((candidate) => candidate.snapshotId === snapshot?.id)
        .sort((a, b) => b.version - a.version)[0] ?? null,
    [guides, snapshot?.id],
  );
  const generating = inquiries.some(
    (inquiry) =>
      inquiry.snapshotId === snapshot?.id &&
      inquiry.sourceKind === "guide_generation" &&
      (inquiry.state === "queued" || inquiry.state === "running"),
  );

  if (error)
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-destructive">
        <AlertTriangle size={16} />
        {error}
      </div>
    );
  if (!review || !snapshot) return <div className="h-full animate-pulse bg-muted/10" />;
  const view = ui?.view ?? "changes";
  const refresh = async () => {
    setRefreshing(true);
    try {
      await mutateReview(REFRESH, { reviewId });
      toast.success("Review snapshot checked");
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Refresh failed");
    } finally {
      setRefreshing(false);
    }
  };

  const newerSnapshotAvailable = review.currentSnapshotId !== snapshot.id;
  return (
    <div className="relative flex h-full min-w-0 flex-col overflow-hidden">
      <ReviewHeader
        review={review}
        snapshot={snapshot}
        snapshots={review.snapshots}
        view={view}
        refreshing={refreshing}
        onView={(next) => patchUi(reviewId, { view: next })}
        onRefresh={() => void refresh()}
        onSubmit={() => setSubmissionOpen(true)}
        onGeneralComment={() => setGeneralCommentOpen(true)}
        onSnapshot={(snapshotId) => {
          const next = review.snapshots.find((candidate) => candidate.id === snapshotId);
          patchUi(reviewId, {
            snapshotId,
            activeFilePath: next?.files[0]?.path ?? null,
            activeThreadId: null,
          });
        }}
      />
      {newerSnapshotAvailable ? (
        <button
          type="button"
          onClick={() =>
            patchUi(reviewId, {
              snapshotId: review.currentSnapshotId,
              activeFilePath: review.currentSnapshot?.files[0]?.path ?? null,
            })
          }
          className="border-b border-amber-500/30 bg-amber-950/30 px-4 py-2 text-left text-xs text-amber-200 hover:bg-amber-950/50"
        >
          New commits available — view latest snapshot
        </button>
      ) : null}
      <div className="flex min-h-0 flex-1">
        {view === "changes" ? (
          <ReviewChangesView
            reviewId={reviewId}
            snapshotId={snapshot.id}
            files={snapshot.files}
            threads={threads.filter((thread) => thread.originSnapshotId === snapshot.id)}
          />
        ) : (
          <ReviewGuideView
            reviewId={reviewId}
            snapshotId={snapshot.id}
            guide={guide}
            generating={generating}
            onOpenReference={(reference) =>
              navigate(reviewId, reference.filePath, reference.startLine)
            }
          />
        )}
        <ReviewChatPanel inquiries={inquiries} />
      </div>
      <ReviewSubmissionSheet
        open={submissionOpen}
        onOpenChange={setSubmissionOpen}
        reviewId={reviewId}
        snapshotId={snapshot.id}
        threads={threads}
      />
      <Dialog open={generalCommentOpen} onOpenChange={setGeneralCommentOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>General Trace review comment</DialogTitle>
          </DialogHeader>
          <textarea
            value={generalComment}
            onChange={(event) => setGeneralComment(event.target.value)}
            className="h-28 resize-none rounded-md border border-border bg-background p-2 text-sm"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setGeneralCommentOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!generalComment.trim()}
              onClick={() =>
                void mutateReview(CREATE_GENERAL_THREAD, {
                  input: {
                    reviewId,
                    snapshotId: snapshot.id,
                    scope: "general",
                    body: generalComment.trim(),
                  },
                })
                  .then(() => {
                    setGeneralComment("");
                    setGeneralCommentOpen(false);
                    toast.success("Comment saved in Trace");
                  })
                  .catch((reason) =>
                    toast.error(reason instanceof Error ? reason.message : "Comment failed"),
                  )
              }
            >
              Save in Trace
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
