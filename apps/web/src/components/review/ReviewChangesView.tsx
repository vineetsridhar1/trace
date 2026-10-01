import { useCallback, useState } from "react";
import { gql } from "@urql/core";
import type { ReviewFile, ReviewInquiry, ReviewThread as ReviewThreadType } from "@trace/gql";
import { toast } from "sonner";
import { ReviewVirtualFiles } from "./ReviewVirtualFiles";
import { ReviewEmptyState } from "./ReviewEmptyState";
import { ReviewInlineComposer, type ReviewComposerTarget } from "./ReviewInlineComposer";
import { mutateReview } from "./review-operations";
import { selectionRangeLabel, type ReviewLineSelection } from "./review-selection";

function composerLabel(scope: "line" | "file", anchor: ReviewLineSelection): string {
  const fileName = anchor.filePath.split("/").at(-1) ?? anchor.filePath;
  if (scope === "file") return `${fileName} · whole file`;
  return `${fileName} · ${selectionRangeLabel({
    side: anchor.side,
    start: anchor.startLine,
    end: anchor.endLine,
  })}`;
}

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
  title: string;
  description: string;
  pullRequestNumber: number;
  files: ReviewFile[];
  threads: ReviewThreadType[];
  inquiries: ReviewInquiry[];
  onRefresh(): void;
}

export function ReviewChangesView({
  reviewId,
  snapshotId,
  title,
  description,
  pullRequestNumber,
  files,
  threads,
  inquiries,
  onRefresh,
}: ReviewChangesViewProps) {
  const [composer, setComposer] = useState<ReviewComposerTarget | null>(null);
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const openComposer = useCallback(
    (kind: ReviewComposerTarget["kind"], scope: "line" | "file") =>
      (anchor: ReviewLineSelection) => {
        setBody("");
        setComposer({ kind, scope, anchor, label: composerLabel(scope, anchor) });
      },
    [],
  );

  const submit = async () => {
    if (!composer?.anchor || !body.trim()) return;
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

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 overflow-x-hidden">
      <ReviewVirtualFiles
        key={snapshotId}
        reviewId={reviewId}
        snapshotId={snapshotId}
        title={title}
        description={description}
        pullRequestNumber={pullRequestNumber}
        files={files}
        threads={threads}
        inquiries={inquiries}
        onComment={openComposer("comment", "line")}
        onAsk={openComposer("ask", "line")}
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
