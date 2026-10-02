import { useShallow } from "zustand/react/shallow";
import { inquiriesQueuedAhead, inquiryQueueLabel } from "./review-inquiry";
import { useEntityField, useEntityStore } from "@trace/client-core";
import { Clock3, LoaderCircle, Sparkles } from "lucide-react";
import { cn } from "../../lib/utils";
import { inquiryPresentation } from "./review-states";
import { ReviewThreadBody } from "./ReviewThreadBody";

export function ReviewInquiryTurn({
  inquiryId,
  queuedAheadCount: requestedCount,
  blockerLabel: requestedBlocker,
}: {
  inquiryId: string;
  queuedAheadCount?: number;
  blockerLabel?: string | null;
}) {
  const [aheadCount, aheadLabel] = useEntityStore(
    useShallow((store) => {
      const inquiry = store.reviewInquiries[inquiryId];
      if (!inquiry) return [0, null] as const;
      const ahead = inquiriesQueuedAhead(
        inquiry,
        Object.values(store.reviewInquiries).filter(
          (candidate) => candidate.reviewId === inquiry.reviewId,
        ),
      );
      return [ahead.length, ahead[0] ? inquiryQueueLabel(ahead[0]) : null] as const;
    }),
  );
  const queuedAheadCount = requestedCount ?? aheadCount;
  const blockerLabel = requestedBlocker === undefined ? aheadLabel : requestedBlocker;
  const state = useEntityField("reviewInquiries", inquiryId, "state") ?? "queued";
  const question = useEntityField("reviewInquiries", inquiryId, "question") ?? "";
  const snapshotId = useEntityField("reviewInquiries", inquiryId, "snapshotId") ?? "";
  const anchor = useEntityField("reviewInquiries", inquiryId, "anchor");
  const error = useEntityField("reviewInquiries", inquiryId, "error");
  const resolvedAt = useEntityField("reviewInquiries", inquiryId, "resolvedAt");
  const answer = useEntityField("reviewInquiries", inquiryId, "responseMessage")?.text?.trim();
  const anchorFilePath =
    anchor &&
    typeof anchor === "object" &&
    !Array.isArray(anchor) &&
    typeof anchor.filePath === "string"
      ? anchor.filePath
      : undefined;
  const presentation = inquiryPresentation(state, queuedAheadCount === 0);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 text-xs font-medium">
        <span className="text-[var(--th-review-ai-lighter)]">You asked Trace AI</span>
        <span className={cn("ml-auto flex items-center gap-1.5 text-[11px]", presentation.text)}>
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
            <ReviewThreadBody body={answer} snapshotId={snapshotId} filePath={anchorFilePath} />
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
    </div>
  );
}
