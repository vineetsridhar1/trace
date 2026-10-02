import { useMemo } from "react";
import { useEntityField } from "@trace/client-core";
import { Accordion } from "../ui/accordion";
import { useReviewUiStore } from "../../stores/review-ui";
import { ReviewInquiryTurn } from "./ReviewInquiryTurn";
import { ReviewInquiryFollowUp } from "./ReviewInquiryFollowUp";

export function ReviewInquiryConversation({
  inquiryId,
  inquiryIds,
  finished,
  queuedAheadCount,
  blockerLabel,
}: {
  inquiryId: string;
  inquiryIds: string[];
  finished: boolean;
  queuedAheadCount: number;
  blockerLabel: string | null;
}) {
  const reviewId = useEntityField("reviewInquiries", inquiryId, "reviewId") ?? "";
  const expandedOverride = useReviewUiStore(
    (store) => store.byReviewId[reviewId]?.inquiryExpandedTurnOverrides[inquiryId],
  );
  const setExpanded = useReviewUiStore((store) => store.setInquiryExpandedTurn);
  const latestId = inquiryIds[inquiryIds.length - 1]!;
  const expandedId = expandedOverride === undefined ? latestId : expandedOverride;
  const value = useMemo(() => (expandedId ? [expandedId] : []), [expandedId]);
  return (
    <>
      <Accordion
        value={value}
        onValueChange={(ids) =>
          setExpanded(reviewId, inquiryId, typeof ids[0] === "string" ? ids[0] : null)
        }
      >
        {inquiryIds.map((id, index) => (
          <ReviewInquiryTurn
            key={id}
            inquiryId={id}
            queuedAheadCount={index === 0 ? queuedAheadCount : undefined}
            blockerLabel={index === 0 ? blockerLabel : undefined}
          />
        ))}
      </Accordion>
      {finished ? (
        <div className="px-3 pb-3">
          <ReviewInquiryFollowUp
            inquiryId={latestId}
            onSent={() => setExpanded(reviewId, inquiryId, undefined)}
          />
        </div>
      ) : null}
    </>
  );
}
