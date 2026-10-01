import { useCallback, useEffect, useMemo, useState } from "react";
import { useEntityField } from "@trace/client-core";
import { gql } from "@urql/core";
import type { ReviewFile, ReviewGuide, ReviewInquiry } from "@trace/gql";
import { BookOpen, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../ui/button";
import { ReviewEmptyState } from "./ReviewEmptyState";
import { ReviewInlineComposer, type ReviewComposerTarget } from "./ReviewInlineComposer";
import { selectionRangeLabel, type ReviewLineSelection } from "./review-selection";
import { mutateReview } from "./review-operations";
import { GuideGeneratingState } from "./guide/GuideGeneratingState";
import { guideSourceUrl } from "./guide/guide-source";
import { GuideScroller } from "./guide/GuideScroller";
import { normalizeGuideContent, type GuideAnchor } from "./guide/guide-content";

const CREATE_THREAD = gql`
  mutation CreateReviewGuideThread($input: CreateReviewThreadInput!) {
    createReviewThread(input: $input) {
      id
    }
  }
`;
const ENQUEUE_INQUIRY = gql`
  mutation EnqueueGuideInquiry($input: EnqueueReviewInquiryInput!) {
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
  onReviewAllChanges,
}: ReviewGuideViewProps) {
  const guideSnapshotId = guide?.snapshotId ?? snapshotId;
  const guideFiles = useEntityField("reviewSnapshots", guideSnapshotId, "files");
  const pullRequestUrl = useEntityField("reviews", reviewId, "pullRequestUrl");
  const headSha = useEntityField("reviewSnapshots", guideSnapshotId, "headSha");
  const openReference = useCallback(
    (anchor: GuideAnchor) => {
      const url = guideSourceUrl(pullRequestUrl ?? "", headSha ?? "", anchor);
      if (url) window.open(url, "_blank", "noopener,noreferrer");
      else toast.error("Source link is unavailable for this reference");
    },
    [pullRequestUrl, headSha],
  );
  const content = useMemo(() => normalizeGuideContent(guide?.content), [guide?.content]);
  const [composer, setComposer] = useState<ReviewComposerTarget | null>(null);
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setComposer(null);
    setBody("");
  }, [guide?.id, guideSnapshotId]);

  const openComposer = useCallback(
    (chapterId: string, kind: ReviewComposerTarget["kind"]) => {
      setBody("");
      setComposer({
        kind,
        scope: "guide_explanation",
        guideChapterId: chapterId,
        label:
          content.chapters.find((chapter) => chapter.id === chapterId)?.title ?? "Guide chapter",
      });
    },
    [content.chapters],
  );

  const openCodeComposer = useCallback(
    (chapterId: string, kind: ReviewComposerTarget["kind"], anchor: ReviewLineSelection) => {
      setBody("");
      setComposer({
        kind,
        scope: "line",
        guideChapterId: chapterId,
        anchor,
        label: `${anchor.filePath} · ${selectionRangeLabel({ side: anchor.side, start: anchor.startLine, end: anchor.endLine })}`,
      });
    },
    [],
  );

  const submit = async () => {
    if (!composer?.guideChapterId || !body.trim() || submitting) return;
    setSubmitting(true);
    try {
      if (composer.kind === "ask") {
        await mutateReview(ENQUEUE_INQUIRY, {
          input: {
            reviewId,
            snapshotId: guideSnapshotId,
            sourceKind: composer.anchor ? "diff_anchor" : "guide_anchor",
            question: body.trim(),
            ...(composer.anchor
              ? { anchor: { snapshotId: guideSnapshotId, ...composer.anchor } }
              : {}),
            context: {
              guideId: guide?.id,
              guideChapterId: composer.guideChapterId,
              ...(composer.anchor
                ? {
                    selectedText: composer.anchor.selectedText,
                    surroundingContext: composer.anchor.context,
                  }
                : {}),
            },
          },
        });
        toast.success(
          composer.anchor ? "Question queued for these lines" : "Question queued for this chapter",
        );
      } else {
        await mutateReview(CREATE_THREAD, {
          input: {
            reviewId,
            snapshotId: guideSnapshotId,
            scope: composer.scope,
            ...(composer.anchor
              ? { anchor: { snapshotId: guideSnapshotId, ...composer.anchor } }
              : {}),
            body: body.trim(),
            guideChapterId: composer.guideChapterId,
          },
        });
      }
      setBody("");
      setComposer(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not submit");
    } finally {
      setSubmitting(false);
    }
  };

  const generate = async () => {
    if (generating) return;
    try {
      await mutateReview(ENQUEUE_INQUIRY, {
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

  if (generating && !guide) return <GuideGeneratingState fileCount={files.length} />;

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
      <div className="flex min-h-0 flex-1 items-center justify-center bg-[var(--th-review-canvas)] p-8">
        <div className="max-w-sm text-center">
          <BookOpen className="mx-auto text-muted-foreground" size={30} />
          <h3 className="mt-3 text-sm font-semibold text-[var(--th-review-text)]">
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
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
      {guideSnapshotId !== snapshotId ? (
        <div className="flex shrink-0 items-center gap-3 border-b border-[var(--th-warn)]/20 bg-[var(--th-warn)]/[0.07] px-4 py-2 text-xs text-[var(--th-review-warn-light)]">
          <span className="min-w-0 flex-1">
            The diff has changed since this Guide was generated. You can still read it, but it may
            need regeneration.
          </span>
          <Button variant="ghost" size="sm" disabled={generating} onClick={() => void generate()}>
            Regenerate Guide
          </Button>
        </div>
      ) : null}
      {generating ? (
        <div
          role="status"
          className="shrink-0 border-b border-border px-4 py-2 text-xs text-muted-foreground"
        >
          Generating an updated Guide… You can keep reading this one.
        </div>
      ) : lastFailure && guideSnapshotId !== snapshotId ? (
        <div
          role="status"
          className="shrink-0 border-b border-border px-4 py-2 text-xs text-muted-foreground"
        >
          Guide regeneration failed. Your saved Guide is still available.
        </div>
      ) : null}
      <GuideScroller
        reviewId={reviewId}
        guideId={guide.id}
        snapshotId={guideSnapshotId}
        content={content}
        files={guideFiles ?? files}
        onOpenInChanges={guideSnapshotId === snapshotId ? onOpenInChanges : openReference}
        onOpenReference={openReference}
        onCodeAction={openCodeComposer}
        onAskAboutChapter={(chapterId) => openComposer(chapterId, "ask")}
        onCommentOnChapter={(chapterId) => openComposer(chapterId, "comment")}
        onReviewAllChanges={onReviewAllChanges}
        onRegenerate={() => void generate()}
      />
      {composer ? (
        <ReviewInlineComposer
          target={composer}
          body={body}
          submitting={submitting}
          onBody={setBody}
          onCancel={() => setComposer(null)}
          onSubmit={() => void submit()}
        />
      ) : null}
    </div>
  );
}
