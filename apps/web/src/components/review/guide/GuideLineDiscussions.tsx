import { useMemo } from "react";
import { useEntityStore } from "@trace/client-core";
import { ReviewThread } from "../ReviewThread";
import { ReviewInquiryCard } from "../ReviewInquiryCard";
import { inquiriesQueuedAhead, inquiryQueueLabel } from "../review-inquiry";

export function GuideLineDiscussions({
  reviewId,
  threadIds,
  inquiryIds,
}: {
  reviewId: string;
  threadIds?: string[];
  inquiryIds?: string[];
}) {
  const table = useEntityStore((state) => state.reviewInquiries);
  const allInquiries = useMemo(
    () => Object.values(table).filter((inquiry) => inquiry.reviewId === reviewId),
    [table, reviewId],
  );
  return (
    <div className="flex flex-col gap-2 border-y border-border bg-[var(--th-review-canvas)] p-3 font-sans leading-normal">
      {threadIds?.map((id) => (
        <ReviewThread key={id} threadId={id} />
      ))}
      {inquiryIds?.map((id) => {
        const inquiry = table[id];
        if (!inquiry) return null;
        const ahead = inquiriesQueuedAhead(inquiry, allInquiries);
        return (
          <ReviewInquiryCard
            key={id}
            inquiryId={id}
            queuedAheadCount={ahead.length}
            blockerLabel={ahead[0] ? inquiryQueueLabel(ahead[0]) : null}
          />
        );
      })}
    </div>
  );
}
