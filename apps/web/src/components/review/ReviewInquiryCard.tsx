import { useState } from "react";
import { gql } from "@urql/core";
import type { ReviewInquiry } from "@trace/gql";
import { CheckCircle2, ChevronDown, Clock3, EyeOff, LoaderCircle, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { cn } from "../../lib/utils";
import { useReviewUiStore } from "../../stores/review-ui";
import { mutateReview } from "./review-operations";
import { inquiryQueueLabel } from "./review-inquiry";
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
  inquiry,
  queuedAhead,
}: {
  inquiry: ReviewInquiry;
  queuedAhead: ReviewInquiry[];
}) {
  const presentation = inquiryPresentation(inquiry.state, queuedAhead.length === 0);
  const answer = inquiry.responseMessage?.text?.trim();
  const blocker = queuedAhead[0];
  const collapsed = useReviewUiStore(
    (state) =>
      state.byReviewId[inquiry.reviewId]?.collapsedInquiryIds.includes(inquiry.id) ?? false,
  );
  const toggleCollapsed = useReviewUiStore((state) => state.toggleInquiryCollapsed);
  const [resolving, setResolving] = useState(false);
  const finished = inquiry.state !== "queued" && inquiry.state !== "running";

  const resolve = async () => {
    setResolving(true);
    try {
      await mutateReview(RESOLVE_INQUIRY, {
        inquiryId: inquiry.id,
        resolved: !inquiry.resolvedAt,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update AI conversation");
    } finally {
      setResolving(false);
    }
  };

  if (collapsed) {
    return (
      <div className="flex max-w-[720px] items-center gap-2 rounded-[8px] border border-[#a78bfa]/20 bg-[#a78bfa]/[0.04] px-3 py-2 text-xs">
        <Sparkles size={11} className="shrink-0 text-[#c4b5fd]" />
        <span className="min-w-0 flex-1 truncate text-[#b8b8c2]">{inquiry.question}</span>
        {inquiry.resolvedAt ? (
          <span className="shrink-0 text-[10.5px] text-[#6ee7b7]">Resolved</span>
        ) : null}
        <button
          type="button"
          onClick={() => toggleCollapsed(inquiry.reviewId, inquiry.id)}
          className="flex shrink-0 items-center gap-1 text-[11px] font-medium text-[#c4b5fd] hover:text-[#ddd6fe]"
        >
          <ChevronDown size={11} /> Show
        </button>
      </div>
    );
  }

  return (
    <article className="max-w-[720px] overflow-hidden rounded-[9px] border border-[#a78bfa]/30 bg-[#a78bfa]/[0.055] shadow-[inset_2px_0_0_rgba(167,139,250,.45)]">
      <div className="flex gap-2.5 p-3.5">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[#a78bfa]/20 text-[#c4b5fd]">
          <Sparkles size={12} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex items-center gap-2 text-xs font-medium">
            <span className="text-[#ddd6fe]">You asked Trace AI</span>
            <span
              className={cn("ml-auto flex items-center gap-1.5 text-[11px]", presentation.text)}
            >
              <span className={cn("size-1.5 rounded-full", presentation.dot)} />
              {inquiry.resolvedAt
                ? "Resolved"
                : inquiry.state === "running"
                  ? "Thinking…"
                  : presentation.label}
            </span>
          </div>
          <ReviewThreadBody body={inquiry.question} />

          {inquiry.state === "queued" ? (
            <div className="flex items-start gap-2 rounded-md border border-[#a78bfa]/15 bg-black/15 px-2.5 py-2 text-[11px] text-[#a1a1aa]">
              <Clock3 size={12} className="mt-0.5 shrink-0 text-[#a78bfa]" />
              {blocker ? (
                <span className="min-w-0">
                  Queued behind {queuedAhead.length} request{queuedAhead.length === 1 ? "" : "s"}
                  <span className="mx-1 text-[#52525b]">·</span>
                  <span className="text-[#c4b5fd]">{inquiryQueueLabel(blocker)}</span>
                </span>
              ) : (
                <span>Next in the Review Chat queue</span>
              )}
            </div>
          ) : null}

          {inquiry.state === "running" ? (
            <div className="flex items-center gap-2 text-[11px] text-[#c4b5fd]">
              <LoaderCircle size={12} className="animate-spin" />
              Reading the change and preparing an answer…
            </div>
          ) : null}

          {inquiry.state === "completed" ? (
            <div className="mt-0.5 border-t border-[#a78bfa]/20 pt-2.5">
              <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-[#c4b5fd]">
                <Sparkles size={11} /> Trace AI
              </div>
              {answer ? (
                <ReviewThreadBody body={answer} />
              ) : (
                <p className="m-0 text-xs text-muted-foreground">Answer completed.</p>
              )}
            </div>
          ) : null}

          {inquiry.state === "failed" ? (
            <p className="m-0 text-[11px] text-[#fca5a5]">
              {inquiry.error ?? "Trace AI could not answer this question."}
            </p>
          ) : null}

          <div className="mt-0.5 flex items-center justify-end gap-3 border-t border-[#a78bfa]/15 pt-2">
            <button
              type="button"
              onClick={() => toggleCollapsed(inquiry.reviewId, inquiry.id)}
              className="flex items-center gap-1.5 text-[11px] font-medium text-[#8b8b95] hover:text-[#d4d4d8]"
            >
              <EyeOff size={11} /> Hide
            </button>
            {finished ? (
              <button
                type="button"
                disabled={resolving}
                onClick={() => void resolve()}
                className="flex items-center gap-1.5 text-[11px] font-medium text-[#c4b5fd] hover:text-[#ddd6fe] disabled:opacity-50"
              >
                <CheckCircle2 size={11} /> {inquiry.resolvedAt ? "Unresolve" : "Resolve"}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}
