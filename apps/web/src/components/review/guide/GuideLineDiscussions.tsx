import { useMemo } from "react";
import { useEntityStore } from "@trace/client-core";
import { useReviewUiStore } from "../../../stores/review-ui";
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
  const deletedIds = useReviewUiStore((store) => store.deletedInquiryIds);
  const visibleIds = inquiryIds?.filter((id) => !deletedIds.includes(id));
  const table = useEntityStore((state) => state.reviewInquiries);
  const allInquiries = useMemo(
    () => Object.values(table).filter((inquiry) => inquiry.reviewId === reviewId),
    [table, reviewId],
  );
  if (!threadIds?.length && !visibleIds?.length) return null;
  return (
    <div className="flex flex-col gap-2 border-y border-border bg-[var(--th-review-canvas)] p-3 font-sans leading-normal">
      {threadIds?.map((id) => (
        <ReviewThread key={id} threadId={id} />
      ))}
      {visibleIds?.map((id) => {
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
