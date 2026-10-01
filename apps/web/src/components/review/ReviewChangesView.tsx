import { useCallback, useEffect, useRef, useState } from "react";
import { gql } from "@urql/core";
import type { ReviewFile, ReviewThread as ReviewThreadType } from "@trace/gql";
import { toast } from "sonner";
import { useReviewUiStore } from "../../stores/review-ui";
import { ReviewFileDiff } from "./ReviewFileDiff";
import { ReviewEmptyState } from "./ReviewEmptyState";
import { ReviewInlineComposer, type ReviewComposerTarget } from "./ReviewInlineComposer";
import { mutateReview } from "./review-operations";
import type { ReviewLineSelection } from "./review-selection";

const CREATE_THREAD = gql`
  mutation CreateReviewThread($input: CreateReviewThreadInput!) {
    createReviewThread(input: $input) {
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

interface ReviewChangesViewProps {
  reviewId: string;
  snapshotId: string;
  files: ReviewFile[];
  threads: ReviewThreadType[];
  onRefresh(): void;
}

export function ReviewChangesView({
  reviewId,
  snapshotId,
  files,
  threads,
  onRefresh,
}: ReviewChangesViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const selection = useReviewUiStore((state) => state.byReviewId[reviewId]);
  const patchUi = useReviewUiStore((state) => state.patch);
  const toggleFileCollapsed = useReviewUiStore((state) => state.toggleFileCollapsed);
  const [composer, setComposer] = useState<ReviewComposerTarget | null>(null);
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const requestedFilePath = selection?.requestedFilePath ?? null;
  useEffect(() => {
    if (!requestedFilePath) return;
    const target = scrollRef.current?.querySelector(
      `[data-review-file="${CSS.escape(requestedFilePath)}"]`,
    );
    target?.scrollIntoView({ block: "start", behavior: "smooth" });
    patchUi(reviewId, { requestedFilePath: null });
  }, [patchUi, requestedFilePath, reviewId]);

  // Scrolling the continuous diff is what tells the shared sidebar which file is in view.
  const activeFilePath = selection?.activeFilePath ?? null;
  const handleScroll = useCallback(() => {
    const container = scrollRef.current;
    if (!container) return;
    const top = container.getBoundingClientRect().top;
    let next: string | null = null;
    for (const element of container.querySelectorAll<HTMLElement>("[data-review-file]")) {
      if (element.getBoundingClientRect().top - top <= 48)
        next = element.dataset.reviewFile ?? null;
    }
    if (next && next !== activeFilePath) patchUi(reviewId, { activeFilePath: next });
  }, [activeFilePath, patchUi, reviewId]);

  const openComposer = useCallback(
    (kind: ReviewComposerTarget["kind"], scope: ReviewComposerTarget["scope"]) =>
      (anchor: ReviewLineSelection) => {
        setBody("");
        setComposer({ kind, scope, anchor });
      },
    [],
  );

  const submit = async () => {
    if (!composer || !body.trim()) return;
    setSubmitting(true);
    const anchor = { snapshotId, ...composer.anchor };
    try {
      if (composer.kind === "comment") {
        await mutateReview(CREATE_THREAD, {
          input: { reviewId, snapshotId, scope: composer.scope, body: body.trim(), anchor },
        });
        toast.success("Comment saved in Trace");
      } else {
        await mutateReview(ENQUEUE_INQUIRY, {
          input: {
            reviewId,
            snapshotId,
            sourceKind: "diff_anchor",
            question: body.trim(),
            anchor,
            context: {
              selectedText: composer.anchor.selectedText,
              surroundingContext: composer.anchor.context,
            },
          },
        });
        toast.success("Question added to Review Chat");
      }
      setBody("");
      setComposer(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Review action failed");
    } finally {
      setSubmitting(false);
    }
  };

  if (files.length === 0)
    return (
      <ReviewEmptyState
        title="No changed files"
        description="The PR head matches its base. Push a commit, then refresh."
        actionLabel="Refresh"
        onAction={onRefresh}
      />
    );

  const collapsed = selection?.collapsedFilePaths ?? [];
  return (
    <div className="relative flex min-h-0 min-w-0 flex-1">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="native-scrollbar flex min-w-0 flex-1 flex-col gap-4 overflow-y-auto bg-[#141414] px-[18px] pb-10 pt-4"
      >
        {files.map((file) => (
          <ReviewFileDiff
            key={file.path}
            snapshotId={snapshotId}
            file={file}
            threads={threads}
            collapsed={collapsed.includes(file.path)}
            highlight={selection?.highlight ?? null}
            onToggleCollapsed={() => toggleFileCollapsed(reviewId, file.path)}
            onComment={openComposer("comment", "line")}
            onAsk={openComposer("ask", "line")}
          />
        ))}
      </div>
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
