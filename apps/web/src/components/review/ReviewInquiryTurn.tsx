import { useShallow } from "zustand/react/shallow";
import { inquiriesQueuedAhead, inquiryQueueLabel } from "./review-inquiry";
import { useEntityField, useEntityStore } from "@trace/client-core";
import { ChevronRight, Clock3, LoaderCircle } from "lucide-react";
import { ReviewThreadBody } from "./ReviewThreadBody";
import { AccordionItem, AccordionTrigger, AccordionContent } from "../ui/accordion";

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
    <AccordionItem value={inquiryId} className="border-[var(--th-review-edge)]">
      <AccordionTrigger className="min-w-0 items-center justify-start gap-3 rounded-none border-0 px-4 py-3 hover:no-underline **:data-[slot=accordion-trigger-icon]:hidden!">
        <ChevronRight
          size={13}
          aria-hidden="true"
          className="shrink-0 text-muted-foreground group-aria-expanded/accordion-trigger:rotate-90"
        />
        <span className="min-w-0 shrink-0 max-w-[65%] truncate text-[13px] font-semibold text-[var(--th-review-text)] group-aria-expanded/accordion-trigger:max-w-full group-aria-expanded/accordion-trigger:shrink group-aria-expanded/accordion-trigger:whitespace-normal [overflow-wrap:anywhere]">
          {question}
        </span>
        <span className="min-w-0 flex-1 truncate text-[13px] font-normal text-[var(--th-review-text-dim)] group-aria-expanded/accordion-trigger:hidden">
          {state === "completed"
            ? answer
            : state === "running"
              ? "Thinking…"
              : state === "queued"
                ? "Queued"
                : state === "failed"
                  ? error
                  : "Question cancelled."}
        </span>
      </AccordionTrigger>
      <AccordionContent className="flex flex-col gap-2 pb-3 pl-11 pr-4 [overflow-wrap:anywhere]">
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
          answer ? (
            <ReviewThreadBody body={answer} snapshotId={snapshotId} filePath={anchorFilePath} />
          ) : (
            <p className="m-0 text-xs text-muted-foreground">Answer completed.</p>
          )
        ) : null}

        {state === "cancelled" ? (
          <p className="m-0 text-xs text-muted-foreground">Question cancelled.</p>
        ) : null}
        {state === "failed" ? (
          <p className="m-0 text-[11px] text-[var(--th-review-danger-light)]">
            {error ?? "Trace AI could not answer this question."}
          </p>
        ) : null}
      </AccordionContent>
    </AccordionItem>
  );
}
