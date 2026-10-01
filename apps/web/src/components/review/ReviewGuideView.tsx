import { useMemo } from "react";
import { gql } from "@urql/core";
import type { ReviewFile, ReviewGuide, ReviewInquiry } from "@trace/gql";
import { BookOpen, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../ui/button";
import { ReviewEmptyState } from "./ReviewEmptyState";
import { mutateReview } from "./review-operations";
import { GuideGeneratingState } from "./guide/GuideGeneratingState";
import { GuideScroller } from "./guide/GuideScroller";
import { normalizeGuideContent, type GuideAnchor } from "./guide/guide-content";

const GENERATE = gql`
  mutation GenerateReviewGuide($input: EnqueueReviewInquiryInput!) {
    enqueueReviewInquiry(input: $input) {
      id
      state
      position
    }
  }
`;

interface ReviewGuideViewProps {
  reviewId: string;
  snapshotId: string;
  files: ReviewFile[];
  guide?: ReviewGuide | null;
  generating: boolean;
  lastFailure?: ReviewInquiry | null;
  onOpenInChanges(anchor: GuideAnchor): void;
  onAskAboutChapter(chapterId: string): void;
  onCommentOnChapter(chapterId: string): void;
  onReviewAllChanges(): void;
}

export function ReviewGuideView({
  reviewId,
  snapshotId,
  files,
  guide,
  generating,
  lastFailure,
  onOpenInChanges,
  onAskAboutChapter,
  onCommentOnChapter,
  onReviewAllChanges,
}: ReviewGuideViewProps) {
  const content = useMemo(() => normalizeGuideContent(guide?.content), [guide?.content]);

  const generate = async () => {
    try {
      await mutateReview(GENERATE, {
        input: {
          reviewId,
          snapshotId,
          sourceKind: "guide_generation",
          question: "Generate an explanation-first Guide for this immutable review snapshot.",
          context: {},
        },
      });
      toast.success("Guide generation queued");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not queue Guide generation");
    }
  };

  if (generating) return <GuideGeneratingState fileCount={files.length} />;

  if (!guide && lastFailure)
    return (
      <ReviewEmptyState
        title="Guide didn't validate"
        description={`${lastFailure.error ?? "The session's response did not match the Guide contract."} Nothing was saved.`}
        tone="warning"
        actionLabel="Regenerate"
        onAction={() => void generate()}
      />
    );

  if (!guide)
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center bg-[#141414] p-8">
        <div className="max-w-sm text-center">
          <BookOpen className="mx-auto text-muted-foreground" size={30} />
          <h3 className="mt-3 text-sm font-semibold text-[#ededef]">
            Understand the change before reviewing it
          </h3>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            The attached coding session writes a chaptered walkthrough of this snapshot. It runs
            through the same Review Chat queue as your questions.
          </p>
          <Button className="mt-4" onClick={() => void generate()}>
            <Sparkles size={13} />
            Generate Guide
          </Button>
        </div>
      </div>
    );

  if (content.chapters.length === 0)
    return (
      <ReviewEmptyState
        title="This Guide has no chapters"
        description="The saved Guide could not be read. Regenerate it against the current snapshot."
        tone="warning"
        actionLabel="Regenerate"
        onAction={() => void generate()}
      />
    );

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {guide.status === "earlier" ? (
        <div className="shrink-0 border-b border-[#fbbf24]/20 bg-[#fbbf24]/[0.07] px-4 py-2 text-[11.5px] text-[#fcd34d]">
          This Guide was written for an earlier commit of the PR. Regenerate it to match the latest.
        </div>
      ) : null}
      <GuideScroller
        snapshotId={snapshotId}
        content={content}
        files={files}
        onOpenInChanges={onOpenInChanges}
        onAskAboutChapter={onAskAboutChapter}
        onCommentOnChapter={onCommentOnChapter}
        onReviewAllChanges={onReviewAllChanges}
      />
    </div>
  );
}
