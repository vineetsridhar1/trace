import { useShallow } from "zustand/react/shallow";
import { inquiriesQueuedAhead, inquiryQueueLabel } from "./review-inquiry";
import { useEntityField, useEntityStore } from "@trace/client-core";
import { Clock3, LoaderCircle, Sparkles } from "lucide-react";
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
  const answer = useEntityField("reviewInquiries", inquiryId, "responseMessage")?.text?.trim();
  const anchorFilePath =
    anchor &&
    typeof anchor === "object" &&
    !Array.isArray(anchor) &&
    typeof anchor.filePath === "string"
      ? anchor.filePath
      : undefined;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-end">
        <div className="max-w-[90%] rounded-xl rounded-br-sm border border-[var(--th-review-comment)]/35 bg-[var(--th-accent)]/15 px-3 py-2 [overflow-wrap:anywhere]">
          <ReviewThreadBody body={question} />
        </div>
      </div>

      {state === "queued" ? (
        <div className="flex items-start gap-2 rounded-md border border-[var(--th-review-edge)] bg-[var(--th-surface-deep)] px-2.5 py-2 text-[11px] text-[var(--th-primary)]">
          <Clock3 size={12} className="mt-0.5 shrink-0 text-[var(--th-review-comment)]" />
          {blockerLabel ? (
            <span className="min-w-0">
              Queued behind {queuedAheadCount} request{queuedAheadCount === 1 ? "" : "s"}
              <span className="mx-1 text-[var(--th-faint)]">·</span>
              <span className="text-[var(--th-review-comment)]">{blockerLabel}</span>
            </span>
          ) : (
            <span>Next in the Review Chat queue</span>
          )}
        </div>
      ) : null}

      {state === "running" ? (
        <div className="flex items-center gap-2 text-[11px] text-[var(--th-review-comment)]">
          <LoaderCircle size={12} className="animate-spin" />
          Thinking…
        </div>
      ) : null}

      {state === "completed" ? (
        <div className="flex items-start gap-2.5 py-1 [overflow-wrap:anywhere]">
          <Sparkles
            size={14}
            aria-hidden="true"
            className="mt-1 shrink-0 text-[var(--th-review-comment)]"
          />
          <div className="min-w-0 flex-1">
            {answer ? (
              <ReviewThreadBody body={answer} snapshotId={snapshotId} filePath={anchorFilePath} />
            ) : (
              <p className="m-0 text-xs text-muted-foreground">Answer completed.</p>
            )}
          </div>
        </div>
      ) : null}

      {state === "cancelled" ? (
        <p className="m-0 text-xs text-muted-foreground">Question cancelled.</p>
      ) : null}
      {state === "failed" ? (
        <p className="m-0 text-[11px] text-[var(--th-review-danger-light)]">
          {error ?? "Trace AI could not answer this question."}
        </p>
      ) : null}
    </div>
  );
}
