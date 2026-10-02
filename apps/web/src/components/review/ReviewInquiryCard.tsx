import { useState } from "react";
import { gql } from "@urql/core";
import { useEntityField, useEntityStore } from "@trace/client-core";
import { useShallow } from "zustand/react/shallow";
import { CheckCircle2, ChevronDown, Trash2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useReviewUiStore } from "../../stores/review-ui";
import { mutateReview } from "./review-operations";
import { inquiryConversationRoot } from "./review-inquiry";
import { ReviewInquiryTurn } from "./ReviewInquiryTurn";
import { ReviewInquiryFollowUp } from "./ReviewInquiryFollowUp";

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
      <div className="flex max-w-[720px] items-center gap-2 rounded-[8px] border border-[var(--th-review-ai)]/20 bg-[var(--th-review-ai)]/[0.04] px-3 py-2 text-xs">
        <Sparkles size={11} className="shrink-0 text-[var(--th-review-ai-light)]" />
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
          className="flex shrink-0 items-center gap-1 text-[11px] font-medium text-[var(--th-review-ai-light)] hover:text-[var(--th-review-ai-lighter)]"
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
    <article className="max-w-[720px] overflow-hidden rounded-[9px] border border-[var(--th-review-ai)]/30 bg-[var(--th-review-ai)]/[0.055] shadow-[inset_2px_0_0_rgba(167,139,250,.45)]">
      <div className="flex gap-2.5 p-3.5">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[var(--th-review-ai)]/20 text-[var(--th-review-ai-light)]">
          <Sparkles size={12} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {conversationIds.map((id, index) => (
            <div
              key={id}
              className={index > 0 ? "border-t border-[var(--th-review-ai)]/20 pt-3" : undefined}
            >
              <ReviewInquiryTurn
                inquiryId={id}
                queuedAheadCount={index === 0 ? queuedAheadCount : undefined}
                blockerLabel={index === 0 ? blockerLabel : undefined}
              />
            </div>
          ))}
          {finished ? (
            <ReviewInquiryFollowUp inquiryId={conversationIds[conversationIds.length - 1]!} />
          ) : null}
          <div className="mt-0.5 flex items-center justify-end gap-3 border-t border-[var(--th-review-ai)]/15 pt-2">
            <button
              type="button"
              onClick={() => deleteInquiry(inquiryId)}
              className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--th-review-text-dim)] hover:text-[var(--th-heading)]"
            >
              <Trash2 size={11} /> Delete
            </button>
            {finished ? (
              <button
                type="button"
                disabled={resolving}
                onClick={() => void resolve()}
                className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--th-review-ai-light)] hover:text-[var(--th-review-ai-lighter)] disabled:opacity-50"
              >
                <CheckCircle2 size={11} /> {resolved ? "Reopen" : "Resolve"}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}
