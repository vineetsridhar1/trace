import { useState } from "react";
import { gql } from "@urql/core";
import { useEntityField, useEntityStore } from "@trace/client-core";
import { useShallow } from "zustand/react/shallow";
import { ChevronDown, Trash2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useReviewUiStore } from "../../stores/review-ui";
import { mutateReview } from "./review-operations";
import { inquiryConversationRoot } from "./review-inquiry";
import { ReviewInquiryConversation } from "./ReviewInquiryConversation";
import { ReviewInquiryHeader } from "./ReviewInquiryHeader";

const RESOLVE_INQUIRY = gql`
  mutation ResolveReviewInquiry($inquiryId: ID!, $resolved: Boolean!) {
    resolveReviewInquiry(inquiryId: $inquiryId, resolved: $resolved) {
      id
    }
  }
`;

export function ReviewInquiryCard({
  inquiryId,
  queuedAheadCount,
  blockerLabel,
}: {
  inquiryId: string;
  queuedAheadCount: number;
  blockerLabel: string | null;
}) {
  const reviewId = useEntityField("reviewInquiries", inquiryId, "reviewId") ?? "";
  const question = useEntityField("reviewInquiries", inquiryId, "question") ?? "";
  const conversationIds = useEntityStore(
    useShallow((state) =>
      Object.values(state.reviewInquiries)
        .filter(
          (inquiry) =>
            inquiry.reviewId === reviewId &&
            inquiryConversationRoot(inquiry, state.reviewInquiries) === inquiryId,
        )
        .sort((a, b) => a.position - b.position)
        .map((inquiry) => inquiry.id),
    ),
  );
  const finished = useEntityStore((state) =>
    conversationIds.every((id) => {
      const status = state.reviewInquiries[id]?.state;
      return status !== "queued" && status !== "running";
    }),
  );
  const resolved = useEntityStore((state) =>
    conversationIds.every((id) => Boolean(state.reviewInquiries[id]?.resolvedAt)),
  );
  const collapsed = useReviewUiStore(
    (store) => store.byReviewId[reviewId]?.inquiryCollapsedOverrides[inquiryId] ?? resolved,
  );
  const deleted = useReviewUiStore((store) => store.deletedInquiryIds.includes(inquiryId));
  const deleteInquiry = useReviewUiStore((store) => store.deleteInquiry);
  const setCollapsed = useReviewUiStore((store) => store.setInquiryCollapsed);
  const toggleCollapsed = useReviewUiStore((store) => store.toggleInquiryCollapsed);
  const [resolving, setResolving] = useState(false);
  const resolve = async () => {
    setResolving(true);
    try {
      await Promise.all(
        conversationIds.map((id) =>
          mutateReview(RESOLVE_INQUIRY, { inquiryId: id, resolved: !resolved }),
        ),
      );
      setCollapsed(reviewId, inquiryId, !resolved);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update AI conversation");
    } finally {
      setResolving(false);
    }
  };
  if (deleted || conversationIds.length === 0) return null;
  if (collapsed)
    return (
      <div className="flex max-w-[720px] items-center gap-2 rounded-[8px] border border-[var(--th-review-edge-strong)] bg-[var(--th-raised)] px-3 py-2 text-xs">
        <Sparkles size={11} className="shrink-0 text-[var(--th-review-comment)]" />
        <span className="min-w-0 flex-1 truncate text-[var(--th-review-text-soft)]">
          {question}
        </span>
        {resolved ? (
          <span className="shrink-0 text-[10.5px] text-[var(--th-review-success-light)]">
            Resolved
          </span>
        ) : null}
        <button
          type="button"
          onClick={() => toggleCollapsed(reviewId, inquiryId, resolved)}
          className="flex shrink-0 items-center gap-1 text-[11px] font-medium text-[var(--th-review-comment)] hover:text-[var(--th-review-text)]"
        >
          <ChevronDown size={11} /> Show
        </button>
        <button
          type="button"
          aria-label="Delete AI conversation"
          onClick={() => deleteInquiry(inquiryId)}
          className="text-muted-foreground hover:text-destructive"
        >
          <Trash2 size={11} />
        </button>
      </div>
    );
  return (
    <article className="w-full max-w-[720px] overflow-hidden rounded-xl border border-[var(--th-review-edge-strong)] bg-[var(--th-raised)] shadow-sm">
      <ReviewInquiryHeader
        questionCount={conversationIds.length}
        finished={finished}
        resolved={resolved}
        resolving={resolving}
        onDelete={() => deleteInquiry(inquiryId)}
        onResolve={() => void resolve()}
      />
      <ReviewInquiryConversation
        inquiryId={inquiryId}
        inquiryIds={conversationIds}
        finished={finished}
        queuedAheadCount={queuedAheadCount}
        blockerLabel={blockerLabel}
      />
    </article>
  );
}
