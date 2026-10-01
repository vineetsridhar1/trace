import { useState } from "react";
import { gql } from "@urql/core";
import { useEntityField } from "@trace/client-core";
import { CheckCircle2, ChevronDown, Clock3, EyeOff, LoaderCircle, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { cn } from "../../lib/utils";
import { useReviewUiStore } from "../../stores/review-ui";
import { mutateReview } from "./review-operations";
import { inquiryPresentation } from "./review-states";
import { ReviewThreadBody } from "./ReviewThreadBody";

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
  /** What the queue is waiting on, when this question is not next. */
  blockerLabel: string | null;
}) {
  const reviewId = useEntityField("reviewInquiries", inquiryId, "reviewId") ?? "";
  const state = useEntityField("reviewInquiries", inquiryId, "state") ?? "queued";
  const question = useEntityField("reviewInquiries", inquiryId, "question") ?? "";
  const error = useEntityField("reviewInquiries", inquiryId, "error");
  const resolvedAt = useEntityField("reviewInquiries", inquiryId, "resolvedAt");
  const answer = useEntityField("reviewInquiries", inquiryId, "responseMessage")?.text?.trim();
  const presentation = inquiryPresentation(state, queuedAheadCount === 0);
  const collapsed = useReviewUiStore(
    (store) => store.byReviewId[reviewId]?.collapsedInquiryIds.includes(inquiryId) ?? false,
  );
  const toggleCollapsed = useReviewUiStore((store) => store.toggleInquiryCollapsed);
  const [resolving, setResolving] = useState(false);
  const finished = state !== "queued" && state !== "running";

  const resolve = async () => {
    setResolving(true);
    try {
      await mutateReview(RESOLVE_INQUIRY, { inquiryId, resolved: !resolvedAt });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update AI conversation");
    } finally {
      setResolving(false);
    }
  };

  if (collapsed) {
    return (
      <div className="flex max-w-[720px] items-center gap-2 rounded-[8px] border border-[var(--th-review-ai)]/20 bg-[var(--th-review-ai)]/[0.04] px-3 py-2 text-xs">
        <Sparkles size={11} className="shrink-0 text-[var(--th-review-ai-light)]" />
        <span className="min-w-0 flex-1 truncate text-[var(--th-review-text-soft)]">
          {question}
        </span>
        {resolvedAt ? (
          <span className="shrink-0 text-[10.5px] text-[var(--th-review-success-light)]">
            Resolved
          </span>
        ) : null}
        <button
          type="button"
          onClick={() => toggleCollapsed(reviewId, inquiryId)}
          className="flex shrink-0 items-center gap-1 text-[11px] font-medium text-[var(--th-review-ai-light)] hover:text-[var(--th-review-ai-lighter)]"
        >
          <ChevronDown size={11} /> Show
        </button>
      </div>
    );
  }

  return (
    <article className="max-w-[720px] overflow-hidden rounded-[9px] border border-[var(--th-review-ai)]/30 bg-[var(--th-review-ai)]/[0.055] shadow-[inset_2px_0_0_rgba(167,139,250,.45)]">
      <div className="flex gap-2.5 p-3.5">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[var(--th-review-ai)]/20 text-[var(--th-review-ai-light)]">
          <Sparkles size={12} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex items-center gap-2 text-xs font-medium">
            <span className="text-[var(--th-review-ai-lighter)]">You asked Trace AI</span>
            <span
              className={cn("ml-auto flex items-center gap-1.5 text-[11px]", presentation.text)}
            >
              <span className={cn("size-1.5 rounded-full", presentation.dot)} />
              {resolvedAt ? "Resolved" : state === "running" ? "Thinking…" : presentation.label}
            </span>
          </div>
          <ReviewThreadBody body={question} />

          {state === "queued" ? (
            <div className="flex items-start gap-2 rounded-md border border-[var(--th-review-ai)]/15 bg-black/15 px-2.5 py-2 text-[11px] text-[var(--th-primary)]">
              <Clock3 size={12} className="mt-0.5 shrink-0 text-[var(--th-review-ai)]" />
              {blockerLabel ? (
                <span className="min-w-0">
                  Queued behind {queuedAheadCount} request{queuedAheadCount === 1 ? "" : "s"}
                  <span className="mx-1 text-[var(--th-faint)]">·</span>
                  <span className="text-[var(--th-review-ai-light)]">{blockerLabel}</span>
                </span>
              ) : (
                <span>Next in the Review Chat queue</span>
              )}
            </div>
          ) : null}

          {state === "running" ? (
            <div className="flex items-center gap-2 text-[11px] text-[var(--th-review-ai-light)]">
              <LoaderCircle size={12} className="animate-spin" />
              Reading the change and preparing an answer…
            </div>
          ) : null}

          {state === "completed" ? (
            <div className="mt-0.5 border-t border-[var(--th-review-ai)]/20 pt-2.5">
              <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-[var(--th-review-ai-light)]">
                <Sparkles size={11} /> Trace AI
              </div>
              {answer ? (
                <ReviewThreadBody body={answer} />
              ) : (
                <p className="m-0 text-xs text-muted-foreground">Answer completed.</p>
              )}
            </div>
          ) : null}

          {state === "failed" ? (
            <p className="m-0 text-[11px] text-[var(--th-review-danger-light)]">
              {error ?? "Trace AI could not answer this question."}
            </p>
          ) : null}

          <div className="mt-0.5 flex items-center justify-end gap-3 border-t border-[var(--th-review-ai)]/15 pt-2">
            <button
              type="button"
              onClick={() => toggleCollapsed(reviewId, inquiryId)}
              className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--th-review-text-dim)] hover:text-[var(--th-heading)]"
            >
              <EyeOff size={11} /> Hide
            </button>
            {finished ? (
              <button
                type="button"
                disabled={resolving}
                onClick={() => void resolve()}
                className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--th-review-ai-light)] hover:text-[var(--th-review-ai-lighter)] disabled:opacity-50"
              >
                <CheckCircle2 size={11} /> {resolvedAt ? "Unresolve" : "Resolve"}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}
