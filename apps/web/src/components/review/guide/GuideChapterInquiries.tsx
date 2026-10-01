import { useMemo } from "react";
import { useEntityStore } from "@trace/client-core";
import type { ReviewInquiry } from "@trace/gql";
import { ReviewInquiryCard } from "../ReviewInquiryCard";
import { inquiriesQueuedAhead, inquiryQueueLabel } from "../review-inquiry";

export function GuideChapterInquiries({
  reviewId,
  guideId,
  snapshotId,
  chapterId,
}: {
  reviewId: string;
  guideId: string;
  snapshotId: string;
  chapterId: string;
}) {
  const table = useEntityStore((state) => state.reviewInquiries);
  const inquiries = useMemo(
    () =>
      (Object.values(table) as ReviewInquiry[]).filter((inquiry) => inquiry.reviewId === reviewId),
    [table, reviewId],
  );
  const chapterInquiries = useMemo(
    () =>
      inquiries
        .filter((inquiry) => {
          const context = inquiry.context;
          return (
            inquiry.sourceKind === "guide_anchor" &&
            inquiry.snapshotId === snapshotId &&
            context !== null &&
            typeof context === "object" &&
            !Array.isArray(context) &&
            context.guideChapterId === chapterId &&
            (!context.guideId || context.guideId === guideId)
          );
        })
        .sort((a, b) => a.position - b.position),
    [inquiries, snapshotId, chapterId, guideId],
  );

  if (chapterInquiries.length === 0) return null;
  return (
    <div className="flex min-w-0 flex-col gap-3" aria-label="Questions about this chapter">
      {chapterInquiries.map((inquiry) => {
        const ahead = inquiriesQueuedAhead(inquiry, inquiries);
        return (
          <ReviewInquiryCard
            key={inquiry.id}
            inquiryId={inquiry.id}
            queuedAheadCount={ahead.length}
            blockerLabel={ahead[0] ? inquiryQueueLabel(ahead[0]) : null}
          />
        );
      })}
    </div>
  );
}
