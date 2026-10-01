import type { ReviewInquiry } from "@trace/gql";
import { Clock3, LoaderCircle, Sparkles } from "lucide-react";
import { cn } from "../../lib/utils";
import { inquiryQueueLabel } from "./review-inquiry";
import { inquiryPresentation } from "./review-states";
import { ReviewThreadBody } from "./ReviewThreadBody";

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
              {inquiry.state === "running" ? "Thinking…" : presentation.label}
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
        </div>
      </div>
    </article>
  );
}
