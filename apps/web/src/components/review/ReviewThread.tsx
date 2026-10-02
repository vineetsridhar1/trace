import { useState } from "react";
import { gql } from "@urql/core";
import { useEntityField } from "@trace/client-core";
import { CheckCircle2, ChevronDown, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { mutateReview } from "./review-operations";
import { useReviewUiStore } from "../../stores/review-ui";
import { ReviewThreadReply } from "./ReviewThreadReply";
import { ReviewThreadContent } from "./ReviewThreadContent";

const RESOLVE = gql`
  mutation ResolveReviewThread($threadId: ID!, $resolved: Boolean!) {
    resolveReviewThread(threadId: $threadId, resolved: $resolved) {
      id
    }
  }
`;

export function ReviewThread({
  threadId,
  onAsk,
}: {
  threadId: string;
  onAsk?(threadId: string): void;
}) {
  const reviewId = useEntityField("reviewThreads", threadId, "reviewId") ?? "";
  const resolvedAt = useEntityField("reviewThreads", threadId, "resolvedAt");
  const comments = useEntityField("reviewThreads", threadId, "comments");
  const summary = comments?.find((comment) => !comment.deletedAt)?.body ?? "Comment thread";
  const collapsed = useReviewUiStore(
    (store) =>
      store.byReviewId[reviewId]?.threadCollapsedOverrides[threadId] ?? Boolean(resolvedAt),
  );
  const deleted = useReviewUiStore((store) => store.deletedThreadIds.includes(threadId));
  const deleteThread = useReviewUiStore((store) => store.deleteThread);
  const setCollapsed = useReviewUiStore((store) => store.setThreadCollapsed);
  const toggleCollapsed = useReviewUiStore((store) => store.toggleThreadCollapsed);
  const [resolving, setResolving] = useState(false);

  const resolve = async () => {
    setResolving(true);
    try {
      await mutateReview(RESOLVE, { threadId, resolved: !resolvedAt });
      setCollapsed(reviewId, threadId, !resolvedAt);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update comment thread");
    } finally {
      setResolving(false);
    }
  };

  if (deleted) return null;
  if (collapsed)
    return (
      <div className="flex max-w-[720px] items-center gap-2 rounded-[8px] border border-[var(--th-edge-strong)] bg-[var(--th-raised)] px-3 py-2 text-xs">
        <span className="min-w-0 flex-1 truncate text-[var(--th-review-text-soft)]">{summary}</span>
        {resolvedAt ? (
          <span className="shrink-0 text-[10.5px] text-[var(--th-review-success-light)]">
            Resolved
          </span>
        ) : null}
        <button
          type="button"
          onClick={() => toggleCollapsed(reviewId, threadId, Boolean(resolvedAt))}
          className="flex shrink-0 items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
        >
          <ChevronDown size={11} /> Show
        </button>
        <button
          type="button"
          aria-label="Delete comment thread"
          onClick={() => deleteThread(threadId)}
          className="text-muted-foreground hover:text-destructive"
        >
          <Trash2 size={11} />
        </button>
      </div>
    );
  return (
    <article className="max-w-[720px] overflow-hidden rounded-[9px] border border-[var(--th-edge-strong)] bg-[var(--th-raised)]">
      <ReviewThreadContent threadId={threadId} />
      <div className="flex items-center gap-2 border-t border-[var(--th-edge)] py-2.5 pl-12 pr-3.5 text-xs font-medium">
        <ReviewThreadReply threadId={threadId} />
        {onAsk ? (
          <button
            type="button"
            onClick={() => onAsk(threadId)}
            className="flex h-7 items-center gap-1.5 rounded-md border border-[var(--th-review-ai)]/30 px-2.5 text-[var(--th-review-ai-light)] hover:bg-[var(--th-review-ai)]/10"
          >
            <Sparkles size={11} /> Ask session
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => deleteThread(threadId)}
          className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--th-review-text-dim)] hover:text-[var(--th-heading)]"
        >
          <Trash2 size={11} /> Delete
        </button>
        <button
          type="button"
          disabled={resolving}
          onClick={() => void resolve()}
          className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--th-heading)] hover:text-primary disabled:opacity-50"
        >
          <CheckCircle2 size={11} /> {resolvedAt ? "Reopen" : "Resolve"}
        </button>
      </div>
    </article>
  );
}
